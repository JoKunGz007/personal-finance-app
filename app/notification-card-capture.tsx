"use client";

import { useMemo, useRef, useState } from "react";
import { useResultBanner } from "@/app/result-banner";
import { encodeForReader, readImageWords, type ImageWordsRead } from "@/lib/browser/ocr-reader";
import { bangkokToday } from "@/lib/dates";
import { formatThb } from "@/lib/money";
import { paddedCrop, type Box } from "@/lib/slip-ocr";
import {
  NOTIFICATION_CARD_LAYOUTS,
  layoutForChannel,
  type CardDirection,
  type NotificationCardLayout
} from "@/lib/notification-card";
import {
  CARD_FIELDS,
  findCards,
  locateCardFields,
  type CardFieldName,
  type CardRegion
} from "@/lib/notification-card-ocr";
import { prefillCardFields } from "@/lib/notification-card-prefill";
import { notificationCardDateWindow } from "@/lib/notification-cards";
import {
  afterCapture,
  amountEntry,
  balanceEntry,
  bindPrintedDigits,
  cardChosen,
  cardsFound,
  captureRequest,
  changedFieldNames,
  chosenCard,
  cropsCut,
  directionCheck,
  emptyTyped,
  failedResult,
  offeredFieldNames,
  printedDateHint,
  readerFailed,
  readerRefused,
  startedReading,
  typedFromPrefill,
  type CardBindableAccount,
  type CardCrops,
  type CardNotes,
  type CardReading,
  type CardResult,
  type CardTyped
} from "@/lib/notification-card-form";
import { readError } from "@/lib/wire";

type Category = { id: string; name: string; archived: boolean };
type Channel = NotificationCardLayout["channel"];

// Same crop sizing as slip capture, and the same reason: an enlargement is only useful if it is
// legible on the phone the card is being read on.
const CROP_TARGET_WIDTH = 720;
const CROP_MAX_SCALE = 4;

/**
 * The one image both the reader and the crops work from.
 *
 * **They must be the same image, and this type is what stops them drifting apart.** The reader
 * returns a box in the coordinate space of whatever it read; a crop cut from a *different* image
 * with that box lands somewhere else entirely. Enlarging for the reader and cropping from the
 * original file would do exactly that, silently, and the symptom would be crops of the wrong rows
 * rather than an error. Nothing rescales anything now (`loadCardImage`), so the two cannot differ
 * — but the type stays the one value both go through, because that is what kept them together.
 */
type CardImage = { readonly source: ImageBitmap; readonly width: number; readonly height: number };

/**
 * Decodes the screenshot at its native size, which under Vision is all the reader wants.
 *
 * **The 2× enlargement is gone with the engine that needed it** (D-117, D-120). It was a tesseract
 * remedy: reading a card at 2× filled 70 of 100 fields against 62 at native size. Measured again
 * through the shipped Vision path over the same 12 screenshots, native size finds 25 of 25 cards
 * and offers 99 of 100 fields — the enlargement buys nothing and would cost up to four times the
 * bytes uploaded to a third party. Its lesson survives its mechanism: a measurement taken on slips
 * does not govern cards, which is what D-117 is remembered for.
 *
 * Keeping the image at native size also removes the coordinate-space hazard by construction. The
 * bytes sent to the reader and the pixels the crops are cut from are now the same image at the
 * same scale, so no box needs rescaling and none can silently land on the wrong row.
 */
async function loadCardImage(file: File): Promise<CardImage> {
  const bitmap = await createImageBitmap(file);
  return { source: bitmap, width: bitmap.width, height: bitmap.height };
}

/**
 * Reads the card's words, through this app's own reader route (`PLAN.md` task 35, D-120).
 *
 * **The screenshot leaves the device here, and the form says so on screen.** Slip capture does the
 * same as of 2026-08-18 (D-129) and through this same route; statement import still reads entirely
 * on the device.
 *
 * The route relays to Google Cloud Vision, which fills 99 of 100 digit-bearing fields against the
 * local engine's 70 (D-118, D-119). **There is no local fallback and that is the decision, not an
 * omission** (D-120): a failure leaves every box blank and the owner types the card, exactly as
 * before pre-fill existed, and keeping a second engine behind the same grammar would mean measuring
 * every future grammar change twice.
 *
 * The encoding and the POST live in `lib/browser/ocr-reader.ts` because the slip form makes the same
 * call; what stays here is the sentence a refusal turns into for *this* form's owner.
 */
