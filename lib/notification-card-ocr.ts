import {
  groupIntoLines,
  normalise,
  paddedCrop,
  valueWordsFor,
  type Box,
  type OcrWord
} from "@/lib/slip-ocr";
import {
  fieldMapFor,
  readDirectionWord,
  type CardDirection,
  type CardFieldAnchor,
  type CardFieldMap,
  type NotificationCardLayout
} from "@/lib/notification-card";

/**
 * Finding the fields on a bank's LINE push notification (PLAN task 27).
 *
 * **This file locates fields and reads no digit at all.** That is D-087's rule carried over
 * unchanged: OCR says *which part of the image* a field is, the owner reads the figure and
 * types it, and no machine-read digit reaches a stored value. It applies more widely here than
 * it does on a slip, because a card stores four digit-bearing fields rather than one — the
 * amount, the balance, the timestamp and the printed account digits are all typed. The
 * measurement behind the rule is D-087's: digits were unstable about one time in fifteen, and
 * at least one of those readings passed the money grammar while being wrong.
 *
 * So what this returns is a **box per field**, for a form that shows a cropped enlargement
 * beside each input. On a phone that is the whole point — the card being read and the form
 * being typed into are on the same screen.
 *
 * ## The order it runs in
 *
 * `findCards` first, then `locateCardFields` on each region it returns. **A screenshot is not a
 * card** — all six real card screenshots carry two — so segmentation is not a refinement, it is
 * what makes the rest work at all. `readCardDirection` is the same question asked of an image
 * that is already one card.
 *
 * Two things it does read, because neither is a digit:
 *
 *   * **the direction**, from the words the card prints, which is what selects the grammar
 *     below — the field map is looked up per layout **and per direction** (D-099); and
 *   * **the labels**, which is what "locating" means.
 *
 * The calendar and account rules stay where they are, in `lib/notification-card.ts`, and they
 * run on what the owner typed: `resolveCardYear` turns a printed two-digit Buddhist year into
 * a Gregorian one per layout, and `matchAccountDigits` turns printed digits into an account
 * per layout. Neither belongs here — this file never sees a value.
 *
 * **No engine, deliberately**, exactly as `lib/slip-ocr.ts` depends on none (D-088 decision 1).
 * The seam is `OcrWord`, so this is drivable by a test with no browser, and every rule below is
 * about refusing rather than recognising.
 */

/** Where the crop padding lives, re-exported so a card form has one import for its crops. */
export { paddedCrop, type Box, type OcrWord };

/**
 * How much to enlarge a card screenshot before reading it, and why enlarging helps here when
 * D-087 measured that it hurts on a slip.
 *
 * **Measured 2026-08-16 over 12 real screenshots and 25 cards**: reading them at 2× fills
 * **70 of 100** digit-bearing fields against **62** at native size, with the same 25 cards found
 * and none lost. The gain is concentrated where the engine was mangling the account mask — the
 * printed digits went from 3 of 9 to 9 of 9 on Krungthai Connext — and the balance from 17 to 20
 * overall.
 *
 * **This does not contradict D-087, it is bounded away from it.** That entry measured a 2× cubic
 * upscale over 23 real *slips* on tesseract 6 and found it recovered one image and broke three, and
 * `lib/slip-ocr-engine.ts` still says the ladder must not be borrowed. Both remain true: this scale
 * is applied by the **card** form at its own call site, the shared engine is untouched, and slip
 * capture reads at native size exactly as before. A card is a different subject — small grey label
 * text in a screenshot of a phone notification, rather than a photographed receipt.
 *
 * **The cap is what makes it shippable, and it is not a tidiness bound.** The samples are full
 * phone screenshots — 1170×2532 and one 721×3840 — so a flat 2× asks for a canvas up to 7680px
 * tall. iOS Safari refuses or silently degrades a canvas past roughly 4096 on an edge or 16.7M
 * pixels, and the owner captures on an iPhone, so an uncapped scale would fail on the one device
 * this feature exists for. Capping costs **nothing measurable**: the capped rule scored the same
 * 70 of 100, because the images it holds back are the ones whose gain was marginal anyway.
 *
 * Returns 1 when no enlargement is possible or wanted, and a caller reading 1 should pass its
 * image through untouched rather than round-tripping it through a canvas for nothing.
 */
