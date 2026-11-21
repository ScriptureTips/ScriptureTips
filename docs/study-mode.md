# ScriptureTips: Study Mode

> Status: draft, 2026-11-21. Companion to [vision.md](vision.md) §3.2. The implementation notes, down to each file, are in [apps/web/AGENTS.md](../apps/web/AGENTS.md) ("Study mode").

## 1. Purpose

Study mode turns the reading and comparing views into a place to study the original languages. It marks the words that can be studied, explains them from the Hebrew and Greek, searches, links passages to each other, and shows translator's notes and the user's own notes. The word types never change the layout of the text: they only paint over it. Note marks are text, and the footer can hide them (§4.1).

## 2. Turning it on

- The **Study** button beside the read, compare and edit modes turns study mode on and off.
- Study mode is part of the page's address (`?study=1`), so a reload, a shared link and the back button all keep it.
- Opening a compilation from the compilations list **resets where the study window was left**, so the next study session starts fresh (§3).
- Turning study mode on clears the last search in the window.

## 3. The study window

A window floats over the page without blocking it. It has a header (the title and a button), a body (the search, §5) and a footer of checkboxes (§4.1).

**Starting state**

- No remembered position (a compilation was just opened): the window starts **expanded**, centered in the viewport (the Study button can be anywhere on the page), at a default size (below).
- A remembered position: it starts as the **bar** (below), and expands to where it was left.

**Default sizes.** Four sizes, chosen by the viewport's width with breakpoints (no calculation). Each is about a quarter of its viewport's area; the largest is 1000 × 600 px. Defined in `DEFAULT_SIZES` (`apps/web/src/study/box.ts`).

| Viewport width | Window (w × h, px) |
|---|---|
| 1920 and wider | 1000 × 600 |
| 1280 to 1919 | 720 × 440 |
| 768 to 1279 | 480 × 360 |
| under 768 | 320 × 280 |

The window is never wider or taller than the screen less its margins (8 px): on a short viewport it is shortened to fit, still centered.

**Moving and resizing.** Drag it by its header, resize it from its corner (pointer events, so touch works; the corner's grab area is thumb-sized on touch screens). It always stays wholly on screen. Where it was left is remembered in this browser (`localStorage`), until a compilation is opened from the list.

**The bar.** The header's × (or Escape) minimizes the window to a bar: 176 px wide, at the far left of the reading head, showing only the header, whose button is now an expand icon. The head holds the bar's place (the dock) and the bar follows it as the page scrolls. Expanding it, or the selection tooltip's *Search for this*, moves it back to where it was. The window closes only when study mode turns off. On a phone, while study mode is on, the read, compare and edit buttons move into the ⋮ menu to leave the head room for the bar.

## 4. Marked words

- Words that can be studied are drawn with a color by category: person, place, name, conjunction, verb, noun, other. The colors are CSS variables (`--study-*`).
- A run of adjacent words that share one Strong's number (an idiom such as "freely eat") is drawn together with a dashed outline.
- Hovering a word shows its Hebrew or Greek word, its number and its gloss.
- The footer's *Word types* checkbox shows or hides the colors (remembered; it doesn't change study mode). Hovering its label shows what the colors mean, grey while they're hidden.
- **Paint only.** Backgrounds, an inset edge and an outline: never padding, borders or font changes, so turning study mode on moves nothing.
- **Which translations.** Only the KJV family is marked. Other tagged translations tag the wrong words too often (about one in four link to the exact original word, against nine in ten for the KJV).

### 4.1 The footer: what's shown over the text

Three checkboxes, each remembered in this browser (`study/layers.ts`). Hovering a label opens a tooltip above it (fixed, so the window doesn't clip it).

| Checkbox | Tooltip | Hides or shows |
|---|---|---|
| **Word types** | What the colors mean (the legend) | The word colors (§4) |
| **Translator's notes** | Each translation with notes on screen, with its own checkbox (the compilation's own text goes by its abbreviation), then every other translation with notes on the chapter, unchecked until chosen (`GET /api/translations/notes`) | That translation's note marks and its entries in the lists under the text; the footer's box, all of them. Disabled when nothing on screen has notes. |
| **Your notes** | The user's note collections, each with a checkbox: today only the **default collection**, which holds the annotations in no other collection (the scripture links, §7) | Their marks, lists and amber highlights |

Letters run on over what's shown: hiding a translation's notes re-letters the rest (a, b …), and showing all puts the translation's own letters back.

## 5. Search

The window's body is the core search widget (`packages/search`), covering references, text and original-language words in the translations in view. Picking a result puts the verse or run of verses into the search field and shows its text in the body. Typing or searching again goes back to the results. Before a search, a tip card is shown (a richer welcome is planned: vision.md §10, stage 2).

## 6. The selection tooltip

Select words in the compare table (or double-click one) and a tooltip opens by the selection, with:

- each marked word: the original word in its category color, its number, kind and gloss, how often it's used in the original text;
- **Dictionary:** the dictionaries' entries for the word;
- **Search for this:** opens the window and searches the words;
- **Copy:** copies the selected text;
- **Link** (signed in, and the verses can be told): links the selected words to a verse or run of verses found with a search field of its own (§7).

