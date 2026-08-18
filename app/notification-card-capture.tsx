"use client";

import { useMemo, useRef, useState } from "react";
import { bangkokToday } from "@/lib/dates";
import { formatThb, parseThb } from "@/lib/money";
import { BUDDHIST_ERA_OFFSET, paddedCrop, type Box } from "@/lib/slip-ocr";
import {
  NOTIFICATION_CARD_LAYOUTS,
  kindForDirection,
  layoutForChannel,
  matchAccountDigits,
  readDirection,
  type CardDirection,
  type NotificationCardLayout
} from "@/lib/notification-card";
import {
  CARD_FIELDS,
  cardText,
  findCards,
  locateCardFields,
  type CardFieldName,
  type CardOcrRead,
  type CardRegion,
  type OcrWord
} from "@/lib/notification-card-ocr";
import { PREFILL_FIELDS, prefillCardFields, type PrefillField } from "@/lib/notification-card-prefill";
import { notificationCardDateWindow } from "@/lib/notification-cards";
import { readError } from "@/lib/wire";

type Category = { id: string; name: string; archived: boolean };
type LedgerAccount = { id: string; bank_code: string; label: string; last_four: string };
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
 * The card as PNG bytes for the reader route.
 *
 * **Re-encoded rather than forwarded, and that is what makes the format question go away.** The
 * file picker accepts `image/*`, so an iPhone can hand this form a HEIC that Vision cannot decode;
 * anything the *browser* decoded into a bitmap re-encodes to a PNG it can. The pixels are the ones
 * already decoded, so this changes nothing about what the reader sees — a PNG of a decoded JPEG
 * carries the same pixels the JPEG did, which is why the measurement over half-JPEG samples
 * transfers to it unchanged.
 */