const CARD_READ_SCALE = 2;
const MAX_CANVAS_EDGE = 4096;
const MAX_CANVAS_AREA = 16_777_216;

export function cardReadingScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const scale = Math.min(
    CARD_READ_SCALE,
    MAX_CANVAS_EDGE / width,
    MAX_CANVAS_EDGE / height,
    Math.sqrt(MAX_CANVAS_AREA / (width * height))
  );
  // Never below 1: shrinking an already-huge screenshot would throw away the detail this exists
  // to recover, and the engine reads a native-size image acceptably today.
  return scale > 1 ? scale : 1;
}

export const CARD_FIELDS = [
  "amount",
  "ownAccount",
  "occurredAt",
  "balance",
  "counterpartyName",
  "counterpartyAccount"
] as const;

export type CardFieldName = (typeof CARD_FIELDS)[number];

export type CardOcrRefusal =
  /** No direction word of this layout was found, or the one found belongs to another layout. */
  | "DIRECTION_NOT_READ"
  /** No real card has been read for this layout in this direction, so there is no grammar. */
  | "GRAMMAR_NOT_MEASURED"
  /** An `under-title` field, on an image where the title line could not be pinned down. */
  | "TITLE_NOT_FOUND"
  | "LABEL_NOT_FOUND"
  | "LABEL_AMBIGUOUS"
  /** The label was found, but only as part of a longer label on the same row. See below. */
  | "LABEL_ECLIPSED"
  | "NOTHING_AT_ANCHOR"
  /** This layout does not print this field in this direction. Not a misread. */
  | "NOT_PRINTED";

/** The refusal half on its own, so a refusal can be held and compared before it is returned. */
export type CardOcrRefused = { ok: false; code: CardOcrRefusal; message: string };

export type CardOcrRead<T> = { ok: true; value: T; source: string } | CardOcrRefused;

function refuse(code: CardOcrRefusal, message: string): CardOcrRefused {
  return { ok: false, code, message };
}

/**
 * Every label this layout prints in this direction.
 *
 * Collected so a label can be checked against its own siblings — see `eclipsedBy`. The
 * direction word is not in the list: on Krungthai Connext it *is* the amount's label and is
 * already there, and on the other two it is a title rather than a row.
 */
function siblingLabels(map: CardFieldMap): string[] {
  const anchors: CardFieldAnchor[] = [
    map.amount,
    map.ownAccount,
    map.occurredAt,
    map.balance,
    ...map.counterpartyName,
    ...map.counterpartyAccount
  ];
  return anchors.filter((anchor) => anchor.kind === "label").map((anchor) => normalise(anchor.label));
}

/**
 * A longer label on the same row that swallows the one being looked for.
 *
 * **This is D-099's nested-word defect in a second place, and it is not hypothetical.** An
 * outgoing Krungthai Connext card labels the recipient's account `ไปยังบัญชี` and, on the
 * wallet variant of the same card, labels the recipient `ไปยัง` — and `ไปยังบัญชี` *contains*
 * `ไปยัง`. Thai has no word separator, so a substring test cannot tell the two apart. Looking
 * up the recipient on a bank-account card would therefore land on the account row, and the
 * form would show the owner a crop of the wrong field with nothing marking it as wrong.
 *
 * The ordered alternatives in the field map hide this most of the time — `ผู้รับโอน` is tried
 * first and usually resolves — which is exactly why it needs a rule rather than an ordering:
 * the collision surfaces only when the first alternative fails to recognise, which is the case
 * nobody would think to test.
 */
function eclipsedBy(lineText: string, label: string, siblings: readonly string[]): string | null {
  const longer = siblings.find((sibling) => sibling !== label && sibling.startsWith(label) && lineText.startsWith(sibling));
  return longer ?? null;
}

