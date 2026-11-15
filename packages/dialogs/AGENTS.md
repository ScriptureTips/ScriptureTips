# @scripturetips/dialogs

Shared dialogs for the browser extension (and later the web app): `alertDialog`, `confirmDialog` and `modalDialog`, each returning a promise (`if (await confirmDialog({ title, message, confirmLabel, danger: true })) …`). No dependencies and no framework: the browser's own `<dialog>` (modal, focus kept inside, Escape), in a shadow root whose host is reset inline with `!important`, in px sizes and its own font stack, in light and dark, so no page's styles reach it. Escape, a press on the backdrop and Cancel all answer no. Text is only set as text (the message keeps its line breaks).

- `danger: true` (a delete): the go-ahead button is red, the dialog is an `alertdialog`, and the focus starts on Cancel, so a stray Enter keeps things as they are. Otherwise the focus starts on the go-ahead button.
- Words are the caller's (the extension's are New Zealand English); the defaults are "OK" and "Cancel".
- The words and the focus a dialog starts with are in `options.ts` (unit tested). The dialog itself needs a browser, so it's tested through the extension's browser tests (`apps/web/e2e/extension.spec.ts`).
- `modalDialog({ title, content, closeLabel?, stylesheets?, width? })`: a modal holding nodes the caller builds (and keeps in step while it is open), closed by Done, Escape or the backdrop; `stylesheets` are addresses brought into the shadow root so the caller's classes work inside it. Prompts opened from inside it stack above it.
- Deliberately small: no custom buttons, inputs, icons or stacking of the built-in ones. Add what is needed when it is.
