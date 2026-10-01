# Match destinations

Use `?match=<fixture ID>` to open a game's Details dialog:

- `/?match=25` opens match 25 in an unpicked 2027 tournament.
- `/?match=25#predictions=v3.…` opens it with the full saved scenario.
- `/s/maple.river.sunny?match=25` opens it with that alias's saved scenario.

The ID belongs to the addressed tournament. Current 2027 IDs run from 1 to 52; legacy 2023 IDs run from 1 to 48. A destination never changes prediction schema, token version, completion, standings or fingerprint. Different matches in the same prediction use the same stored alias.

## Interaction contract

Opening Details replaces the URL's match parameter without adding a prediction undo entry or browser-history entry. Live edits keep the destination and remain grouped into one dialog session. Done, Escape, backdrop dismissal and Clear pick remove the parameter; closing keeps all edits. Clear pick remains a separate undoable prediction action.

The dialog has a compact **Copy match link** control that uses the existing sharing/clipboard flow. It captures the current prediction and destination before waiting for storage; later edits or dialog navigation cannot change the link being copied. Clipboard status and selectable fallback links are available inside the modal. Full URLs remain usable offline, and empty 2027 match links need no database record.

Startup and match-only browser navigation open the addressed game. Query-only match navigation preserves prediction undo/redo while ending the previous dialog's field group; navigating to a different scenario still imports it and starts fresh session history. Alias replacement and prediction updates keep a stable dialog mounted, preserving input focus. Closing returns focus to the visible match control or current stage control.

Ready knockout matches open in the knockout view. Unresolved knockout destinations show fixture-source labels and a waiting dialog, with prediction fields and Clear pick disabled; they do not bypass qualification or infer participants. Pool destinations reveal the appropriate pool when necessary.

Missing, duplicated, noncanonical or out-of-tournament match IDs are ignored without changing the prediction or rewriting the URL. A malformed prediction URL still requires explicit recovery before Details or sharing can be used. Only `src/state/browser.ts` writes browser URLs; sharing builders and Worker redirects preserve query destinations without adding them to stored snapshots.