/**
 * The separator misread, repaired before any label or title is matched.
 *
 * **Measured 2026-08-16, and it is the reason a majority of SCB dates were never located.** D-113
 * established that `/` comes back as `|` or `!` on essentially every card, and treated that as a
 * problem for a date's *value*. It is also a problem for the *label*: SCB Connect anchors its
 * timestamp on `วันที่/เวลา` and KBank Live's outgoing title is `รายการโอน/ถอน`, and both carry a
 * slash. A garbled slash therefore makes the anchor unfindable, and the field is refused as
 * `LABEL_NOT_FOUND` — a refusal that reads as "this card does not print a timestamp" when the truth
 * is that one character of its label did not recognise. Of the seven SCB cards refusing their date
 * on the real sample, **two are found once this repair runs** and five are garbled some other way.
 *
 * **This is a safe repair for the same reason `repairToken` in `lib/notification-card-prefill.ts`
 * is, and for one more.** `|` and `!` carry no value, and here they cannot carry one even in
 * principle: this text is used **only to match labels and titles**, never to read a figure and
 * never to build a crop. Every box this module returns comes from word coordinates, so nothing a
 * substitution does here can change which pixels the owner is shown or which digits are offered.
 */
function repairSeparators(text: string): string {
  return text.replace(/[|!]/gu, "/").replace(/\/{2,}/gu, "/");
}

function lineText(line: readonly OcrWord[]): string {
  return repairSeparators(normalise(line.map((word) => word.text).join("")));
}

/**
 * A label matches only at the **start of its row**, and that rule is load-bearing.
 *
 * Measured 2026-08-12 over the real screenshots. Krungthai Connext prints a `ประเภท` row whose
 * value is a free-text transfer-kind phrase, and one of the measured phrases **contains the
 * direction word `เงินออก`** inside a longer run. Thai has no word separator, so a substring
 * test cannot see that it is part of something else — which is D-099's defect for the third
 * time, now arriving from a *value* rather than from another layout's label. Left alone it split
 * one real card into two and pointed the amount's crop at the type row.
 *
 * Every card layout prints label/value rows with the label on the left
 * (`docs/NOTIFICATION_CARD_CONTRACT.md` § Per layout), so anchoring at the start of the row
 * costs nothing real and closes the whole class. The scan also stops as soon as the row diverges
 * from the label, so a row that merely begins with the same character is not walked to its end.
 *
 * Returns the right edge of the word that completed the label, which is where its value begins.
 */
function labelAtLineStart(line: readonly OcrWord[], label: string): number | null {
  let joined = "";
  for (const word of line) {
    // Repaired per accumulated run rather than per word: a slash can be its own OCR word, and
    // `\/{2,}` collapsing only means anything once the neighbours are beside it.
    joined = repairSeparators(joined + normalise(word.text));
    if (joined.startsWith(label)) return word.right;
    // The row has diverged from the label before completing it, so this is a different row.
    if (!label.startsWith(joined)) return null;
  }
  return null;
}

type LabelHit = { index: number; labelRight: number };

function findCardLabelLine(
  lines: readonly OcrWord[][],
  label: string
): { ok: true; hit: LabelHit } | { ok: false; code: "LABEL_NOT_FOUND" | "LABEL_AMBIGUOUS" } {
  const wanted = normalise(label);
  const hits: LabelHit[] = [];
  lines.forEach((line, index) => {
    const labelRight = labelAtLineStart(line, wanted);
    if (labelRight !== null) hits.push({ index, labelRight });
  });
  if (hits.length === 0) return { ok: false, code: "LABEL_NOT_FOUND" };
  // Two rows carrying the same label is a refusal rather than a first-match. Within one card it
  // means the image caught something this grammar does not model, and picking one would be a
  // guess wearing a result's clothing.
  if (hits.length > 1) return { ok: false, code: "LABEL_AMBIGUOUS" };
  return { ok: true, hit: hits[0]! };
}