async function readCardWords(image: CardImage): Promise<ImageWordsRead> {
  const encoded = await encodeForReader(image.source);
  if (!encoded) return { ok: false, why: "This image could not be prepared for the reader. Type the values from the card yourself." };
  return readImageWords(encoded);
}

function cropRegion(image: CardImage, box: Box): string | null {
  const crop = paddedCrop(box, { width: image.width, height: image.height });
  const width = crop.right - crop.left;
  const height = crop.bottom - crop.top;
  if (width <= 0 || height <= 0) return null;
  const scale = Math.min(CROP_MAX_SCALE, Math.max(1, CROP_TARGET_WIDTH / width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image.source, crop.left, crop.top, width, height, 0, 0, canvas.width, canvas.height);
  // A data URL rather than an object URL: bounded by the crop, needs no revoking, and dies
  // with the component state. `img-src` already permits `data:` (D-058).
  return canvas.toDataURL("image/png");
}

/**
 * The read fields that show their crop **inside** the input's own label rather than in the block
 * above it. Every one of them has a box the owner types into; `counterpartyAccount` does not,
 * which is why it is absent and keeps the block.
 *
 * `occurredAt` is listed once and rendered under **Date**, not under Time: the card prints one
 * date-and-time run, so there is a single crop for two inputs and it sits beneath the first.
 */
const INLINE_CROP_FIELDS: readonly CardFieldName[] = [
  "amount", "balance", "occurredAt", "ownAccount", "counterpartyName"
];

const FIELD_LABELS: Record<CardFieldName, string> = {
  amount: "Amount",
  balance: "Balance after",
  occurredAt: "Date and time",
  ownAccount: "Your account",
  counterpartyName: "Other party",
  counterpartyAccount: "Their account"
};

const NO_CROPS: CardCrops = {};
const NO_NOTES: CardNotes = {};

/**
 * Capturing a bank's LINE push notification (PLAN task 27, migration 016).
 *
 * **Every decision this form makes lives in `lib/notification-card-form.ts`**, and what is left here
 * is markup, the file and canvas work a browser is needed for, and two fetches. That split is the
 * D-150 pattern, applied where D-151 said to apply it next: this file was 1,081 lines and the top
 * hot spot in the repo — 14 of the last 60 commits — with **no committed test of its own**, so every
 * rule it owned was guarded, if at all, by a source grep. `tests/notification-card-form.test.ts` now
 * drives those rules directly, which is a thing a grep cannot do: it can see that the printed sign
 * is named in the code and not that a card printing no sign comes out differently from one that does.
 *
 * **Values from the image reach the boxes only through the strict pre-fill, and every one of them is
 * still the owner's to check.** This paragraph said "nothing here fills a value in from the image"
 * until now, which was D-087's rule and stopped being true when **D-114 put it on trial** — it has
 * been false since, three paragraphs above a block describing the pre-fill it denies. D-087's
 * measurement stands and is the reason the trial is narrow: digits are unstable about one time in
 * fifteen, with at least one wrong figure passing the strict money grammar, so a pre-filled value is
 * indistinguishable from a correct one by looking at it. That binds wider on a card than on a slip,
 * because a card stores four digit-bearing fields rather than one. What answers it is not confidence
 * in the engine but the crop: the reader's real job is to say *where* each figure is, and this form
 * shows that as an enlargement beside the input, so a figure can be checked against the picture it
 * came from. `lib/notification-card-prefill.ts` refuses rather than guesses, and what the owner did
 * with each offer is recorded as field names (D-114, D-116).
 *
 * **The channel comes from you, not from the card.** SCB Connect and KBank Live print the identical
 * incoming title, so no rule can tell those two apart from the card body (D-099) — the LINE
 * conversation the screenshot came from is the only thing that can.
 *
 * **Direction is read twice and refuses when the two disagree.** The card names its direction in
 * words *and* signs its amount, and `readDirection` compares the two — a contradiction blocks the
 * save, because a card stored on the surviving signal is a payment recorded backwards on an
 * append-only row. Which signal feeds the control is the whole point (D-123): the printed **sign**,
 * never the direction **word**, because the word is what the check already holds. `typedFromPrefill`
 * owns that rule and is tested on all three cases, including the card that prints no sign at all.
 */
export function NotificationCardCapture({ onCaptured }: { onCaptured?: () => void }) {
  const window_ = useMemo(() => notificationCardDateWindow(new Date()), []);
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel | "">("");
  // No `image` state: the file is read once into `cardImage` below and never needed again.
  // Holding the `File` as well invited the defect this change exists to prevent — two images in
  // play, one read and one cropped from, with boxes that only match the first.

  /**
   * Where reading the screenshot has got to — **one value where there were six slots**.
   *
   * `regions`, `chosen`, `crops`, `notes`, `reading` and `readerNote` were independent, so every
   * illegal combination was reachable and one of them was ordinary: crops belonging to a card other
   * than the chosen one, which is one card's picture sitting beside another card's figures above an
   * append-only Capture button. `null` is now the only way to have no reading.
   */
  const [reading, setReading] = useState<CardReading | null>(null);

  /**
   * Everything the owner has typed, plus what the pre-fill offered — **one value, replaced whole**.
   *
   * It was nine boxes and a remembered offer, cleared by a `resetTyped()` that named each of them by
   * hand and filled by an `offerPrefill` that named six of them by hand: two lists of the same
   * fields with nothing checking that they agreed. `GOTCHAS.md` records the general answer — a helper
   * is not the fix, because a helper is still a list — and this is it. The values it holds are for
   * comparison only; what leaves the form is two lists of **field names** (D-114).
   */
  const [typed, setTyped] = useState<CardTyped>(() => emptyTyped());

  const [accounts, setAccounts] = useState<CardBindableAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);

  /**
   * The result of the last capture, in one of three tones.
   *
   * A captured card, a card already held and a failure read very differently and are acted on
   * differently, so the result carries its own tone rather than being three shades of grey. It was
   * two slots — `status` and `error` — that were mutually exclusive in fact and independent in the
   * type, so both could stand at once and the form would show two banners with contradictory news.
   */
  const [result, setResult] = useState<CardResult | null>(null);

  const fileInput = useRef<HTMLInputElement | null>(null);
  /**
   * Which crop pass is the current one.
   *
   * Cropping a card means one `createImageBitmap` of the whole screenshot per field, up to six,
   * so a pass takes long enough for the owner to switch cards while it is still running. Two
   * passes then race and the later write wins — which is **not** necessarily the later pass,
   * because the two do different amounts of work when the cards face different directions. The
   * failure is silent and expensive: the crops on screen belong to one card while everything
   * submitted belongs to the other, and the row it writes is append-only.
   */
  const cropPass = useRef(0);

  /**
   * The screenshot the current reading came from, kept so a card switch re-crops from the **same**
   * image the boxes were measured in. A ref rather than state: nothing renders from it, and putting
   * a bitmap in state would re-render the form on every read.
   */
  const cardImage = useRef<CardImage | null>(null);

  /**
   * Brings the result and the fields below it into view after a capture (D-124).
   *
   * **The imperative shape, because this form announces from three different handlers** rather than
   * from one piece of state — which is why `app/result-banner.ts` offers both and this is not the
   * odd one out. The anchor is a wrapper that is always rendered rather than a ref on the banner
   * itself: the banner only exists while there is a result, so a ref on it would be null at the
   * moment `submit` wants to scroll. The scroll, the focus move (D-125) and the reasoning behind
   * both live there, shared with the batch worklist and the import bench (D-150).
   */
  const { anchor: resultBanner, reveal: scrollToResult } = useResultBanner();

  const layout = channel === "" ? null : layoutForChannel(channel);
  const card = chosenCard(reading);
  const isReading = reading?.phase === "reading";
  const crops = reading?.phase === "read" ? reading.crops : NO_CROPS;
  const notes = reading?.phase === "read" ? reading.notes : NO_NOTES;

  /**
   * One keystroke's worth of change, and **the remembered offer is not reachable through it**.
   *
   * `Omit<…, "offered">` is the load-bearing half: the offer exists to be compared against what the
   * owner typed, so a handler able to rewrite it could make any field report agreement.
   */
  const edit = (change: Partial<Omit<CardTyped, "offered">>) =>
    setTyped((current) => ({ ...current, ...change }));

  // Cheap enough to derive every render, and each is one call into the tested module. `parsedAmount`
  // is the sign the direction control puts on the magnitude; the cross-check below then compares it
  // with the direction the card printed in **words**.
  const parsedAmount = amountEntry(typed.amount, typed.direction);
  const parsedBalance = balanceEntry(typed.balance);
  const boundAccount = bindPrintedDigits(layout, typed.printedDigits, accounts);
  const dateHint = printedDateHint(layout, typed.occurredOn);
  const offeredNames = offeredFieldNames(typed);
  const changedNames = changedFieldNames(typed);

  /**
   * The two direction signals, compared: the words from the image, the sign from the control.
   *
   * Memoised because it re-groups the card's words into lines on every call, and the note textarea
   * below re-renders this component on every keystroke. Same `channel`-not-`layout` dependency as
   * the request below, for the same lint reason.
   */
  const directionReading = useMemo(
    () => directionCheck(channel === "" ? null : layoutForChannel(channel), card, amountEntry(typed.amount, typed.direction)),
    [channel, card, typed.amount, typed.direction]
  );

  /**
   * The request this form would send, or `null` for a card that may not be saved.
   *
   * **This is the whole gate, and it is asked once.** It used to be asked twice — as a `ready`
   * boolean that disabled the button, and restated condition by condition at the top of `submit`,
   * because a submit can arrive by routes that never touched the button. Two copies of the rule
   * guarding an append-only row is the drift D-148 was. One value cannot disagree with itself, and
   * because it is the body rather than a boolean, what enables the button is literally what is sent.
   *
   * Memoised on `channel` rather than on the derived `layout`, which is the form
   * `react-hooks/preserve-manual-memoization` accepts — it rejects a dependency it cannot prove is
   * not mutated later, and `layout` is computed in the render body. **The React Compiler is not
   * enabled in this build** (`next.config.ts` sets no `experimental.reactCompiler`); the rule ships
   * with `eslint-config-next`'s `react-hooks` set and runs in lint-only mode, so nothing memoises
   * these automatically and the `useMemo` is doing real work.
   */
  const request = useMemo(
    () => captureRequest({ layout: channel === "" ? null : layoutForChannel(channel), typed, reading, accounts }),
    [channel, typed, reading, accounts]
  );

  /**
   * The accounts and categories the form needs, and it says so when it cannot get them.
   *
   * A silent failure here is worse than it looks: with `accounts` empty, every set of digits the
   * owner types reads as "no account of yours prints those digits" — the form blaming the one
   * field whose refusal is supposed to be trustworthy for what is really a network failure.
   */
  async function loadReferenceData() {
    try {
      const [accountsResponse, categoriesResponse] = await Promise.all([
        fetch("/api/v1/accounts", { headers: { accept: "application/json" } }),
        fetch("/api/v1/categories", { headers: { accept: "application/json" } })
      ]);
      if (!accountsResponse.ok) {
        setResult(failedResult("Your accounts could not be loaded, so a card cannot be bound to one yet. Reload and try again."));
        return;
      }
      const accountsBody = await accountsResponse.json().catch(() => null);
      if (!accountsBody || !Array.isArray(accountsBody.accounts)) {
        setResult(failedResult("The accounts response did not match its contract, so a card cannot be bound to one."));
        return;
      }
      setAccounts(accountsBody.accounts);
      // Categories are optional on a card, so failing to load them is not worth blocking on.
      if (categoriesResponse.ok) {
        const body = await categoriesResponse.json().catch(() => null);
        if (body && Array.isArray(body.categories)) setCategories(body.categories.filter((c: Category) => !c.archived));
      }
    } catch {
      setResult(failedResult("The ledger could not be reached, so your accounts are not loaded."));
    }
  }

  /**
   * Puts one card of the current screenshot on screen: its offered figures, then its crops.
   *
   * **The figures come first and arrive as a whole form.** `typedFromPrefill` builds a complete
   * `CardTyped` from the empty one, so a field the strict grammar refused is blank because that is
   * what it was built from — not because someone remembered to clear it. That is what stops the
   * previous card's figure surviving into this card's form while its crop shows something else, and
   * it is the same mismatch `cropPass` guards from the other direction.
   *
   * The pre-fill's year is **Bangkok's**, not the browser's: `new Date().getFullYear()` is local and
   * the era rule turns a two-digit Buddhist year on it — the same class of bug as D-110's UTC date.
   */
  async function showCard(image: CardImage, cards: readonly CardRegion[], index: number) {
    const picked = cards[index];
    if (!layout || !picked) return;
    const pass = ++cropPass.current;
    const located = locateCardFields(picked.words, layout, picked.direction);
    const prefill = prefillCardFields(picked.words, located, layout, Number(bangkokToday().slice(0, 4)));
    setTyped(typedFromPrefill(prefill, picked.direction, window_));

    const nextCrops: CardCrops = {};
    const nextNotes: CardNotes = {};
    for (const field of CARD_FIELDS) {
      const read = located[field];
      if (!read.ok) {
        // The reader's own words. Its refusals tell "this layout never prints it" apart from
        // "it should be here and was not found", and both are more use than a blank space.
        if (read.code !== "NOT_PRINTED") nextNotes[field] = read.message;
        continue;
      }
      // The box and the image share one coordinate space by construction — `readImage` read
      // this same `CardImage`, so an enlargement cannot move a crop off its row.
      const crop = cropRegion(image, read.value);
      // Checked inside the loop as well as after it: a superseded pass should stop cutting
      // regions rather than finish the work and throw it away.
      if (pass !== cropPass.current) return;
      if (crop === null) nextNotes[field] = "That region could not be cut out of this image.";
      else nextCrops[field] = crop;
    }
    if (pass !== cropPass.current) return;
    setReading((current) => cropsCut(current, nextCrops, nextNotes));
  }

  /**
   * Puts one card of the current screenshot on screen — the only way a card is ever chosen.
   *
   * Both callers go through here: the chooser the owner drives, and the advance that follows a
   * capture. They were the same fifteen lines twice before, and the guard below is the reason
   * having one copy matters.
   *
   * **Guarded, unlike the call inside `readImage`**: a crop can still fail on an image the decoder
   * mangled, and an unhandled rejection would leave the previous card's crops on screen as though
   * they were this one's. **The held image is what makes this correct**, not the file — the boxes
   * were measured in its coordinate space, and re-decoding the file would put them off their rows.
   */
  function selectCard(index: number) {
    // Emptied before the pre-fill rather than after, so a crop pass that throws leaves blank boxes
    // rather than the previous card's figures under this card's chooser.
    setTyped(emptyTyped());
    setReading((current) => cardChosen(current, index));
    if (!cardImage.current || reading?.phase !== "read") return;
    void showCard(cardImage.current, reading.cards, index).catch(() => {
      setReading((current) => cropsCut(current, {}, {
        amount: "This card's fields could not be cut out of the image. Read them from the card itself."
      }));
    });
  }

  /**
   * Reads the screenshot and splits it into cards.
   *
   * **It fills nothing in itself.** The four digit-bearing boxes and the direction control are
   * offered values by `showCard`, once a specific card is on screen — because a pre-fill belongs to
   * one card and this function has not chosen one yet. It empties the form instead: an offer from
   * the previous image must not outlive it, or an untouched box would report agreement with a
   * reading of a different card.
   *
   * Every exit leaves the reading in a phase that is not `reading`, which is why the old `finally`
   * that lowered a separate busy flag is gone — the flag could desync from the reading and this
   * cannot.
   */
  async function readImage(file: File) {
    if (!layout) return;
    setReading(startedReading());
    setTyped(emptyTyped());
    try {
      // Decoded once, then used for both the reading and the crops. Holding it lets a card switch
      // re-crop without decoding the screenshot again.
      const image = await loadCardImage(file);
      cardImage.current = image;
      const read = await readCardWords(image);
      if (!read.ok) {
        setReading(readerRefused(read.why));
        return;
      }
      const found = findCards(read.words, layout);
      const next = cardsFound(found, layout.channel);
      setReading(next);
      // An empty screenshot comes back as a refusal naming the channel to check, so there is
      // nothing further to do with it.
      if (next.phase !== "read") return;
      // Guarded here as well as in `selectCard`, and for the same reason: a crop can fail on an
      // image the decoder mangled, and the cards have already been found by this point.
      await showCard(image, found, 0).catch(() => {
        setReading((current) => cropsCut(current, {}, {
          amount: "This card's fields could not be cut out of the image. Read them from the card itself."
        }));
      });
    } catch {
      // **`readerFailed`, not `readerRefused`.** A failure after the cards were found must not
      // un-find them: with no card in hand the direction cross-check has nothing to compare and
      // stops applying, while the boxes still hold what the pre-fill put there. That is a
      // pre-filled form, submittable on one signal, under a banner saying it could not be read.
      setReading((current) => readerFailed(current, "This image could not be read. Type the values from the card yourself."));
    }
  }

  function closeForm() {
    cropPass.current += 1;
    setOpen(false);
    setChannel("");
    cardImage.current = null;
    setReading(null);
    setResult(null);
    setTyped(emptyTyped());
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // The same value that enables the button. Restating the conditions here is what the old code
    // did, and what made the gate two things that could drift apart.
    if (!request) return;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/v1/notification-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request)
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setResult(failedResult(readError(body, "The card could not be captured.")));
        scrollToResult();
        return;
      }
      const captured = (body as { captured?: boolean } | null)?.captured === true;
      // The banner and the advance from one call, so the sentence cannot announce a card the form
      // does not then move to. A screenshot carries two cards more often than one (D-100).
      const { result: banner, next } = afterCapture(captured, reading);
      setResult(banner);
      onCaptured?.();
      // `selectCard` empties the form itself, so the no-next branch is the only one that has to.
      if (next === null) setTyped(emptyTyped());
      else selectCard(next);
      scrollToResult();
    } catch {
      setResult(failedResult("The ledger could not be reached, so nothing was captured."));
      scrollToResult();
    } finally {
      setBusy(false);
    }
  }

  /**
   * A read field's crop, rendered inside the label of the input it belongs to.
   *
   * `alt=""` is deliberate and is the only defensible reading: this is a picture of digits, so it
   * carries nothing a screen reader could convey, and giving it descriptive alt text inside a
   * `<label>` would append that text to the input's accessible name — making the name longer
   * without making it more useful. The refusal note, when the label was not found, **is** words
   * and stays readable.
   */
  function fieldCrop(field: CardFieldName) {
    if (!card) return null;
    const crop = crops[field];
    const missing = notes[field];
    if (!crop && !missing) return null;
    return (
      <span className="field-crop">
        {crop
          // A data URL cut from an image that never leaves the device. `next/image` would want a
          // loader and a remote pattern for something that is neither.
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={crop} alt="" />
          : <span className="field-help">{missing}</span>}
      </span>
    );
  }

  return (
    <section className="card-bench" aria-labelledby="card-title">
      <div className="bench-heading">
        <p className="section-index">Notification</p>
        <div>
          <h2 id="card-title">Capture a bank notification</h2>
          <p>
            When a payment leaves no slip, the bank&rsquo;s LINE channel still posts a card
            carrying it. Screenshot that card and read it here. The reader shows you where each
            field sits; you read the figures and type them.
          </p>
        </div>
      </div>

      {!open ? (
        <button
          type="button"
          className="secondary-button"
          onClick={() => { setOpen(true); setResult(null); void loadReferenceData(); }}
        >
          Capture a notification card
        </button>
      ) : (
        <form className="slip-form" onSubmit={(event) => void submit(event)}>
          {/* The result of a capture, at the **top** of the form rather than beside the button
              that caused it (D-124).

              Under the submit button it was correct and nearly useless: a card form runs several
              screens long, so the message appeared where the owner already was and the next card —
              already loaded and waiting in the fields above — was off-screen behind it. Here it
              sits directly above the channel and the screenshot, so reading the result and seeing
              what to do next are the same glance. `scrollToResult` brings it into view, because a
              message at the top of a form is only an improvement if the page goes there too.

              A card is append-only, so "saved" and "not saved" are the two sentences on this form
              that must not be missed — the muted `.status` line they used to share read as one more
              note among several. Three tones, each carrying its meaning in the words as well as the
              colour, because colour alone is not a message. **One value carries all three**, so the
              form can no longer show a success and a failure at the same time.

              **A banner rather than a modal dialog, deliberately.** A dialog needs a focus trap, an
              Escape key, a restore of focus on close and an `aria-modal` that hides the rest of the
              page, and every one of those is a way to fail the axe pass this route already holds.
              A region carrying the same words and the same buttons gets the visibility without any
              of that, and it does not steal the keyboard from someone mid-form. */}
          <div ref={resultBanner} className="capture-result-anchor">
            {result && result.tone !== "failed" && (
              <div className={`capture-result ${result.tone}`} role="status" tabIndex={-1} data-capture-result>
                <p>{result.message}</p>
                <div className="capture-result-actions">
                  <button type="button" className="secondary-button" onClick={() => setResult(null)}>
                    OK
                  </button>
                  {/* A link rather than only the sentence, because on a phone this banner is a long
                      way below the header and its nav — so naming the ledger without offering it
                      costs a scroll back up to act on what the sentence just said. */}
                  <a className="secondary-button" href="/ledger">Open the ledger</a>
                </div>
              </div>
            )}
            {result && result.tone === "failed" && (
              <div className="capture-result failed" role="alert" tabIndex={-1} data-capture-result>
                <p>{result.message}</p>
                <div className="capture-result-actions">
                  <button type="button" className="secondary-button" onClick={() => setResult(null)}>
                    OK
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="slip-fields">
            <label>
              <span>Which channel</span>
              <select
                value={channel}
                disabled={busy || isReading}
                onChange={(event) => {
                  // The image goes with the channel, and clearing the input's own value is the
                  // load-bearing half: Chrome fires no `change` event when the *same* file is
                  // picked again, so leaving the filename on screen would strand the owner with
                  // a form that shows a chosen file and no way to re-read it.
                  setChannel(event.target.value as Channel | "");
                  cardImage.current = null;
                  if (fileInput.current) fileInput.current.value = "";
                  cropPass.current += 1;
                  setReading(null);
                }}
                aria-describedby="card-channel-help"
              >
                <option value="">Choose the LINE conversation</option>
                {NOTIFICATION_CARD_LAYOUTS.map((each) => (
                  <option key={each.channel} value={each.channel}>{each.channel}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Screenshot</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                disabled={busy || isReading || layout === null}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;

                  if (file) void readImage(file);
                }}
              />
            </label>
          </div>

          <p id="card-channel-help" className="field-help">
            The card itself cannot tell us this. SCB Connect and KBank Live print the same title
            on an incoming card, so the conversation you took the screenshot in is the only thing
            that says which bank it is — and getting it wrong reads the account digits with the
            wrong rule.
          </p>

          {/* Said on the screen where it happens rather than only in a document, because it is the
              one place in this app where an image leaves the device (D-120). Statement import and
              slip capture are both still read entirely on the device. */}
          <p className="field-help">
            The screenshot is sent to Google Cloud Vision to be read, and is not stored anywhere.
            Every figure it offers is still yours to check before you save.
          </p>

          {isReading && <p className="status" role="status">Reading the card&hellip;</p>}
          {reading?.phase === "refused" && <p className="status" role="status">{reading.why}</p>}

          {reading?.phase === "read" && reading.cards.length > 1 && (
            <label>
              <span>Which card on this screenshot</span>
              <select
                value={reading.chosen}
                disabled={busy || isReading}
                onChange={(event) => selectCard(Number(event.target.value))}
              >
                {reading.cards.map((each, index) => (
                  <option key={index} value={index}>
                    Card {index + 1} of {reading.cards.length} — money {each.direction === "in" ? "in" : "out"}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/*
            * The fields a crop is shown *beside* rather than above, which is what D-087 described
            * and what the block below had never actually delivered: the crops lived in a grid of
            * their own, so comparing a read figure with its picture meant looking in two places
            * and holding one of them in your head. Each crop now sits inside its own label, so
            * the picture and the box being typed into are one thing on screen.
            *
            * `counterpartyAccount` keeps the old block, because it is the one read field with no
            * input beside it — there is nothing to sit next to.
            */}
          {card && (
            <div className="card-crops">
              {CARD_FIELDS.filter((field) => !INLINE_CROP_FIELDS.includes(field)).map((field) => {
                const crop = crops[field];
                const missing = notes[field];
                if (!crop && !missing) return null;
                return (
                  <figure key={field} className="card-crop">
                    <figcaption>{FIELD_LABELS[field]}</figcaption>
                    {crop
                      ? (
                        // A data URL cut from an image that never leaves the device. `next/image`
                        // would want a loader and a remote pattern for something that is neither.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={crop} alt={`The ${FIELD_LABELS[field].toLowerCase()} as printed on the card`} />
                      )
                      : <p className="field-help">{missing}</p>}
                  </figure>
                );
              })}
            </div>
          )}

          <div className="slip-fields">
            <label>
              <span>Direction</span>
              <select
                value={typed.direction}
                disabled={busy}
                onChange={(event) => edit({ direction: event.target.value as CardDirection | "" })}
                aria-describedby="card-direction-help"
                required
              >
                <option value="">Read it off the card</option>
                <option value="out">Money out</option>
                <option value="in">Money in</option>
              </select>
            </label>

            <label>
              <span>Amount (THB)</span>
              <input
                inputMode="decimal"
                value={typed.amount}
                disabled={busy}
                onChange={(event) => edit({ amount: event.target.value })}
                placeholder="200.00"
                required
                aria-describedby="card-amount-help"
              />
              {fieldCrop("amount")}
            </label>

            <label>
              <span>Balance after (THB)</span>
              <input
                inputMode="decimal"
                value={typed.balance}
                disabled={busy}
                onChange={(event) => edit({ balance: event.target.value })}
                placeholder="731.00"
                required
                aria-describedby="card-balance-help"
              />
              {fieldCrop("balance")}
            </label>

            <label>
              <span>Account digits as printed</span>
              <input
                inputMode="numeric"
                value={typed.printedDigits}
                maxLength={4}
                pattern="[0-9]{4}"
                disabled={busy}
                onChange={(event) => edit({ printedDigits: event.target.value.replace(/\D/gu, "").slice(0, 4) })}
                required
                aria-describedby="card-digits-help"
              />
              {fieldCrop("ownAccount")}
            </label>

            <label>
              <span>Date</span>
              <input
                type="date"
                value={typed.occurredOn}
                min={window_.earliest}
                max={window_.latest}
                disabled={busy}
                onChange={(event) => edit({ occurredOn: event.target.value })}
                required
                aria-describedby="card-date-help"
              />
              {fieldCrop("occurredAt")}
            </label>

            <label>
              <span>Time</span>
              <input
                type="time"
                value={typed.occurredAtTime}
                disabled={busy}
                onChange={(event) => edit({ occurredAtTime: event.target.value })}
                required
                aria-describedby="card-time-help"
              />
            </label>

            <label>
              <span>Other party (optional)</span>
              <input
                value={typed.counterparty}
                maxLength={240}
                disabled={busy}
                onChange={(event) => edit({ counterparty: event.target.value })}
              />
              {fieldCrop("counterpartyName")}
            </label>

            <label>
              <span>Category (optional)</span>
              <select
                value={typed.categoryId}
                disabled={busy}
                onChange={(event) => edit({ categoryId: event.target.value })}
              >
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
          </div>

          {offeredNames.length > 0 && (
            // **Said out loud, because the thing on trial is whether a filled box gets read**
            // (D-114). A value the owner typed and a value the image offered look identical in an
            // input, and the second is the one worth checking against its crop. Naming the fields
            // is also the only honest way to show what the audit row will carry: field names, and
            // no figure.
            // `aria-live` rather than `role="status"`: this page already has exactly one status
            // region, and a second computes to the same role and makes every unscoped
            // `getByRole("status")` assertion in the browser suite ambiguous (GOTCHAS).
            <p className="field-help" aria-live="polite">
              {`The card filled ${offeredNames.map((field) => FIELD_LABELS[field].toLowerCase()).join(", ")}. `}
              {changedNames.length > 0
                ? `You have changed ${changedNames.length} of ${offeredNames.length}. `
                : "You have changed none of them. "}
              Check each against its crop — once you submit, a figure you did not type is as much
              yours as one you did, and a card cannot be edited afterwards.
            </p>
          )}

          <p id="card-direction-help" className="field-help">
            {directionReading?.outcome === "contradicted"
              ? `The card's own words say money ${directionReading.byWords === "in" ? "in" : "out"} and you have chosen money ${directionReading.bySign === "in" ? "in" : "out"}. One of the two was misread, so nothing will be saved until they agree.`
              : directionReading?.outcome === "read"
                ? "This agrees with the direction printed on the card."
                : card === null
                  // Said plainly rather than left to look the same as a passing check: with no
                  // card read from the image there is no second signal, so this one is on you.
                  ? "No card was read from an image, so this is the only reading of the direction. Check it against the card itself."
                  : "Read the direction off the card. It is checked against the words the card printed."}
          </p>
          <p id="card-amount-help" className="field-help">
            {parsedAmount === null
              ? "Type the amount as printed; the direction above carries the sign."
              : parsedAmount.ok
                ? `Will be recorded as ${formatThb(parsedAmount.minor)}.`
                : parsedAmount.message}
          </p>
          <p id="card-balance-help" className="field-help">
            {parsedBalance === null
              ? "The account balance the card prints under the amount. It is what pairs this card with its statement row later."
              : parsedBalance.ok
                ? `Will be recorded as ${formatThb(parsedBalance.minor)}.`
                : parsedBalance.message}
          </p>
          <p id="card-digits-help" className="field-help">
            {boundAccount === null
              ? "The four digits this card prints, exactly as printed."
              : boundAccount.ok
                ? `Reads as ${boundAccount.account.label}.`
                : boundAccount.message}
          </p>
          <p id="card-date-help" className="field-help">
            Enter the Gregorian year.
            {dateHint && ` For this date the card should print ${dateHint} — check that against the crop.`}
          </p>
          <p id="card-time-help" className="field-help">
            Take the time from inside the card, not the one LINE prints beside the message. They
            are different clocks, and only the card&rsquo;s matches the statement.
          </p>

          <label className="slip-note">
            <span>Note (optional)</span>
            <textarea
              value={typed.note}
              maxLength={2000}
              rows={2}
              disabled={busy}
              onChange={(event) => edit({ note: event.target.value })}
            />
          </label>


          <div className="slip-actions">
            <button type="submit" className="primary-button" disabled={busy || request === null}>
              {busy ? "Capturing…" : "Capture this card"}
            </button>
            <button type="button" className="secondary-button" disabled={busy} onClick={closeForm}>
              Close
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