On a phone the selection is made by a long press, and the tooltip opens when the selection stops changing. The tooltip fits the room on the side of the selection with more, and hides while its selection is scrolled out of sight.

## 7. Links

A link joins the selected words to a passage. Links are private, and listed from either end.

- The tooltip lists the user's links on the selected verses, each with the quoted words, and a × to remove it.
- Linked words are drawn in amber (one color for all of them). With a mouse, the linked words under the pointer are drawn stronger.
- Clicking linked words selects them and opens the tooltip with only the links pinned there.
- Each link keeps its quoted words and an anchor (the wording, the verse and character offsets), so it is found again if the wording moves.
- The link's passage opens in a tooltip with the plugin's translation switcher and *Read more*.
- The relationship type and a note have no form yet.

## 7.1 Notes in the text

- **Translator's notes** are lettered marks (a, b …) in the read tab, and in study mode in the compare and edit views too (lettered through the whole table there, in reading order, so each letter in the list under it names one note). A mark's tooltip shows the note, ending with the abbreviation of the translation it's from, in a compilation.
- **Other translations' notes.** A note whose translation's own wording of that verse isn't on screen (no column for it, and the verse isn't taken from it) has no words to sit in, so once chosen in the footer: in the read tab each note is a mark at the end of its verse, lettered on with the page's own; in compare and edit the marks sit under a rule below the verse in the compilation's column (`study/StudyOtherNotes.tsx`). The read tab lists them under the passage, by translation, each entry ending with its abbreviation; compare and edit list them with the other translator's notes.
- **Your notes** (today, the scripture links) are capital-lettered marks (A, B …) at the end of the verse their words are pinned in, in the wording they were made in only. A mark's tooltip quotes the words and links the passage.
- **Pinned to the compilation.** A link made in the compilation's own text (its column in compare and edit, or the read tab reading it) is pinned to the compilation (`@compilation`, the `data-link-in` of the verse), even where the verse is taken unchanged from a translation. A link made in a translation's column is pinned to that translation. Links made before this change stay pinned to the translation.
- **Lists.** The read tab lists each passage's notes under it; compare and edit list the chapter's notes under the table. *Translator's notes* come first; *Your notes* follow, grouped by collection, then by the translation (or the compilation's abbreviation) they're pinned in, in verse order. Each entry has its letter, its verse and its text. The lists flow in columns as wide as the reading area's (one on a phone).
- **Jumps.** A mark jumps to its list entry. An entry's letter jumps to the start of its verse, below the reading head, and flashes the verse sky blue for a second, fading out over two more (not with reduced motion).
- **References.** The passages in these tooltips and lists (your notes' passages, and references written in translator's notes) show the ScriptureTips passage tooltip, as the study tooltip's links do.
- **Placement.** A note's tooltip is fixed on the screen, placed from its mark when it opens (above it, else below), so it stays by its mark across the reading columns and inside the sliding comparison table.

## 7.2 Compare columns

Any translation can be a compare column, the compilation's base too, so the compilation's own text can be read beside the translation it started from. The three default columns still leave the base out.

## 8. Known issues

- **Firefox: a note's tooltip can reflow the reading columns.** In the read tab, when a note's tooltip opens (its `display` goes from `none` to `block`), Firefox can move the last line of a column into the next column while the tooltip is open. Seen in Firefox only (in a responsive-design window, 1280 × 800); Chrome is fine. **Deferred as a rare edge case.** It needs investigating to find out whether it's a Firefox bug.
  - *Tried:* the tooltip is `position: fixed`, placed from its mark's rectangle when it opens (`ui/HoverTip.tsx`), and starts at `top: 0; left: 0` rather than at its static position inside the columns. That didn't settle it in Firefox. A small standalone copy (fixed-height columns, a superscript mark, a tooltip switched from hidden to block) didn't reproduce it in Chromium, absolute or fixed, so a Firefox build is needed to reproduce it.
  - *Next, if it matters:* render the open tooltip outside the columns (a portal to `document.body`), with its own hover handling so the pointer can still move from the mark onto the tooltip.

## 9. Rules for changes

- Anything that searches or shows ScriptureTips data is built in the shared packages (`packages/search`, `packages/scripture-links`), so the widget and the extension inherit it. See [AGENTS.md](../AGENTS.md).
- The word types must stay paint only: tests check that turning them on moves nothing (with translator's notes switched off, since their marks are text).
- A change to the extension's or plugin's behavior needs its help topic on the `scripture.tips` site in the same change ([apps/site/AGENTS.md](../apps/site/AGENTS.md)).

## 10. Tests

- `apps/web/src/study/box.test.ts`: the window's placement, the four default sizes, dragging and resizing.
- `apps/web/src/study/units.test.ts`: idiom runs and Strong's numbers.
- Playwright: the compilation specs (`e2e/compilations.spec.ts`, `e2e/reading-area*.spec.ts`): the window's centered start, the footer's checkboxes and tooltips, your notes' marks and lists in read, compare and edit, and the base as a compare column. `rememberStudyWindow` (`e2e/support.ts`) gives a test a remembered place, so the window starts as the bar. Native touch selection can't be made in the e2e browser, so the test makes the selection the way the phone would.