/**
 * Which way the money went, from the card's printed words alone.
 *
 * The amount is not consulted and cannot be: the grammar that says where the amount *is* is
 * selected by the direction, so this necessarily runs first. The second signal arrives later —
 * once the owner has typed the amount with the sign the card prints, `readDirection` in
 * `lib/notification-card.ts` reads both and refuses when they disagree (D-099).
 *
 * **Lines are joined with a newline rather than end to end.** Joining them flush would let a
 * direction word form across a row boundary out of two innocent halves, which on a script with
 * no word separator is a real way to invent a reading.
 *
 * **What this cannot do, and it is a limit rather than a gap.** It notices a card paired with
 * the wrong layout only where the two vocabularies differ. **SCB Connect and KBank Live print
 * the identical incoming title `รายการเงินเข้า`**, so this accepts an incoming card of either
 * one under either layout and nothing in the card body can tell them apart (D-099). The nesting
 * rule cannot help: it fires on a word *contained* in a longer one, and these two are equal.
 * The consequence is downstream and worth naming — the two layouts mask the account
 * differently, so the wrong pairing compares the wrong digits, which `matchAccountDigits`
 * reports as no such account on one side and can bind the wrong account on the other. **The
 * channel must come from the LINE conversation the screenshot was taken in**, which means the
 * owner, not the image. Asserted by a test rather than left implicit.
 */
/**
 * The card's words as every direction check in this repo compares them.
 *
 * Exported so the capture form can run `readDirection`'s **second** signal against exactly the
 * text this module read the first one from. The alternative — joining the raw OCR words at the
 * call site — silently differs: `normalise` strips the spaces an engine puts inside a Thai run,
 * so an unnormalised title fails a comparison the reader passes, and the form would report a
 * contradiction that is really a whitespace difference.
 */
export function cardText(words: readonly OcrWord[]): string {
  return groupIntoLines(words).map(lineText).join("\n");
}

export function readCardDirection(
  words: readonly OcrWord[],
  layout: NotificationCardLayout
): CardOcrRead<CardDirection> {
  const text = cardText(words);
  const reading = readDirectionWord(layout, text);
  if (reading.outcome !== "read") {
    return refuse(
      "DIRECTION_NOT_READ",
      `No ${layout.channel} direction word reads off this image, so which way the money went is not decidable. Say so yourself rather than letting it be guessed.`
    );
  }
  return { ok: true, value: reading.direction, source: "printed words" };
}

/**
 * The cards on one screenshot, because a screenshot is not a card.
 *
 * **Measured 2026-08-12 over the six real card screenshots and it is the finding that decides
 * this file's shape:** every one of them carries **two** cards. Reading a screenshot as a single
 * card therefore meets each label twice, and `findLabelLine` refuses a doubled label — correctly,
 * since picking one would be a guess. Before this existed the reader returned `LABEL_AMBIGUOUS`
 * for every field of every two-card screenshot it could read a direction from. The refusal was
 * right and the input was wrong.
 *
 * **A card begins at its direction word**, which holds for all three layouts and is not an
 * assumption: SCB Connect and KBank Live both print their title first, and Krungthai Connext's
 * first row *is* the amount, whose label is the direction word
 * (`docs/NOTIFICATION_CARD_CONTRACT.md` § Per layout). A card then runs to the line before the
 * next card starts, or to the end of the image.
 *
 * Each line is tested with `readDirectionWord`, so the nested-word rule applies here too: a line
 * carrying KBank Live's incoming title does not start a Krungthai card. **It does not separate
 * SCB Connect from KBank Live**, whose incoming titles are identical — see `readCardDirection`
 * for why no rule here can, and why the channel comes from the owner.
 */
export type CardRegion = {
  readonly direction: CardDirection;
  /** The words of this card alone, ready for `locateCardField`. */
  readonly words: readonly OcrWord[];
};

export function findCards(words: readonly OcrWord[], layout: NotificationCardLayout): CardRegion[] {
  const lines = groupIntoLines(words);
  const starts: Array<{ index: number; direction: CardDirection }> = [];
  lines.forEach((line, index) => {
    const text = lineText(line);
    const reading = readDirectionWord(layout, text);
    if (reading.outcome !== "read") return;
    const map = fieldMapFor(layout, reading.direction);
    // The word has to *begin* the row, not merely appear on it. A Krungthai `ประเภท` row can
    // carry a transfer-kind phrase containing `เงินออก`, and without this it starts a phantom
    // card — see `labelAtLineStart`, which is the same rule for the same reason.
    if (map === null || !text.startsWith(normalise(map.directionWord))) return;
    starts.push({ index, direction: reading.direction });
  });
  return starts.map((start, position) => {
    const end = starts[position + 1]?.index ?? lines.length;
    return { direction: start.direction, words: lines.slice(start.index, end).flat() };
  });
}

