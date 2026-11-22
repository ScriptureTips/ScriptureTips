---
name: modals
description: How ScriptureTips builds modals, dialogs and prompts, and lays out and styles their buttons. Use it whenever you add or change a modal, a dialog, a confirm or alert, a "are you sure" step, a choice prompt, or the buttons in any of them (Save, Cancel, Back, Delete, Copy, Move …), in the web app, the extension or the website plugin, even when the request only says "pop-up", "overlay", "window", "prompt the user" or "ask whether to …". Also use it when buttons look unstyled or are placed oddly.
---

# Modals in ScriptureTips

The project already has modal parts and written conventions. The aim is that every modal looks and
behaves the same, so reuse what's here rather than writing another one. The page-level button rules
are in `docs/vision.md` §8 and `apps/web/AGENTS.md` (UI conventions); this skill gathers them for
modals and adds how the parts work.

## 1. Pick the right kind

| You need | Use | Why |
|---|---|---|
| A question with fixed answers: tell, confirm, or pick one of a few | `alertDialog`, `confirmDialog`, `choiceDialog` from `@scripturetips/dialogs` | A promise of the answer; no React state. It's in a shadow root with its own styles, so the extension and the website plugin use the same prompts. `choiceDialog` describes each choice (copy or link, say). |
| A form or panel opened by its own button, whose state carries on while closed (a PDF build being followed) | `ModalButton` (`apps/web/src/compilations/ModalButton.tsx`) | The content stays mounted. The button is disabled until the page has hydrated. |
| A modal opened from state (a row clicked), mounted only while open, or one where the user selects text | `Modal` (`apps/web/src/annotations/Modal.tsx`) | Light DOM, so the page's styles apply and `getSelection()` can read a selection in it (a shadow root hides it). |
| Content of your own in the extension or plugin | `modalDialog` from `@scripturetips/dialogs` | Shadow root, a Done button; `stylesheets` bring your classes in. |

`SourceDialog` (`apps/web/src/compilations/SourceDialog.tsx`) is the phone's translation menu, built
by hand. Three light-DOM modals are one too many already: extend one of the above rather than adding
a fourth, and if none fits, say so to the owner.

Deleting asks first: `confirmDialog({ …, danger: true })`, or for something large (a compilation) a
typed phrase, as `DeleteCompilationForm` does.

A form inside a modal follows the `forms` skill (`.account-form`, its fields, messages and submit);
this skill covers the modal around it.

## 2. Structure (light-DOM modals)

```tsx
<dialog className="modal" aria-labelledby={heading} onClose={onClose}>
  <div className="modal-body">
    <header className="modal-header">
      <h2 id={heading}>{title}</h2>
      <button type="button" className="modal-close" aria-label={closeLabel}>×</button>
    </header>
    {/* the content */}
  </div>
</dialog>
```

- The native `<dialog>` opened with `showModal()`: focus stays inside, Escape closes it, the page
  dims behind it (`.modal::backdrop`). `.modal` is at most 40rem wide and fits the window.
- Everything outside an open modal is inert, so a popup for something in it must be inside the
  dialog: the plugin's passage tooltip moves its host into the link's `dialog[open]`. Escape closes
  what's open in the modal first (a help tip, a list of suggestions, a passage's tooltip), not the
  modal: `Modal.tsx` prevents the dialog's default only when one of them closes on it.
- The title is the `h2`, so tests find it with `getByRole("dialog", { name: title })`.
- Every way of closing (Escape, ×, the backdrop) ends in the dialog's `close` event; handle that one
  event (`onClose`) rather than each way.
- **The backdrop closes it only when the press started there too** (remember the `pointerdown`
  target). Otherwise selecting words and letting go outside the box closes it.
- **Open it in a mount effect, `if (!d.open) d.showModal()`, and never `close()` it in the effect's
  cleanup.** In development React runs the cleanup and the effect again; that `close` event
  unmounts the modal the moment it opens.
- UI strings (the title, the close label "Close") go in `apps/web/messages/en-NZ.json`, in NZ English.

## 3. Buttons: styles

| Role | Class | Look |
|---|---|---|
| The main action (Save, Copy, Move, Add) | `action-button` | Deep blue, white text |
| Beside it: Cancel, Back, and the other choices | `action-button secondary` | Deep blue text, grey edge, like the shared dialogs' Cancel |
| Deleting | `action-button danger` | Red |

Inside an `.account-form` (the sign-in, account and compilation forms) the form styles its own
submit button; its other buttons use `primary-button`, `danger-button` and `secondary`. A bare
`<button>` with no class looks unstyled: give every button one of these.

## 4. Buttons: layout

From vision §8. "A phone" is up to `48rem` wide (`@media (max-width: 48rem)`).

- **In a modal:** one button is centered; two or more go in an `.actions` row, centered with space
  around them (`justify-content: space-around`) and the usual `0.5rem` gap. `.modal .actions` and
  `.modal .account-form button[type="submit"]` in `globals.css` do this, so use those classes rather
  than a new rule.
- **On a page, a list's add button** sits at the list's bottom left, centered on a phone
  (`.list-add`).
- **On a page, a form's submit button** sits at the form's bottom right, with its other buttons
  (such as Remove) before it; the profile form's Save is centered on a phone (`.account-profile`).
- The shared prompts (`@scripturetips/dialogs`) put their buttons at the right, Cancel first, as
  system dialogs do; that's their own and isn't changed per caller.

Not settled yet (ask the owner rather than choosing): the order of the main action and Cancel in a
modal form, and where a modal's destructive buttons go when it has several rows of buttons.

## 5. Checking it

- A Playwright test opens it by role and name, works it, and checks it closes (`toBeHidden()`); see
  `apps/web/e2e/annotations.spec.ts` for modals that select words.
- Save desktop and phone screenshots (`shot()` in `e2e/support.ts`) and look at both: the buttons
  styled, centered, and nothing cut off on the phone.
- A change to `packages/dialogs` styles counts toward the extension's content-script size budget
  (`apps/extension/src/bundle.test.ts`): styles only one dialog needs go in that dialog's function,
  not the shared `STYLES`.
