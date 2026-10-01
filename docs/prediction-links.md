# Prediction links

Full prediction URLs use `#predictions=v3.<base64url>`: a sparse bit-packed token containing only picked/edited fixtures. The browser omits the fragment for an empty default 2027 scenario; an empty legacy 2023 scenario keeps its identity in a six-character token. `src/state/browser.ts` remains the sole URL writer. Loading an older link preserves its address until a prediction action writes the current format or an exact saved alias is found.

**Copy link** stores the captured canonical token as an immutable public D1 snapshot, copies a short `/s/three.word.alias` URL and replaces the address bar if that snapshot is still current. The service deduplicates identical tokens and redirects aliases into this same fragment reader. A debounced read-only fingerprint lookup reuses already-shared states, with cached aliases restored locally on undo/redo. Schema/profile versions, pinned outcomes and old readers remain unchanged. The full URL is the offline/service-error fallback. [Short-link service](short-links.md)

The optional `?match=<fixture ID>` query opens that game's Details dialog. It is preserved through full/short sharing and redirects but stays outside the prediction token, fingerprint and alias identity. Opening, closing and match-only navigation never add a prediction undo entry. [Match destinations](match-links.md)

`src/state/codec.ts` validates scenarios and selects readers. `src/state/compact-codec.ts` defines v3. The in-memory scenario schema remains version 2; transport version 3 changes its representation.

| Profile byte | Permanent inputs |
| --- | --- |
| 1 | 2027, `fixtures-2026-02`, `provisional-v1`, `defaults-v1`, draw-date rankings from 1 December 2025 |
| 2 | 2023, `fixtures-v1`, `2023-v1`, `defaults-v1`, rankings from 2 October 2023 |

Each profile also fixes the team-ID/index order. Retain its tournament, rules, rankings and completion implementation permanently. Add a new profile when any input or index order changes; never reinterpret an existing byte with newer defaults.

Prediction methods do not change this protocol or its profiles. **Fill matches** plans outcomes separately, then applies one batch with one URL write. Its scores and tries are pinned through the existing saved-result exception mode, preserving the scenario's `defaults-v1` metadata and old manual completion. Existing choices and saved outcomes remain intact. Changing engine data or formulas affects later generated results; shared links replay their saved outcomes. [Engine inputs and formula](prediction-engine.md)

The stream uses most-significant bits first:

| Part | Bits and meaning |
| --- | --- |
| Header | 8 profile ID, 1 resolved-map presence, 6 record count |
| Record | 6 fixture ID, 2 common-choice shortcut |
| General intent | If shortcut is zero: 11 field-presence bits, then typed values for present fields |
| Participant binding | 1 presence bit; when present, two 5-bit team indices |
| Saved result | 2 mode bits: absent, exact profile default, or explicit exception |

Pool shortcuts encode home/away/draw; knockout shortcuts encode home/away advancement. General fields follow the fixed order `winner`, `advancing`, `margin`, home/away scores, home/away tries, home/away try bonuses, home/away losing bonuses. Winner uses 2 bits, intent advancement and booleans use 1, scores/margin use 8, and tries use 4. Presence preserves missing values separately from explicit zero or false, including contradictory intent.

Default result mode is used only when the pinned result exactly equals completion under the immutable profile and participants. Otherwise an exception stores both scores (8 bits each), both try counts (4 bits each) and optional advancement (2 bits); winner derives from scores. This preserves custom pins such as 81–80 and dormant bound knockout choices while earlier fixtures are unresolved. Invalid completed pins are rejected rather than substituted.

V3 is bounded to **1,024 decoded bytes** and the selected tournament's fixture count. Records use strictly increasing valid fixture IDs; duplicate/foreign IDs, unknown profiles, invalid team indices and inconsistent saved outcomes are rejected. Base64url is unpadded and its tail bits must be canonical. Readers also reject trailing bytes and nonzero final bit padding. Malformed URLs remain intact until explicit recovery.

Readers retain v2 deflated JSON frames, v1 2023 fragment links and ordinary-Base64 2023 paths. V2 remains bounded to an 8 KiB frame and 16 KiB inflated payload. Keep fixed golden examples for every transport/profile and tiny/sparse size regression cases when extending the codec.

Measured token lengths include the version prefix and exclude the hostname/path and `#predictions=`:

| Representative scenario | Historical v2 | V3 |
| --- | ---: | ---: |
| One winner choice | 124 | 9 (`v3.AYIKQA`) |
| One detailed match: margin 15 and try bonus | 134 | 11 |
| All 36 pool winners | 250 | 73 |
| All 52 winner/advancement choices with bindings | 468 | 129 |

These fixed representative budgets protect shallow sharing. A fully generated 52-match tournament pins projected scores and tries, with a **355-character token budget**; those additional outcomes use existing bits, without changing URL shape or versions. Links retain intent, valid completed outcomes and version identity, while view/filter state and undo history stay local. Edits use `replaceState`; browser Back/Forward as prediction undo remains a follow-up.