/**
 * The line carrying the card's title, for the two layouts that anchor a field under it.
 *
 * The title is identified by the direction word it prints, which is the only stable thing on
 * it. `under-title` is a named anchor rather than "the unlabelled line" precisely so this stays
 * anchored: a screenshot carries a second clock — LINE's own message timestamp, outside the
 * bubble — and an unanchored search for a time-shaped string finds it. On one measured KBank
 * pair the two clocks differ, and the card's is the one that equals the statement row's.
 */
function findTitleLine(
  lines: readonly OcrWord[][],
  layout: NotificationCardLayout,
  direction: CardDirection
): number | null {
  const map = fieldMapFor(layout, direction);
  if (map === null) return null;
  const wanted = normalise(map.directionWord);
  const hits = lines.flatMap((line, index) => (lineText(line).startsWith(wanted) ? [index] : []));
  // Two title-shaped lines is a refusal rather than a first-match, for the same reason a
  // doubled label is: picking one would be a guess wearing a result's clothing.
  return hits.length === 1 ? hits[0]! : null;
}

/** `lastLine` is the bottom line the region covers, which is where a wrap would continue. */
type Resolved = { region: OcrWord[]; source: string; lastLine: number };

function resolveAnchor(
  lines: readonly OcrWord[][],
  anchor: CardFieldAnchor,
  layout: NotificationCardLayout,
  direction: CardDirection,
  siblings: readonly string[]
): Resolved | CardOcrRefused {
  if (anchor.kind === "under-title") {
    const title = findTitleLine(lines, layout, direction);
    if (title === null) {
      return refuse(
        "TITLE_NOT_FOUND",
        "This field sits on the line under the card's title, and the title could not be pinned down on this image."
      );
    }
    const value = valueWordsFor(lines, { index: title, labelRight: 0 }, "next-line");
    if (value.length === 0) return refuse("NOTHING_AT_ANCHOR", "Nothing sits on the line under the card's title.");
    // The title travels with the crop: a bare figure asks the owner to trust the targeting,
    // where a crop showing the title above it says which field this is.
    return { region: [...(lines[title] ?? []), ...value], source: "under the title", lastLine: title + 1 };
  }

  const found = findCardLabelLine(lines, anchor.label);
  if (!found.ok) {
    return refuse(
      found.code,
      found.code === "LABEL_NOT_FOUND"
        ? `The label ${anchor.label} could not be found on this card.`
        : `The label ${anchor.label} begins more than one row, so which one carries the value is not decidable.`
    );
  }
  const eclipse = eclipsedBy(lineText(lines[found.hit.index] ?? []), normalise(anchor.label), siblings);
  if (eclipse !== null) {
    return refuse(
      "LABEL_ECLIPSED",
      `${anchor.label} was only found at the start of a longer label on the same row, so that row belongs to a different field.`
    );
  }
  const value = valueWordsFor(lines, found.hit, "same-line-right");
  if (value.length === 0) return refuse("NOTHING_AT_ANCHOR", `Nothing sits beside ${anchor.label}.`);
  return { region: [...(lines[found.hit.index] ?? []), ...value], source: anchor.label, lastLine: found.hit.index };
}

/**
 * A counterparty row that wrapped, added to the region.
 *
 * SCB Connect prints the sender's name, their masked account and their bank on **one row**,
 * which wraps onto a second line when it is long. A crop that stopped at the first line would
 * show the owner half a name and no indication that the rest exists.
 *
 * The continuation is taken only while the following line **does not begin with a label of this
 * grammar**, which is what stops the crop swallowing the next field's row. Start-of-row is the
 * same test every other anchor here uses, and using it matters in the invisible direction: a
 * merely *contained* label would suppress a genuine continuation — `จากบัญชี` and `เข้าบัญชี`
 * are ordinary enough phrases to appear inside a wrapped bank name — and truncate the crop with
 * no signal at all.
 *
 * It is otherwise a conservative rule rather than a measured one: an unrecognised label — and
 * the label lists are open, not closed — reads as a continuation. That errs towards a crop that
 * is too tall, which the owner can see past, rather than one that is too short, which they
 * cannot.
 */
