# Development guide

## Product principles

- Keep every prediction edit, recalculation and undo instant and local. The app is statically hosted: no backend prediction state, accounts or network-dependent editing.
- Sharing means copying the URL. A fresh browser must reproduce the same tournament, choices and outcomes without local storage.
- Let users stay shallow or go deep: pick a winner or pool draw, then optionally edit margin, scores, tries and bonuses. Keep details collapsed and distinguish suggested values from explicit choices.
- Explicit choices take precedence. Preserve contradictory intent, show the conflict, and exclude conflicting results from standings and qualification.
- Make meaningful changes reversible, including reset and downstream bracket consequences. Preserve focus, keyboard access and mobile usability; measure before adding dependencies or rendering work.

## Repository map

- `src/domain/`: plain TypeScript tournament definitions, deterministic completion, standings, qualification and bracket derivation. `types.ts` defines the shared contracts; `tournaments.ts` selects 2027 or legacy 2023.
- `src/state/controller.ts`: immutable scenario snapshots, atomic actions, grouped field edits and undo/redo. `codec.ts` validates/version-packs links; `browser.ts` alone reads/writes prediction URLs.
- `src/App.tsx` and `src/components/`: Solid views with plain CSS. `main.tsx` mounts the app. Keep domain calculations independent of Solid.
- `src/services/results/{compression,model}.ts` and `src/data/`: retained 2023 compatibility. Pure legacy scoring tests remain under `src/services/logs/`.
- `e2e/`: production-browser journeys. [Tournament sources](docs/tournament-sources.md) records official fixtures, rule assumptions and rankings; [upgrade plan](docs/upgrade-plan.md) holds research, measurements and follow-ups.

## Change contracts

- Untouched fixtures stay unpicked. `Prediction.intent` stores explicit constraints; `Scenario.resolved` pins valid completed outcomes. Suggestions are reproducible defaults, not calibrated odds.
- Validate all numeric/URL inputs. Scores and margin are integers 0–255; tries 0–15. Missing values mean inferred, never zero. A drawn knockout requires a separate advancing team.
- Version schema, tournament, dataset, rules and completion. Retain old definitions/readers when introducing new versions; never map 2023 match IDs onto 2027. Never silently recompute a shared scenario with new defaults.
- Bind knockout choices to participants. Clear incompatible picks when known teams change, as part of the same undo action; retain dormant picks while earlier results are temporarily unresolved.
- Continuous edits to one field share an undo entry until blur. New actions clear redo. Browser navigation imports the addressed scenario and resets session history. Edits replace the URL; view/scroll changes leave predictions alone.
- Preserve malformed URLs until explicit recovery. URLs carry current scenario data, never the undo stack. Keep compression bounded and reject unknown versions, duplicate IDs and invalid saved outcomes.
- Use official tournament sources. Current 2027 rules/ranking fallback are explicitly provisional; change their versions and documentation when final regulations arrive.
- Add TanStack tools only for a concrete need. Future methods are Consensus, Rugby model and Bookmakers, using immutable permitted snapshots loaded outside edits. Prefer free sources within a combined US$50/month budget; provider integration follows this milestone.

## Verification

Use Node from `.node-version` and npm 12.1.0 with the committed lockfile: `npm ci`, `npm run dev`, `npm run check`. The combined check runs native TypeScript 7 and compatible TypeScript 6 checks, flat ESLint, unit/property tests and the production build. Keep the TS6 API dependency for lint compatibility.

For interaction/state changes, install Chromium with `npx playwright install chromium` and run `npm run test:browser`. Cover affected scoring/qualification rules, partial/conflicting edits, grouped and dependent undo, fresh-browser sharing, both legacy formats, malformed links, navigation, focus and mobile layout. Focused tests are prohibited. Keep this guide concise and update it when architecture or contracts change.
