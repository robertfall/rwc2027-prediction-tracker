# Development guide

## Product principles

- Keep every prediction edit, recalculation and undo instant and local. The app is statically hosted: no backend prediction state, accounts or network-dependent editing.
- Sharing means copying the URL. A fresh browser must reproduce the same tournament, choices and outcomes without local storage.
- Let users stay shallow or go deep: pick a winner or pool draw, then optionally edit margin, scores, tries and bonuses. Open Details on request and distinguish suggested values from explicit choices.
- Keep one compact sticky toolbar and dense match views. Matches are the main column; standings sit to the right on desktop and stack on mobile (above matches in By pool). Use the [supplied design](docs/design/README.md); keep explanations in tooltips or the footer.
- Explicit choices take precedence. Preserve contradictory intent, show the conflict, and exclude conflicting results from standings and qualification.
- Make meaningful changes reversible, including reset and downstream bracket consequences. Preserve focus, keyboard access and mobile usability; wrap full match-team names without truncation and keep team choices at least 44px tall. Measure before adding dependencies or rendering work.

## Repository map

- `src/domain/`: plain TypeScript tournament definitions, deterministic completion, standings, qualification and bracket derivation. `types.ts` defines the shared contracts; `tournaments.ts` selects 2027 or legacy 2023.
- `src/state/controller.ts`: immutable scenario snapshots, atomic actions, grouped field edits and undo/redo. `codec.ts` validates/dispatches link versions; `compact-codec.ts` writes sparse v3 bits with immutable profiles; `browser.ts` alone reads/writes prediction URLs.
- `src/App.tsx` and `src/components/`: Solid pool/timeline/rounds/bracket views, standings and the shared Details dialog, with plain CSS. `main.tsx` mounts the app. Keep domain calculations independent of Solid.
- `src/services/results/{compression,model}.ts` and `src/data/`: retained 2023 compatibility. Pure legacy scoring tests remain under `src/services/logs/`.
- `wrangler.jsonc` and `src/worker.ts`: Cloudflare static assets plus a stateless document fallback preserving legacy slash paths. Root/common assets bypass the Worker; prediction state stays in the browser.
- `e2e/`: production-browser journeys. [Tournament sources](docs/tournament-sources.md) records official fixtures, rule assumptions and rankings; [upgrade plan](docs/upgrade-plan.md) holds research, measurements and follow-ups.

## Change contracts

- Untouched fixtures stay unpicked. `Prediction.intent` stores explicit constraints; `Scenario.resolved` pins valid completed outcomes. Suggestions are reproducible defaults, not calibrated odds.
- Validate all numeric/URL inputs. Scores and margin are integers 0–255; tries 0–15. Missing values mean inferred, never zero. A drawn knockout requires a separate advancing team.
- Version schema, tournament, dataset, rules and completion. Retain old definitions/readers when introducing new versions; never map 2023 match IDs onto 2027. Never silently recompute a shared scenario with new defaults.
- Keep [links tiny and sparse](docs/prediction-links.md). Retain v3 profiles/team-index order and all v2/v1/legacy readers, with golden version examples and strict 9/11/73/129-character representative token budgets. Encode default pins only on exact equality; preserve absent, zero, false, conflicts and custom outcomes.
- Gate Knockout until every pool fixture has a valid completed result. Qualification markers use the same derived state, including best thirds; bracket connectors follow fixture sources, never match-number adjacency.
- Bind knockout choices to participants. Clear incompatible picks when known teams change, as part of the same undo action; retain dormant picks while earlier results are temporarily unresolved.
- Details edits apply live and share one undo entry across the whole dialog session. Closing ends the group without reverting; Clear pick is a separate undoable action. Keep inferred suggestions distinct from explicit choices.
- New actions clear redo. Browser navigation imports the addressed scenario and resets session history. Edits replace the prediction URL; phase, layout, filter and scroll state stay local and out of shared links.
- Preserve malformed URLs until explicit recovery. URLs carry current scenario data, never the undo stack. Keep payloads/decompression bounded and reject unknown versions, duplicate IDs, noncanonical tails and invalid saved outcomes.
- Use official tournament sources. Current 2027 rules/ranking fallback are explicitly provisional; change their versions and documentation when final regulations arrive.
- Add TanStack tools only for a concrete need. Future methods are Consensus, Rugby model and Bookmakers, using immutable permitted snapshots loaded outside edits. Prefer free sources within a combined US$50/month budget; provider integration follows this milestone.

## Verification

Use Node from `.node-version` and npm 12.1.0 with the committed lockfile: `npm ci`, `npm run dev`, `npm run check`. The combined check runs native TypeScript 7 and compatible TypeScript 6 checks, flat ESLint, unit/property tests and the production build. Keep the TS6 API dependency for lint compatibility.

For interaction/state changes, install Chromium with `npx playwright install chromium` and run `npm run test:browser` against the local Workers runtime. `BASE_URL` targets a deployed site. Cover affected scoring/qualification rules, partial/conflicting edits, grouped and dependent undo, fresh-browser sharing, both legacy formats, malformed links, navigation, focus and mobile layout. Focused tests are prohibited. Keep this guide concise and update it when architecture or contracts change.

Deployment follows PSS: use `git push` to `main` for normal publishing to `rwc2027.myplaceforthings.com`, with checks before deployment and live smoke tests afterward. Branches/PRs check; manual workflow runs deploy the selected branch. `npm run deploy:check` is a dry run; `npm run deploy` is for bootstrap/recovery. Preserve legacy URLs before Cloudflare asset normalization, immutable caching only for hashed bundles, and runtime/credential files in `.gitignore`. Keep npm's pinned `allowScripts` entries consistent with Wrangler's required esbuild/workerd versions.