// One extra line is what the measured SCB wrap needs; the cap is two so a slightly longer name
// still arrives whole. It is bounded rather than open because the guard above is the only thing
// stopping the walk, and an unrecognised label would otherwise let one crop run to the end of
// the card — which is the too-tall direction taken far enough to stop being harmless.
const MAX_WRAPPED_CONTINUATION_LINES = 2;

function withWrappedContinuation(
  lines: readonly OcrWord[][],
  resolved: Resolved,
  siblings: readonly string[]
): OcrWord[] {
  const region = [...resolved.region];
  for (let offset = 1; offset <= MAX_WRAPPED_CONTINUATION_LINES; offset += 1) {
    const next = lines[resolved.lastLine + offset];
    if (!next || next.length === 0) break;
    if (siblings.some((sibling) => lineText(next).startsWith(sibling))) break;
    region.push(...next);
  }
  return region;
}

function boxAround(region: readonly OcrWord[]): Box {
  return {
    left: Math.min(...region.map((word) => word.left)),
    top: Math.min(...region.map((word) => word.top)),
    right: Math.max(...region.map((word) => word.right)),
    bottom: Math.max(...region.map((word) => word.bottom))
  };
}

/**
 * Where one field sits on the card, or why it does not.
 *
 * The counterparty fields carry **ordered alternatives** rather than a single label, because a
 * single direction of a single layout has two measured variants — an outgoing Krungthai card to
 * a bank account and the same card to a wallet use different words for the same two fields. Each
 * alternative is tried in turn and the first that resolves wins; an empty list means this layout
 * does not print the field in this direction at all, which is `NOT_PRINTED` and is a different
 * finding from a misread.
 */
export function locateCardField(
  words: readonly OcrWord[],
  layout: NotificationCardLayout,
  direction: CardDirection,
  field: CardFieldName
): CardOcrRead<Box> {
  const map = fieldMapFor(layout, direction);
  if (map === null) {
    return refuse(
      "GRAMMAR_NOT_MEASURED",
      `No ${layout.channel} card has been read in this direction, so where its fields sit is not known.`
    );
  }
  const lines = groupIntoLines(words);
  const siblings = siblingLabels(map);
  const wraps = field === "counterpartyName" || field === "counterpartyAccount";
  const anchors: readonly CardFieldAnchor[] = wraps ? map[field] : [map[field]];

  if (anchors.length === 0) {
    return refuse("NOT_PRINTED", `A ${layout.channel} card does not name this in this direction.`);
  }

  // The refusal reported is the most specific one met, not the last alternative tried. On a
  // field with two measured variants, `LABEL_NOT_FOUND` is the *ordinary* outcome for whichever
  // variant does not apply — reporting it would tell the owner that a label they never saw is
  // missing, while the real condition might be that the label they did see appears twice.
  // Anything other than `LABEL_NOT_FOUND` describes a row that was found and could not be used,
  // which is the finding worth surfacing.
  let refusal: CardOcrRefused | null = null;
  for (const anchor of anchors) {
    const resolved = resolveAnchor(lines, anchor, layout, direction, siblings);
    if ("ok" in resolved) {
      if (refusal === null || (refusal.code === "LABEL_NOT_FOUND" && resolved.code !== "LABEL_NOT_FOUND")) {
        refusal = resolved;
      }
      continue;
    }
    const region = wraps ? withWrappedContinuation(lines, resolved, siblings) : resolved.region;
    return { ok: true, value: boxAround(region), source: resolved.source };
  }
  return refusal ?? refuse("LABEL_NOT_FOUND", "None of the labels for this field were found on this card.");
}

/**
 * Every field on the card at once, which is what a capture form consumes.
 *
 * Each field carries its own result: a card where the balance is legible and the counterparty
 * is not is the ordinary case, not a failed read, and the form shows a crop for the fields that
 * resolved and the refusal's own words for the ones that did not.
 */
export function locateCardFields(
  words: readonly OcrWord[],
  layout: NotificationCardLayout,
  direction: CardDirection
): Record<CardFieldName, CardOcrRead<Box>> {
  return Object.fromEntries(
    CARD_FIELDS.map((field) => [field, locateCardField(words, layout, direction, field)])
  ) as Record<CardFieldName, CardOcrRead<Box>>;
}