async function encodeCardForReader(image: CardImage): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(image.source, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/**
 * A list of field names, or nothing at all when it is empty (D-122).
 *
 * `JSON.stringify` drops an `undefined` value, so this is what turns an empty list into an absent
 * key — the encoding migration 019 documents as meaning "empty" and the only one it accepts. The
 * audit row records `[]` either way, so nothing is lost by saying it this way.
 *
 * Kept as a named function rather than inlined twice: the two call sites must agree, and the
 * reason they exist is worth having one place to read.
 */
function namesOrAbsent(names: readonly PrefillField[]): PrefillField[] | undefined {
  return names.length > 0 ? [...names] : undefined;
}

/**
 * Reads the card's words, through this app's own reader route (`PLAN.md` task 35, D-120).
 *
 * **The screenshot leaves the device here, and the form says so on screen** — this is the one place
 * in the app where that happens, and it is the card path only. Slip capture and statement import
 * both still read entirely on the device.
 *
 * The route relays to Google Cloud Vision, which fills 99 of 100 digit-bearing fields against the
 * local engine's 70 (D-118, D-119). **There is no local fallback and that is the decision, not an
 * omission** (D-120): a failure leaves every box blank and the owner types the card, exactly as
 * before pre-fill existed, and keeping a second engine behind the same grammar would mean measuring
 * every future grammar change twice.
 *
 * A refusal comes back as a sentence rather than a code because it is shown to the owner beside the
 * form. Every one of them ends the same way — type the values — since that is the remedy in all
 * cases.
 */
type CardWordsRead = { readonly ok: true; readonly words: OcrWord[] } | { readonly ok: false; readonly why: string };

const READER_UNAVAILABLE = "The card reader could not be reached. Read the card yourself and type the values.";

async function readCardWords(image: CardImage): Promise<CardWordsRead> {
  const encoded = await encodeCardForReader(image);
  if (!encoded) return { ok: false, why: "This image could not be prepared for the reader. Type the values from the card yourself." };

  let response: Response;
  try {
    response = await fetch("/api/v1/notification-cards/read", {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: encoded
    });
  } catch {
    return { ok: false, why: READER_UNAVAILABLE };
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) return { ok: false, why: readError(body, READER_UNAVAILABLE) };

  const words = (body as { words?: OcrWord[] } | null)?.words;
  if (!Array.isArray(words)) return { ok: false, why: READER_UNAVAILABLE };
  return { ok: true, words };
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

/**
 * Capturing a bank's LINE push notification (PLAN task 27, migration 016).
 *
 * **Nothing here fills a value in from the image**, and that is the design rather than a stage
 * it has not reached. D-087 measured digits unstable about one time in fifteen, with at least
 * one wrong figure passing the strict money grammar — so a pre-filled value would be
 * indistinguishable from a correct one. It binds wider on a card than on a slip, because a card
 * stores four digit-bearing fields rather than one: the amount, the balance, the timestamp and
 * the account digits are all typed. The reader's job is to say *where* each one is, and this
 * form shows that as a cropped enlargement beside its input.
 *
 * **The channel comes from you, not from the card.** SCB Connect and KBank Live print the
 * identical incoming title, so no rule can tell those two apart from the card body (D-099) — the
 * LINE conversation the screenshot came from is the only thing that can.
 *
 * **Direction is read twice and refuses when the two disagree.** The card names its direction in
 * words *and* signs its amount, and `readDirection` compares the two — a contradiction blocks the
 * save, because a card stored on the surviving signal is a payment recorded backwards on an
 * append-only row.
 *
 * **Both signals now come from the image, and which one feeds the control is the whole point**
 * (D-123). The control is filled from the printed **sign** and never from the direction **word**:
 * the word is what the check already holds, so feeding it back would make the check agree with
 * itself on every card while still looking like a check. The two are independent in the way that
 * matters — a misread that garbles a Thai direction word and one that drops a leading `-` are not
 * the same misread. Where a card prints no sign, the control stays blank and you set it, which on
 * the measured samples is KBank Live incoming and nothing else.
 */
export function NotificationCardCapture({ onCaptured }: { onCaptured?: () => void }) {
  const window_ = useMemo(() => notificationCardDateWindow(new Date()), []);
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel | "">("");
  // No `image` state: the file is read once into `cardImage` below and never needed again.
  // Holding the `File` as well invited the defect this change exists to prevent — two images in
  // play, one read and one cropped from, with boxes that only match the first.
  const [regions, setRegions] = useState<CardRegion[] | null>(null);
  const [chosen, setChosen] = useState(0);
  const [crops, setCrops] = useState<Partial<Record<CardFieldName, string>>>({});
  const [notes, setNotes] = useState<Partial<Record<CardFieldName, string>>>({});
  const [reading, setReading] = useState(false);
  const [readerNote, setReaderNote] = useState<string | null>(null);
  /**
   * What the pre-fill put in each box, so a change to it can be detected at submit (D-114).
   *
   * **Values are held only to be compared, never to be sent.** What leaves this form is the two
   * lists of *field names* below — which fields were offered, and which of those the owner changed
   * — because that is the whole of what the trial needs and the whole of what an audit row may
   * carry. `tests/privacy.test.ts` asserts the distinction rather than trusting this comment.
   */
  const [offered, setOffered] = useState<Partial<Record<PrefillField, string>>>({});

  const [direction, setDirection] = useState<CardDirection | "">("");
  const [amount, setAmount] = useState("");
  const [balance, setBalance] = useState("");
  const [printedDigits, setPrintedDigits] = useState("");
  // Bangkok, not UTC. `toISOString()` here named yesterday between midnight and 07:00 local,
  // and a card matches on a one-day window, so the default silently narrowed the pairing for
  // seven hours a day (D-110).
  const [occurredOn, setOccurredOn] = useState(() => bangkokToday());
  const [occurredAtTime, setOccurredAtTime] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [note, setNote] = useState("");

  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [busy, setBusy] = useState(false);
  // A captured card, a card already held, and a failure read very differently and are acted on
  // differently, so the result carries its own tone rather than being three shades of grey.
  const [status, setStatus] = useState<{ tone: "captured" | "already"; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInput = useRef<HTMLInputElement | null>(null);
  /**
   * Which crop pass is the current one.
   *
   * Cropping a card means one `createImageBitmap` of the whole screenshot per field, up to six,
   * so a pass takes long enough for the owner to switch cards while it is still running. Two
   * passes then race and the later `setCrops` wins — which is **not** necessarily the later
   * pass, because the two do different amounts of work when the cards face different directions.
   * The failure is silent and expensive: the crops on screen belong to one card while everything
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
   * The top of the form, where a capture's result appears and where the page is sent afterwards.
   *
   * **A wrapper that is always rendered, rather than a ref on the banner itself.** The banner only
   * exists while there is a result, so a ref on it would be null at the moment `submit` wants to
   * scroll — React has not committed the new element yet. The anchor is always in the tree, so its
   * position is knowable whether or not a message is showing.
   */
  const resultBanner = useRef<HTMLDivElement | null>(null);

  /**
   * Brings the result and the fields below it into view after a capture (D-124).
   *
   * **No `behavior` is passed, and that is the accessible choice rather than an omission.** Left
   * unspecified, the browser follows the CSS `scroll-behavior`, which `app/globals.css` sets to
   * `smooth` and overrides to `auto` under `prefers-reduced-motion`. Passing `"smooth"` here would
   * ignore that preference for the one person who set it.
   *
   * Deferred a frame because it runs in the same commit that puts the banner on screen: scrolling
   * before the layout includes it lands short by the banner's own height.
   */
  function scrollToResult() {
    requestAnimationFrame(() => {
      const anchor = resultBanner.current;
      if (!anchor) return;
      anchor.scrollIntoView({ block: "start" });
      // **Focus follows the eye** (D-125). The scroll moves the viewport and nothing else, so a
      // keyboard capture would leave the caret on the submit button that has just gone off-screen
      // at the bottom — Tab would continue from a control the owner can no longer see. Moving it
      // to the result is the standard pattern for a region like this and is **not** a focus trap:
      // Tab and Escape behave normally and nothing on the page is hidden, which is exactly the
      // difference from the modal dialog D-123 declined.
      //
      // `preventScroll` because the scroll above already chose the position; letting focus scroll
      // as well overrides `scroll-margin-top` and jams the banner against the viewport edge.
      anchor.querySelector<HTMLElement>("[data-capture-result]")?.focus({ preventScroll: true });
    });
  }

  const layout = channel === "" ? null : layoutForChannel(channel);
  const region = regions?.[chosen] ?? null;

  /** The typed amount as signed minor units, with the sign coming from the direction control. */
  const parsedAmount = useMemo(() => {
    if (amount.trim() === "" || direction === "") return null;
    try {
      const magnitude = BigInt(parseThb(amount).minor);
      const absolute = magnitude < 0n ? -magnitude : magnitude;
      if (absolute === 0n) return { ok: false as const, message: "No card prints a movement of nothing." };
      return { ok: true as const, minor: (direction === "out" ? -absolute : absolute).toString() };
    } catch {
      return { ok: false as const, message: "Enter a plain amount such as 250 or 250.75." };
    }
  }, [amount, direction]);

  /** The balance is a position rather than a movement: zero is ordinary and negative is an overdraft. */
  const parsedBalance = useMemo(() => {
    if (balance.trim() === "") return null;
    try {
      return { ok: true as const, minor: BigInt(parseThb(balance).minor).toString() };
    } catch {
      return { ok: false as const, message: "Enter the balance as printed, such as 9310 or 9310.00." };
    }
  }, [balance]);

  /**
   * The two direction signals, compared.
   *
   * The words come from the image and the sign from the control above, so this is a real
   * cross-check rather than a value compared against itself.
   */
  const directionCheck = useMemo(() => {
    if (!layout || !region || !parsedAmount?.ok) return null;
    return readDirection(layout, cardText(region.words), BigInt(parsedAmount.minor));
  }, [layout, region, parsedAmount]);

  /** Which of the owner's accounts the printed digits name, under this layout's mask. */
  const boundAccount = useMemo(() => {
    if (!layout || !/^[0-9]{4}$/.test(printedDigits)) return null;
    const mine = accounts.filter((account) => account.bank_code === layout.bankCode);
    const match = matchAccountDigits(layout, printedDigits, mine.map((account) => account.last_four));
    if (match.outcome === "matched") {
      return { ok: true as const, account: mine.find((account) => account.last_four === match.lastFour)! };
    }
    if (match.outcome === "none") {
      return { ok: false as const, message: `No ${layout.bankCode} account of yours prints those digits.` };
    }
    // Only reachable on KBank Live, which pins down three digits rather than four — two accounts
    // differing only in the masked digit are indistinguishable from the card. Fail closed.
    return {
      ok: false as const,
      message: "Those digits fit more than one of your accounts, and this layout masks the digit that would tell them apart. Say which account yourself."
    };
  }, [layout, printedDigits, accounts]);

  /** What the card should print for the date chosen, as a check against the crop. */
  const printedDateHint = useMemo(() => {
    if (!layout || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) return null;
    const [year, month, day] = occurredOn.split("-");
    return layout.yearFormat === "gregorian-4"
      ? `${day}/${month}/${year}`
      : `${day}/${month}/${String(Number(year) + BUDDHIST_ERA_OFFSET).slice(-2)}`;
  }, [layout, occurredOn]);

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
        setError("Your accounts could not be loaded, so a card cannot be bound to one yet. Reload and try again.");
        return;
      }
      const accountsBody = await accountsResponse.json().catch(() => null);
      if (!accountsBody || !Array.isArray(accountsBody.accounts)) {
        setError("The accounts response did not match its contract, so a card cannot be bound to one.");
        return;
      }
      setAccounts(accountsBody.accounts);
      // Categories are optional on a card, so failing to load them is not worth blocking on.
      if (categoriesResponse.ok) {
        const body = await categoriesResponse.json().catch(() => null);
        if (body && Array.isArray(body.categories)) setCategories(body.categories.filter((c: Category) => !c.archived));
      }
    } catch {
      setError("The ledger could not be reached, so your accounts are not loaded.");
    }
  }

  /**
   * Offers the card's own figures as starting values, and remembers exactly what it offered.
   *
   * **This is D-087 on trial, not overturned** (D-114). The engine was measured on 19 real cards
   * and does not produce wrong-but-plausible figures — what breaks is the punctuation, and
   * `lib/notification-card-prefill.ts` repairs only characters carrying no value, proves no digit
   * moved, runs the same strict grammar the form runs, and offers nothing at all when any of that
   * refuses. A field it refuses is left exactly as it is today, so this can only reduce typing.
   *
   * **The case against pre-fill was never the engine, it was rubber-stamping** — a plausible value
   * in a filled box getting confirmed unread. That is a claim about a person and can only be
   * observed, which is what `offered` is for. The statistic to be careful with is named in D-114:
   * a low edit rate is consistent with the engine being right *and* with the owner having stopped
   * looking, so the check that settles it is the statement, not this.
   *
   * The direction control is deliberately not filled. `readDirection` compares the card's words
   * against what the owner chose, and filling in the owner's half would compare the image with
   * itself and always agree.
   */
  function offerPrefill(picked: CardRegion, located: Record<CardFieldName, CardOcrRead<Box>>) {
    if (!layout) return;
    // Bangkok's year, not the browser's. `new Date().getFullYear()` is local, and the era rule
    // turns a two-digit Buddhist year on it — the same class of bug as D-110's UTC date default.
    const prefill = prefillCardFields(picked.words, located, layout, Number(bangkokToday().slice(0, 4)));
    const remembered: Partial<Record<PrefillField, string>> = {};

    // **Every box is set, including the ones the engine refused, because this runs whenever a
    // different card comes on screen.** Leaving a refused field alone would carry the previous
    // card's figure into this one's form while its crop showed something else — the mismatch the
    // `cropPass` guard above exists to prevent, arriving by a slower route. A refused field is
    // therefore emptied rather than inherited, and the date returns to its Bangkok default (D-110)
    // rather than to nothing.
    setAmount(prefill.amount.ok ? prefill.amount.value.magnitude : "");
    if (prefill.amount.ok) remembered.amount = prefill.amount.value.magnitude;

    // **The direction is filled from the sign the card printed, never from its direction word**
    // (D-123). That distinction is the whole of this block and it is not pedantry.
    //
    // `readDirection` refuses a card whose two printed signals disagree, and it gets the word from
    // the image and the sign from *this control*. Filling the control from the **word** would hand
    // it back the signal it already has, and the check would agree with itself on every card
    // forever — the failure D-099 built it to catch would stop being caught silently. Filling it
    // from the **sign** keeps two genuinely different printed features in play: a misread that
    // corrupts a Thai direction word and a misread that flips a leading `-` are not the same
    // misread, and either one alone still blocks the save.
    //
    // **Both signals must be present and agree, or the owner picks.** Measured 2026-08-17 over the
    // 12 real screenshots: 26 of 28 cards print both, and all 26 agree. The other two are KBank
    // Live incoming, which names its direction in the title and prints no sign — so on those the
    // control stays blank and the card is not submittable until it is set, exactly as before.
    const printedSign = prefill.amount.ok ? prefill.amount.value.sign : "";
    const bySign: CardDirection | "" = printedSign === "+" ? "in" : printedSign === "-" ? "out" : "";
    setDirection(bySign !== "" && bySign === picked.direction ? bySign : "");

    setBalance(prefill.balance.ok ? prefill.balance.value : "");
    if (prefill.balance.ok) remembered.balance = prefill.balance.value;

    setPrintedDigits(prefill.ownAccount.ok ? prefill.ownAccount.value : "");
    if (prefill.ownAccount.ok) remembered.ownAccount = prefill.ownAccount.value;

    // The date input refuses anything outside the capture window, and a value it refuses would sit
    // in the box looking typed while being unsubmittable. Offered only where it can stand.
    const timestamp = prefill.occurredAt.ok ? prefill.occurredAt.value : null;
    const datable = timestamp !== null && timestamp.date >= window_.earliest && timestamp.date <= window_.latest;
    setOccurredOn(datable ? timestamp.date : bangkokToday());
    setOccurredAtTime(datable ? timestamp.time : "");
    if (datable) remembered.occurredAt = `${timestamp.date} ${timestamp.time}`;

    setOffered(remembered);
  }

  async function showCard(image: CardImage, found: CardRegion[], index: number) {
    const picked = found[index];
    if (!layout || !picked) return;
    const pass = ++cropPass.current;
    const located = locateCardFields(picked.words, layout, picked.direction);
    offerPrefill(picked, located);
    const nextCrops: Partial<Record<CardFieldName, string>> = {};
    const nextNotes: Partial<Record<CardFieldName, string>> = {};
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
    setCrops(nextCrops);
    setNotes(nextNotes);
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
    setChosen(index);
    resetTyped();
    if (!cardImage.current || !regions) return;
    void showCard(cardImage.current, regions, index).catch(() => {
      setNotes({ amount: "This card's fields could not be cut out of the image. Read them from the card itself." });
      setCrops({});
    });
  }

  /**
   * Reads the screenshot and splits it into cards.
   *
   * **It fills nothing in itself.** The four digit-bearing boxes and the direction control are
   * offered values by `offerPrefill`, which runs from `showCard` once a specific card is on screen
   * — because a pre-fill belongs to one card and this function has not chosen one yet. A direction
   * set here would belong to no card in particular, which `tests/privacy.test.ts` asserts.
   */
  async function readImage(file: File) {
    if (!layout) return;
    setReading(true);
    setReaderNote(null);
    setRegions(null);
    setCrops({});
    setNotes({});
    // An offer from the previous image must not outlive it: with the boxes still holding those
    // values, an untouched form would report agreement with a reading of a different card.
    setOffered({});
    try {
      // Decoded once, then used for both the reading and the crops. Holding it lets a card switch
      // re-crop without decoding the screenshot again.
      const card = await loadCardImage(file);
      cardImage.current = card;
      const words = await readCardWords(card);
      if (!words.ok) {
        setReaderNote(words.why);
        return;
      }
      const found = findCards(words.words, layout);
      if (found.length === 0) {
        setReaderNote(
          `No ${layout.channel} card was found on this image. Check the channel above is the conversation this screenshot came from — an in-app transaction list is not a card and is not captured here.`
        );
        return;
      }
      setRegions(found);
      setChosen(0);
      await showCard(card, found, 0);
    } catch {
      setReaderNote("This image could not be read. Type the values from the card yourself.");
    } finally {
      setReading(false);
    }
  }

  function resetTyped() {
    setDirection("");
    setAmount("");
    setBalance("");
    setPrintedDigits("");
    setOccurredAtTime("");
    setCounterparty("");
    setCategoryId("");
    setNote("");
    // Cleared with the boxes it describes. An offer remembered past the values it was made about
    // would report the next card's typing as agreement with the previous card's reading.
    setOffered({});
  }

  function closeForm() {
    cropPass.current += 1;
    setOpen(false);
    setChannel("");

    cardImage.current = null;
    setRegions(null);
    setCrops({});
    setNotes({});
    setReaderNote(null);
    setError(null);
    resetTyped();
  }

  /**
   * What is in each pre-fillable box now, in the same form the offer was remembered in.
   *
   * The timestamp is two inputs and one field: a card stores one instant, the pairing rule uses
   * the instant rather than the day (D-102), and either input moving is the owner disagreeing with
   * what the image offered.
   */
  const typedNow = useMemo((): Record<PrefillField, string> => ({
    amount,
    balance,
    ownAccount: printedDigits,
    occurredAt: `${occurredOn} ${occurredAtTime}`
  }), [amount, balance, printedDigits, occurredOn, occurredAtTime]);

  /**
   * The two lists the trial turns on — **field names, never values** (D-114).
   *
   * `offeredFieldNames` is what the image put in front of the owner; `changedFieldNames` is what
   * they overtyped before submitting. Neither carries an amount, a balance, a date or a digit, and
   * neither is derived from anything the database does not already store.
   */
  const offeredFieldNames = useMemo(
    () => PREFILL_FIELDS.filter((field) => offered[field] !== undefined),
    [offered]
  );
  const changedFieldNames = useMemo(
    () => PREFILL_FIELDS.filter((field) => offered[field] !== undefined && offered[field] !== typedNow[field]),
    [offered, typedNow]
  );

  /**
   * The second direction signal, required whenever there **is** one.
   *
   * `!== "contradicted"` was not enough, and the gap is not theoretical: `directionCheck` is null
   * whenever no card region is in hand, and null is not "contradicted" — so the cross-check
   * silently stopped applying while the form stayed submittable. D-099's whole point is that a
   * card is never stored on one signal.
   *
   * With no region there genuinely is no second signal, because nothing read the card's words.
   * That path stays open — the owner can always type a card the engine could not read — and the
   * form says which of the two situations it is in rather than looking equally confident in both.
   */
  const directionAgrees = region === null || directionCheck?.outcome === "read";

  const ready =
    layout !== null &&
    direction !== "" &&
    parsedAmount?.ok === true &&
    parsedBalance?.ok === true &&
    boundAccount?.ok === true &&
    occurredAtTime !== "" &&
    directionAgrees;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // Every condition restated rather than deferring to `ready`, which only disables the button.
    // A submit can still arrive by other routes, and this is the last gate before an append-only
    // row — the contradiction check most of all.
    if (!layout || direction === "" || occurredAtTime === "") return;
    if (!parsedAmount?.ok || !parsedBalance?.ok || !boundAccount?.ok) return;
    if (!directionAgrees) return;
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/v1/notification-cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: boundAccount.account.id,
          channel: layout.channel,
          printedAccountDigits: printedDigits,
          kind: kindForDirection(direction),
          amountMinor: parsedAmount.minor,
          balanceMinor: parsedBalance.minor,
          occurredOn,
          occurredAtTime,
          counterparty: counterparty.trim() || null,
          categoryId: categoryId || null,
          note: note.trim() || null,
          // Field names only, and both derived by filtering the field-name constant rather than
          // built by hand — so no figure can travel in either by construction (D-114, D-116).
          //
          // **An empty list is sent as an absent key, and that is not a style choice** (D-122).
          // Migration 019 defines absent as an empty list and refuses an explicitly empty array:
          // its duplicate-name check compares `array_length(names, 1)`, which PostgreSQL answers
          // **NULL** for an empty array, against a `count(distinct)` of 0 — so `[]` raises
          // "contains a repeated field name". The two encodings mean the same thing and only one
          // of them works. **It bites hardest when the pre-fill is perfect**: a card the owner
          // changed nothing on sends an empty `prefillChanged` and cannot be captured at all,
          // which is the first thing real use of Cloud Vision found (D-120).
          prefillOffered: namesOrAbsent(offeredFieldNames),
          prefillChanged: namesOrAbsent(changedFieldNames)
        })
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(readError(body, "The card could not be captured."));
        scrollToResult();
        return;
      }
      const captured = (body as { captured?: boolean } | null)?.captured === true;
      // A screenshot carries two cards more often than one (D-100), so the ordinary next act after
      // a capture is the card beside it. Advancing to it rather than making the owner re-pick from
      // the chooser is what turns a two-card screenshot into one pass instead of two.
      const next = regions !== null && chosen + 1 < regions.length ? chosen + 1 : null;
      const remaining = next === null
        ? "That was the last card on this screenshot."
        : `Card ${next + 1} of ${regions!.length} is ready — check each figure against its crop.`;
      setStatus({
        tone: captured ? "captured" : "already",
        message: captured
          ? `Captured. A card cannot be deleted or edited once saved. ${remaining}`
          : `This exact card was already captured, so nothing was added. ${remaining}`
      });
      onCaptured?.();
      // `selectCard` resets the typed values itself, so the no-next branch is the only one that
      // has to. Clearing them twice would be harmless; not clearing them at all would leave the
      // captured card's figures in a form that is no longer about any card on screen.
      if (next === null) resetTyped();
      else selectCard(next);
      scrollToResult();
    } catch {
      setError("The ledger could not be reached, so nothing was captured.");
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
    if (!region) return null;
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
          onClick={() => { setOpen(true); setStatus(null); void loadReferenceData(); }}
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
              colour, because colour alone is not a message.

              **A banner rather than a modal dialog, deliberately.** A dialog needs a focus trap, an
              Escape key, a restore of focus on close and an `aria-modal` that hides the rest of the
              page, and every one of those is a way to fail the axe pass this route already holds.
              A region carrying the same words and the same buttons gets the visibility without any
              of that, and it does not steal the keyboard from someone mid-form. */}
          <div ref={resultBanner} className="capture-result-anchor">
            {status && (
              <div className={`capture-result ${status.tone}`} role="status" tabIndex={-1} data-capture-result>
                <p>{status.message}</p>
                <div className="capture-result-actions">
                  <button type="button" className="secondary-button" onClick={() => setStatus(null)}>
                    OK
                  </button>
                </div>
              </div>
            )}
            {error && (
              <div className="capture-result failed" role="alert" tabIndex={-1} data-capture-result>
                <p>{error}</p>
                <div className="capture-result-actions">
                  <button type="button" className="secondary-button" onClick={() => setError(null)}>
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
                disabled={busy || reading}
                onChange={(event) => {
                  // The image goes with the channel, and clearing the input's own value is the
                  // load-bearing half: Chrome fires no `change` event when the *same* file is
                  // picked again, so leaving the filename on screen would strand the owner with
                  // a form that shows a chosen file and no way to re-read it.
                  setChannel(event.target.value as Channel | "");
                  cardImage.current = null;
                  if (fileInput.current) fileInput.current.value = "";
                  cropPass.current += 1;
                  setRegions(null);
                  setCrops({});
                  setNotes({});
                  setReaderNote(null);
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
                disabled={busy || reading || layout === null}
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

          {reading && <p className="status" role="status">Reading the card&hellip;</p>}
          {readerNote && <p className="status" role="status">{readerNote}</p>}

          {regions && regions.length > 1 && (
            <label>
              <span>Which card on this screenshot</span>
              <select
                value={chosen}
                disabled={busy || reading}
                onChange={(event) => selectCard(Number(event.target.value))}
              >
                {regions.map((each, index) => (
                  <option key={index} value={index}>
                    Card {index + 1} of {regions.length} — money {each.direction === "in" ? "in" : "out"}
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
          {region && (
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
                value={direction}
                disabled={busy}
                onChange={(event) => setDirection(event.target.value as CardDirection | "")}
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
                value={amount}
                disabled={busy}
                onChange={(event) => setAmount(event.target.value)}
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
                value={balance}
                disabled={busy}
                onChange={(event) => setBalance(event.target.value)}
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
                value={printedDigits}
                maxLength={4}
                pattern="[0-9]{4}"
                disabled={busy}
                onChange={(event) => setPrintedDigits(event.target.value.replace(/\D/gu, "").slice(0, 4))}
                required
                aria-describedby="card-digits-help"
              />
              {fieldCrop("ownAccount")}
            </label>

            <label>
              <span>Date</span>
              <input
                type="date"
                value={occurredOn}
                min={window_.earliest}
                max={window_.latest}
                disabled={busy}
                onChange={(event) => setOccurredOn(event.target.value)}
                required
                aria-describedby="card-date-help"
              />
              {fieldCrop("occurredAt")}
            </label>

            <label>
              <span>Time</span>
              <input
                type="time"
                value={occurredAtTime}
                disabled={busy}
                onChange={(event) => setOccurredAtTime(event.target.value)}
                required
                aria-describedby="card-time-help"
              />
            </label>

            <label>
              <span>Other party (optional)</span>
              <input value={counterparty} maxLength={240} disabled={busy} onChange={(event) => setCounterparty(event.target.value)} />
              {fieldCrop("counterpartyName")}
            </label>

            <label>
              <span>Category (optional)</span>
              <select value={categoryId} disabled={busy} onChange={(event) => setCategoryId(event.target.value)}>
                <option value="">Uncategorised</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
          </div>

          {offeredFieldNames.length > 0 && (
            // **Said out loud, because the thing on trial is whether a filled box gets read**
            // (D-114). A value the owner typed and a value the image offered look identical in an
            // input, and the second is the one worth checking against its crop. Naming the fields
            // is also the only honest way to show what the audit row will carry: field names, and
            // no figure.
            // `aria-live` rather than `role="status"`: this page already has exactly one status
            // region, and a second computes to the same role and makes every unscoped
            // `getByRole("status")` assertion in the browser suite ambiguous (GOTCHAS).
            <p className="field-help" aria-live="polite">
              {`The card filled ${offeredFieldNames.map((field) => FIELD_LABELS[field].toLowerCase()).join(", ")}. `}
              {changedFieldNames.length > 0
                ? `You have changed ${changedFieldNames.length} of ${offeredFieldNames.length}. `
                : "You have changed none of them. "}
              Check each against its crop — once you submit, a figure you did not type is as much
              yours as one you did, and a card cannot be edited afterwards.
            </p>
          )}

          <p id="card-direction-help" className="field-help">
            {directionCheck?.outcome === "contradicted"
              ? `The card's own words say money ${directionCheck.byWords === "in" ? "in" : "out"} and you have chosen money ${directionCheck.bySign === "in" ? "in" : "out"}. One of the two was misread, so nothing will be saved until they agree.`
              : directionCheck?.outcome === "read"
                ? "This agrees with the direction printed on the card."
                : region === null
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
            {printedDateHint && ` For this date the card should print ${printedDateHint} — check that against the crop.`}
          </p>
          <p id="card-time-help" className="field-help">
            Take the time from inside the card, not the one LINE prints beside the message. They
            are different clocks, and only the card&rsquo;s matches the statement.
          </p>

          <label className="slip-note">
            <span>Note (optional)</span>
            <textarea value={note} maxLength={2000} rows={2} disabled={busy} onChange={(event) => setNote(event.target.value)} />
          </label>


          <div className="slip-actions">
            <button type="submit" className="primary-button" disabled={busy || !ready}>
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
