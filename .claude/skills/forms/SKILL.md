---
name: forms
description: How forms are built and styled in the ScriptureTips web app (`apps/web`), so every form looks and behaves the same, on a page or inside a modal. Use it whenever you add or change a form or any field in one (a text box, select, textarea, checkbox or radio choice), a field's label, hint or error, a Save or Submit button, or a form's behavior while it sends (busy, errors, saved), even when the request only says "let the user enter / type / choose / edit …" or "add a field". Also use it when fields look unstyled or unlike the rest of the app.
---

# Forms in the web app

The web app has one form design, already used by the sign-in, account, compilation and PDF build
forms. Build new forms with it, so the whole app reads as one. This skill covers `apps/web` only;
the extension's settings and the `scripture.tips` site have their own pages.

Where a form sits inside a modal, the `modals` skill covers the modal itself. Button styles and
where buttons go are in that skill and `docs/vision.md` §8; this one points to them rather than
repeating them.

## 1. The class: `.account-form`

Put `className="account-form"` on the `<form>`. The name is historical (it began with the sign-in
and account forms); it's the app's form class. It gives a column of fields 1rem apart, at most
26rem wide on a page; in a modal it fills the modal. The styles are in `apps/web/src/app/globals.css`
(search for `.account-form`).

When a modal's content can't be one `<form>` (nothing in it is typed and sent), put the class on its
container so its fields still look the same.

## 2. Fields

```tsx
<label>
  <span>{t("titleField")}</span>
  <input name="title" required maxLength={100} />
  <small>{t("titleHelp")}</small>
</label>
```

- The wrapping `<label>` names the field (tests find it with `getByRole("textbox", { name })`).
  Its text is muted and a little smaller, above the field; the field is full width, 1rem, with a
  grey edge and rounded corners; the hint (`<small>`) sits under it. A hint outside the label is
  joined by `aria-describedby`.
- `<select>` and `<textarea>` take the same box. The textarea is in the serif face (`--serif`) and
  grows downward only, since most of the app's long text is scripture wording.
- **A label with a help icon** can't wrap the field (the icon is a button, and a label holds one
  control). Use a `<div className="field">` with `<span className="field-label">` holding a
  `<label htmlFor>` and `<HelpTip label="About the …">` (`src/ui/HelpTip.tsx`: a "?" whose tip
  opens on hover, focus or tap), then the field with that `id`, as `EditModal`'s note does.
- **A reference or search field** is the search widget's `<st-search-input>` (its own `instance`,
  set up with `configureSearch`), not a plain input: its input is in a shadow root and named
  there, so wrap it in `<div className="field">` with an `aria-hidden` `<span>` caption, as
  `EditModal`'s new target does. Read its text with `getSearch(instance).getQuery()`.
- Native limits (`required`, `maxLength`, `pattern`) go on the field, as `NewCompilationForm` does;
  the API checks again and answers with an error code.
- **Radios and checkboxes** go in `<label className="choice">` (inside a
  `<fieldset className="choices">` with a `<legend>` when there are several), so the box sits
  beside its text instead of taking the text-box look `.account-form input` gives every input:

  ```tsx
  <fieldset className="choices">
    <legend>{t("kind")}</legend>
    <label className="choice">
      <input type="radio" name="kind" value="correction" defaultChecked />
      <span>
        <strong>{t("correction")}</strong> <small>{t("correctionHelp")}</small>
      </span>
    </label>
  </fieldset>
  ```

## 3. Messages

- An error: `<p role="alert" className="error">` just above the buttons. Read the code from the
  response with `errorCode(res)` and word it with `useErrorText()` (both in
  `src/compilations/errors.ts`); the codes' words are in `messages/en-NZ.json`.
- Saved, or done: `<p role="status" className="saved">`.
- Before something that can't be undone: `<p className="warning">` above the fields.
- All of it in NZ English, from `messages/en-NZ.json`.

## 4. Buttons

- The main button is `type="submit"`, with no class: `.account-form` makes it deep blue and bold.
  Enter in a text field submits the form (unless that button is disabled).
- Every other button is `type="button"`, with the classes in the `modals` skill (`action-button
  secondary` for Cancel or Back, `action-button danger` for deleting); beside the submit they take
  its size. Older forms use `primary-button`, `danger-button` and `secondary`; keep those where they
  are.
- Where they go (vision §8): on a page, the submit at the form's bottom right with its other buttons
  before it; in a modal, centered, two or more in an `.actions` row.
- Forms can't nest. If a field has a button of its own (*Show* beside a reference), make it
  `type="button"` and handle Enter in that field yourself (`preventDefault`), as `AddModal` does.

## 5. Behavior

- Handle the submit in script: `onSubmit` with `e.preventDefault()`, reading the values from
  `new FormData(e.currentTarget)` or from state.
- **A form rendered with the page keeps its submit disabled until the page has hydrated**
  (`useHydrated`, `src/hydrated.ts`): `disabled={busy || !hydrated}`. An earlier click would submit
  natively and put what was typed (an email address) into the URL. A controlled field is
  `readOnly={!hydrated}` until then, or text typed early is lost or mixed up. A form that only
  mounts after a click (a modal opened from state) is already past that point.
- While it sends: busy (the submit disabled), the last error cleared; then the error shown, or the
  form's work done (a reload, a navigation, a status). The compilation forms do this with
  `useSubmit` (private to `src/compilations/forms.tsx`), the annotation modals with `useItemAction`
  (`src/annotations/itemModal.tsx`), and sign-in and account each by hand. There's no shared one
  yet: copy that shape, and mention the duplication to the owner rather than adding a fifth.

## 6. Not this pattern

- The reader's search and passage forms (`SearchForm` `.search`, `HomeSearch` `.home-fallback`,
  `ReaderSearch` `.reader-search-fallback`, `PassageEdit` `.passage-title-form`): GET forms to
  `/read` that work without script, styled for their places.
- `InPlaceField` (editing a title or abbreviation where it's shown), the account page's field cards
  (`.account-profile`, `.account-row`), and the study tooltip's buttons (`.study-tip-actions`).
- Not converted yet: the annotations page's inline rename form (in a collection's box).

## 7. Checking it

- A Playwright test fills the fields by role and name, submits, and checks the result and the error
  case; a form in a modal also checks the modal closes.
- Save desktop and phone screenshots (`shot()` in `e2e/support.ts`) and look at both: fields full
  width, labels above them, buttons styled and placed as above, nothing cut off on the phone.
