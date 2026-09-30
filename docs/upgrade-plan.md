# Repository audit and upgrade path

Initially audited on **2026-09-30**, at source commit `298d6bf`. **Deliveries 1–5 are implemented**, including the supplied compact design: pool/timeline/rounds/bracket views, responsive standings and a shared live Details dialog. The app uses Solid, modern tooling, the complete 2027 tournament, atomic undo/redo and reproducible URLs. The original React audit and earlier measurements below remain historical evidence.

## Consolidated update plan

Implemented stack: **Solid + Vite + TypeScript + plain CSS**, with pure domain/actions and a thin Solid subscription adapter. Native signals/memos handle phase, layout and filters; no TanStack package is needed yet. The supplied design is implemented against the actual tournament and scenario contracts. [Design mapping](design/README.md)

| Delivery | Work and completion gate |
| --- | --- |
| **0. Correctness baseline — complete** | Keep the repaired numeric/partial state, scoring, codec and browser-navigation behavior as regression evidence. Existing checks pass with 91 tests; retain legacy URL examples and production/browser measurements. |
| **1. Modern tooling and CI — complete** | Pin Node 24 LTS/npm and browser targets; upgrade Vite, Vitest, TypeScript and flat ESLint in compatible steps. Add Solid tooling and CI using `npm ci`/`npm run check`. Keep the current editor working during transition, then remove React-specific packages and Zustand after their adapters disappear. Gate: app/tooling checks, tests and production build pass on the pinned runtime, and CI checks those same commands. |
| **2. Pure tournament and scenario contracts — complete** | Introduce versioned tournament definitions, stable match/team IDs, prediction intent/overrides, completion outputs, method/snapshot identity and one action/history interface. Extract the URL/state adapters from framework-specific wiring. Define missing/inferred/explicit values, conflicts, pool draws and knockout advancement. Gate: pure tests show deterministic completion, explicit-choice preservation, validated snapshot replay and one action for all dependent changes. |
| **3. Representative Solid slice — complete** | Build a pool editor with winner selection, expandable scoring details and standings, plus a dependent knockout example. Wire actual URL replay, undo/redo and invalid-link recovery into this slice. Gate: changing a winner updates dependent outcomes and one undo restores them; share/reload reproduces the scenario; focus and keyboard input remain stable; measure bundle size and editing latency against the repaired React baseline. |
| **4. Complete the 2027 domain — complete** | Import the official 24-team/six-pool/52-match schedule and timezone metadata. Implement pool points, full tie-break statistics, best thirds, all 15 qualifying-pool permutations and every knockout stage including bronze. Version rule/ranking inputs and track provisional regulations explicitly. Gate: all qualification permutations and changed-participant dependencies pass; 2023 links retain their original tournament identity. |
| **5. Complete the lightweight interface — complete** | Implement the supplied compact toolbar, pool/timeline/rounds/bracket views, desktop standings margin and mobile stacking. Keep winner choices prominent; the shared Details dialog progressively exposes margin, tries, scores and bonuses. Apply edits live as one dialog history group; Clear pick is separate. Gate: all pool results must be valid before Knockout opens; explicit conflicts, automatic consequences, reset and sharing remain correct, with stable focus and accessible mobile controls. |
| **6. Static release and cleanup — first build deployed** | Cloudflare Workers configuration, push-based GitHub deployment, custom domain, runtime routing/cache tests and publishing instructions are implemented. The custom hostname is publicly reachable with valid TLS and all 14 smoke tests pass. The first push's CI checks pass; automated publication needs the Cloudflare API-token secret. Flag attribution and unused asset/data pruning remain. Gate: push-based publication passes and release cleanup is complete. |
| **Parallel: provider evaluation and collaboration** | Evaluate free OddsPapi/API-Rugby access and inexpensive alternatives, within a combined US$50/month ceiling. The user owns the Sports4Cast sponsorship/collaboration approach. Start with 20–30 varied matches for usability, then timestamped pre-match history for predictive evaluation. Gate: useful coverage/fields/history, costs and rights to publish derived snapshots are established before integration. This work does not block deterministic completion or the static release. |
| **7. Calibrated prediction engine** | Add interchangeable Consensus, Rugby model and Bookmakers methods behind the completion interface. Calibrate probabilities, score/margin and try/bonus outcomes; condition completion on explicit user choices. Publish permissible immutable snapshots outside the browser, with a bundled fallback. Gate: holdout evaluation beats or explains differences from simple baselines; old links replay unchanged, source gaps are labelled, and edits remain synchronous/local. |

The first product milestone is complete and the initial build is deployed. Push-based release verification, unused asset/data pruning and provider integration remain follow-ups; some release documentation and browser automation were brought forward to support this milestone.

### Implemented state and verification

- The official 2027 definition contains 24 teams, six pools and all 52 fixtures, including venue-local timezone/DST conversion, all 15 third-place allocations and bronze. Original 2023 datasets and both legacy URL formats remain supported. [Verified sources and provisional rules](tournament-sources.md)
- Winner choices fill unspecified scores/tries; details expose margin, scores, tries and explicit/automatic try and losing bonuses. Conflicting intent remains visible and cannot affect qualification. A regulation draw can have a separate knockout advancing choice.
- Framework-independent actions use immutable snapshots and grouped history. The shared Details dialog applies edits live as one session group; closing retains edits and Clear pick is separate. Changes to known participants clear dependent choices atomically; temporarily unresolved matchups retain dormant picks. Reset is undoable. Imports start fresh session history.
- Versioned `v3` fragment links use sparse bit-packing with immutable tournament/rules/default profiles. They retain intent, valid resolved outcomes and participant bindings, with v2/v1/ordinary-Base64 readers preserved. Editing uses one `replaceState` writer. Empty legacy scenarios retain 2023 identity; malformed links remain untouched until recovery. Payloads and legacy decompression are bounded. [Link format](prediction-links.md)
- React, React DOM, Zustand, Immer, Valibot and their renderer-specific tooling are removed. `fflate` remains for reading historical v2 links: that writer produced a completed 52-match token of 468 characters, versus 9,250 for raw scenario JSON encoded as Base64url. Current writes use v3 below. TanStack remains a future, individually justified addition.
- Initial delivery verification passed **179 unit/property tests**, both TypeScript compilers, lint and production build. **Six Playwright production-browser journeys** covered winner/detail editing, grouped and dependent undo, all 52 matches, fresh-browser sharing, reset, bonuses/conflicts, malformed/legacy links, Back/Forward, clipboard, keyboard, focus and 375px layout. Eight hosting tests brought that suite to 14. The first push's remote CI checks passed; all 14 tests also passed against the deployed custom domain.

### Sparse link restoration

The current v3 writer stores only changed fixture records. An immutable profile byte pins tournament, dataset, rules, ranking inputs, completion and team-index order; common winner/advancement choices use a two-bit shortcut. Deeper choices keep field presence, including explicit zero/false and contradictions. Exact default pins reconstruct only under that retained profile; custom resolved outcomes and dormant participant bindings remain explicit. One browser URL writer and all previous readers are retained.

| Representative token, including version prefix | Historical v2 | Current v3 |
| --- | ---: | ---: |
| One winner choice | 124 characters | 9 characters |
| One detailed match: margin 15 and try bonus | 134 | 11 |
| All 36 pool winners | 250 | 73 |
| All 52 winner/advancement choices | 468 | 129 |

An empty default 2027 scenario needs no prediction fragment; empty 2023 identity takes six token characters. The codec bounds v3 to 1,024 bytes and rejects noncanonical tails, extra bytes, duplicate IDs and invalid pins. Keep golden historical/profile examples and these fixed tiny/sparse budgets when extending the format.

The updated checks pass with **203 unit/property tests and 21 browser/hosting tests**, both TypeScript compilers, lint, production build and Cloudflare dry run. Compact standings now reserve separate columns for team codes, qualification marks and points; all 24 codes fit at 320px and 375px with complete pool results.

The current build is **109.46 kB JavaScript / 32.69 kB gzip** and **27.79 kB CSS / 5.91 kB gzip**, excluding fonts/flags. On the same standalone Chrome benchmark, 82 actions recorded median/p95 times of **3.3/4.8 ms normally** and **14.3/16.5 ms at four-times CPU slowdown**, with no external/fetch/XHR edit requests or page errors. The detailed final URL was 166 characters including the local origin. One cached completion per profile/fixture avoids resolving unchanged defaults again during serialization; decoded outcomes remain independent values.

### Supplied design verification (before v3)

The final HTML composition now drives the Solid interface, with the actual domain/state preserved. Pool views offer By pool and Timeline; knockout offers Rounds, Timeline and a source-linked Bracket, with mobile round selection and bronze. Standings sit beside matches on desktop and stack on mobile, above matches in By pool. View/filter changes never write prediction URLs. The prototype preview bundle is not shipped.

At the design checkpoint, checks passed with **179 unit/property tests and 21 production-browser/hosting tests**, both TypeScript compilers, lint and build. Added journeys covered phase gating and conflict recovery, view/filter isolation, dialog-session and Clear pick history, keyboard focus, actual bracket ordering, mobile finals and legacy 2023 views.

The refreshed production build contains **109.29 kB JavaScript / 33.84 kB gzip** and **27.47 kB CSS / 5.87 kB gzip**. Source Sans 3 and Barlow Condensed are self-hosted with OFL licences; icons use inline SVG and flags remain local. Bundle figures exclude font and flag files.

On the same production Chrome/1440×1100 benchmark setup, **82 actions** recorded median synchronous action times of **3.4 ms normally** and **14.5 ms with four-times CPU slowdown**. No edit-time network requests occurred. These host measurements include domain recalculation, rendering and URL replacement; they are not portable device or paint guarantees.

### Initial interface measurements (before the supplied design)

The initial production JavaScript was **84.97 kB / 27.76 kB gzip**, versus the repaired React baseline **181.69 kB / 57.16 kB gzip**: approximately **51% less compressed JavaScript**, with substantially more functionality. CSS was **13.90 kB / 3.58 kB gzip**. These measurements exclude copied static flags; unused assets remain release-cleanup work.

Performance measurements use production Chrome **150.0.7871.181** on this host, a **1440×1100** viewport, and **82 actions** covering all matches plus repeated final-score edits. The synchronous action measurement includes completion, standings, bracket consequences, rendering updates and URL encoding/replacement.

| CPU setting | Median action | 95th percentile | Slowest action |
| --- | --- | --- | --- |
| Normal | 3.0 ms | 4.4 ms | 6.5 ms |
| Four-times slowdown | 13.9 ms | 15.5 ms | 16.7 ms |

The final detailed scenario URL was **513 characters** including the local origin. No fetch/XHR requests, external requests or page errors occurred during edits. The script also records two animation-frame callbacks as a paint-opportunity check; this is not direct paint instrumentation. Throttling is a relative simulation, not a measured mobile device, and no comparable pre-migration latency trace was recorded. Compare future work on the same setup rather than treating these host timings as portable CI limits.

To reproduce: run `npm run build`, start `npm run preview -- --host 127.0.0.1 --port 4173` in one terminal, then `npm run benchmark` in another after installing Playwright Chromium. `BENCHMARK_URL` selects another fresh 2027 preview and `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` selects a local Chrome executable. The committed [benchmark](../scripts/benchmark.mjs) emits its environment, timings and request counts as JSON.

The current defaults are deliberately coarse and not a calibrated forecast. Exact rugby score composition and model probabilities belong to the later engine. Final 2027 within-pool regulations and the future 18 October 2027 rankings are unavailable; the interface labels the provisional rules and verified December 2025 ranking fallback. New official inputs must introduce retained versions, not overwrite old links.

### Cloudflare deployment follow-up

The first build is deployed at **rwc2027.myplaceforthings.com**, following the actual `../../pss/pss-site` Workers/GitHub setup. Bootstrap used local OAuth; normal deployments use `git push` to `main`. Public DNS resolves to Cloudflare and the hostname serves the app with valid TLS. The [Workers address](https://rwc2027-prediction-tracker.myplaceforthings.workers.dev) is also available. Vite output is `dist/`; npm and Node 24 remain. Wrangler **4.144.0** is pinned, including npm's version-specific script permissions for its required esbuild/workerd installers.

Branches/PRs check, pushes to `main` and manual workflow runs deploy through the GitHub `production` environment, then smoke-test the domain. The same `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secret names are used. The first push's check job passed, but publication failed because the deployment job had no API token. Configure these secrets in the repository or `production` environment before rerunning deployment.

Actual Workers runtime tests exposed two differences from Vite preview: asset handling redirects repeated slashes even when HTML handling is disabled, corrupting some legacy Base64 paths; static-only SPA fallback also served HTML for missing subresources. The stateless routing Worker now rewrites document requests to the canonical app shell before normalization, with ordinary root and common assets served directly. Missing subresources receive 404, hashed bundles receive immutable caching, and HTML/flags revalidate. Predictions remain local, with no runtime bindings beyond static assets and no API state.

All 14 browser/HTTP tests pass locally, against the Workers address and against the custom domain using normal DNS, including the six interaction journeys. The live edge omits HTML ETags while retaining the expected revalidation policy and unchanged shell. Hosting tests require that policy and correct content; conditional 304 behavior is required locally and whenever a live response exposes an ETag. Bundle tests select the app's own generated assets; Cloudflare's injected analytics script is outside that asset contract.

`npm run deploy:check` validates without publishing. `npm run test:browser` uses Wrangler locally; `BASE_URL` runs the same journeys against a deployed hostname. Successful push-based publication remains a follow-up once CI credentials are configured. [Deployment instructions](../README.md#cloudflare-deployment)

### Scenario and interaction contracts

- **Untouched and inferred values:** initially keep untouched fixtures unpicked. Choosing a winner/draw completes that fixture's missing details deterministically. Inferred values are distinguishable from explicit choices; future whole-tournament projections should be a deliberate feature/action rather than silently changing the meaning of an untouched prediction.
- **Explicit constraints:** winner, margin, scores, tries and bonuses must agree. Preserve explicit intent and show conflicts inline; never conceal inconsistent predictions through arbitrary corrections. Ordinary changes should not require a modal confirmation.
- **Undo/redo:** each action includes intent, completion and downstream bracket consequences. Group live Details edits across one dialog session, with Clear pick as a separate action; preserve immutable history snapshots and clear redo after a new action. Undo restores downstream choices invalidated by a changed participant. Browser navigation imports the addressed scenario and starts a fresh session undo history; view-only navigation should not alter predictions.
- **URL ownership:** one controller owns prediction serialization, hydration and history writes. Phase, layout, filters and scroll remain local and excluded from shared links. Continuous edits replace the current URL; URLs contain current scenario data, not the undo stack. Preserve both ordinary-Base64 2023 paths and `v1.rwc2023` fragment decoding without mapping their IDs onto 2027 fixtures.
- **Reproducibility:** introduce a new scenario schema for intent, completed values and method/data versions, keeping older readers. Include resolved outcomes and any ranking/rule inputs needed to reproduce the displayed tournament. Publish durable snapshots for recompletion. If a referenced source/snapshot disappears, replay the stored outcomes and report the missing input; never silently recompute an old link with new defaults.
- **Editing performance:** no provider fetches, loading indicators or delayed visible scoring on the action path. Measure initial bytes, local recalculation time, long tasks and focus on the full 52-fixture dataset using a consistent device/throttling setup. Set budgets after the representative slice; compare with the current 57.16 kB gzip JavaScript baseline. Add a worker only if measured engine work needs it.

### Dependency destination for the Solid path (implemented)

npm and the lockfile are retained. The historical table below inventories the original direct dependencies; removed packages did not need intermediate major upgrades. Current runtime dependencies are only Solid and `fflate` for older compressed links.

| Destination | Packages and action |
| --- | --- |
| **Renderer** | Add `solid-js` and `vite-plugin-solid`; replace React components/hooks/context with Solid views and a thin state adapter. Remove `react`, `react-dom`, their types, `@vitejs/plugin-react-swc`, and React hooks/refresh lint plugins after cutover. |
| **Application state** | Use native Solid stores/memos with plain immutable scenario/history data. Remove Zustand when persistence/subscriptions have moved. Remove Immer if the remaining fixture/action updates no longer need it. |
| **Build and types** | Upgrade Vite/Vitest together; pin Node 24 LTS, npm and explicit Node 24 types. Make TypeScript 6 checks clean before conditional TypeScript 7 adoption; preserve the compiler API needed by lint tooling as described below. |
| **Lint** | Use flat ESLint with `typescript-eslint` and `eslint-plugin-solid`; remove the legacy config/CLI patterns at the same boundary. |
| **Verification** | Retain upgraded fast-check for meaningful codec/domain properties. Add Solid Testing Library only for necessary component tests and Playwright for cross-boundary browser behavior. Remove old React/Zustand-specific tests only as their behavioral contracts gain replacement coverage. |
| **Unused dependencies/assets** | Valibot is removed; fflate is retained for v2 link compatibility. Prune unused flags/country data and duplicate styles while preserving provenance and legacy-link support. |
| **TanStack** | Add individual Solid adapters only when the associated behavior warrants them; Router is the first candidate. Start/Store/DB are outside the initial stack. |

Installed tooling: **Node 24.21.0 / npm 12.1.0**, **Vite 8.3.1 / Vitest 5.0.2**, **TypeScript 7.0.2** with the **6.0.2 compatibility package**, **ESLint 10.11.0 / typescript-eslint 8.71.0**, **Playwright 1.63.0 / fast-check 4.10.2**, **globals 17.12.0** and Node 24 types. `npm ci` reproduces the lockfile successfully with zero reported audit vulnerabilities. The compatibility package exposes the TS6 compiler/API while the native compiler owns `tsc`; checks run both.

Public npm metadata rechecked for the Solid path on **2026-09-30**: [Solid 1.9.15](https://registry.npmjs.org/solid-js/latest), [vite-plugin-solid 2.11.14](https://registry.npmjs.org/vite-plugin-solid/latest), [eslint-plugin-solid 0.18.0](https://registry.npmjs.org/eslint-plugin-solid/latest), and [Solid Testing Library 0.8.10](https://registry.npmjs.org/@solidjs%2Ftesting-library/latest). The Solid Vite plugin's declared peers accept Vite 8; the lint plugin accepts ESLint 10. Check actual builds and all test-adapter peers during implementation, rather than treating declared ranges as complete compatibility evidence.

## Historical audit: original architecture

This is a static React/TypeScript/Vite application. There is no server, API client, router, database, or runtime fetch in `src`. `main.tsx` creates the app context before rendering; that context initializes a fixture store and a persisted prediction store. Plain CSS styles the components.

The active flow is:

```text
2023 fixture constants → fixture store → pool fixture views
text inputs → results store → URL storage → packed Base64 pathname
results + static pool fixtures → pure point/log functions → per-fixture tables
```

The UI displays 40 pool fixtures, 160 text inputs, and a cumulative table after each fixture. Each table includes only that pool's matches through the displayed match number. Eight knockout fixtures describe pool-position and earlier-match dependencies, but no code resolves or displays the bracket. There is no winner shortcut, inference engine, undo/redo, or share control; sharing currently relies on copying the address bar.

Predictions are either untouched or marked `touched` with scores and try counts. The custom codec writes a one-byte fixture count, touched bits, and three bytes per touched fixture: two scores and two four-bit try counts. Match identities are implicit array positions. It uses bit-packing and ordinary Base64 without a general-purpose compressor; neither `fflate` nor `valibot` is imported.

The fixture store and imported fixture constants are separate authorities: views use the store, while standings select from `groupFixtures` directly. `createLogsService` is unused scaffolding; it only logs prediction changes to the console. The editor uses `logs/hooks.ts::useResult`, while a second result hook lives in `results/hooks.ts`. `useAllFixtures`, `groupByMatchNumber`, `teamData`, and `raw-countries.json` are unused. `README.md` is still the Vite template; `data-dependencies.md` describes only the old knockout graph.

## Initial baseline and correctness gaps

On Node **22.18.0** / npm **10.9.3**, after `npm ci`:

| Check | Observed result |
| --- | --- |
| `npm run build` | Passes; generated JS is 174.63 kB, 54.82 kB gzip; CSS is 2.51 kB. |
| `npm run lint` | Fails with four errors and one warning: debug `@ts-ignore`, three `prefer-const` errors, and a missing callback dependency. |
| `npx vitest run --threads false` | Two empty service suites fail; seven tests pass and one is skipped. `it.only` hides the codec property test within its suite. |
| Browser editing and navigation | Confirmed string-valued scores/tries, incorrect winner, startup history write, and Back changing the URL without restoring state. |
| Codec diagnostics | Complete numeric arrays round-trip at 8 and 48 records; fail at 1, 36, and 52. Ordinary Base64 can contain `/`. |

The existing green scoring tests are incomplete evidence: several explicitly expect no losing bonus for a narrow loss. The build does not prove valid predictions or correct competition rules. The current `tsc` invocation checks the application; the referenced Vite configuration needs an explicit tooling-project check too.

These were the defects identified before repairs:

| Area | Evidence and implication |
| --- | --- |
| Numeric input | `PointsResult.tsx` stores text strings in number-typed fields. Scores `"9"` and `"10"` compare lexicographically, awarding France a win despite losing 9–10; try totals concatenate as `"01"`. |
| Incomplete state | `results/service.ts::upsertResult` accepts arbitrary partial records and immediately marks them touched. Missing fields produce false draws and `NaN`; serialization coerces them to bytes, changing outcomes after reload. |
| Scoring | `logs/points.ts` awards win/draw and four-try bonus points but omits the losing bonus for a defeat by seven or fewer. The [official 2023 rules](https://resources.world.rugby/worldrugby/document/2023/05/03/fb8ea1ec-b3d9-46c6-933e-bdd1105e3bed/RWC-2023-Tournament-Rules.pdf) establish the legacy rule; verify 2027 regulations for the new ruleset. |
| Standings | `create-logs.ts` excludes unpredicted teams, never increments played, and sorts only by competition points. W/L/D cells are blank. Points for/against, tries against, and tie-breaks need a proper model. |
| URL format | `compression.ts::decode` uses `floor(count / 8)` for touched bytes; it needs the final partial byte. IDs, tournament, version, numeric limits, payload length, and corruption checks are absent. Scores wrap outside 0–255 and tries outside 0–15. |
| URL transport | `storage.ts` reads the last pathname segment and writes relative ordinary Base64. Payload `/` characters break segmentation; path links also need host fallback configuration. Invalid hydration has no app recovery UI. |
| History | Every input change pushes history; startup hydration also writes. There is no `popstate` handling or action history. Browser Back alone is not undo. |
| Rendering | Selectors return fresh collections, nested objects, fallback records, and callbacks. Editing invalidates many tables; these patterns also obstruct Zustand 5. |
| Knockouts | `FixtureSummary.tsx` looks up placeholder objects as country names and dereferences missing metadata. Resolve participants before rendering them; invalidate dependent picks when teams change. |
| Accessibility/layout | Labels have no associated input IDs or team context, the away flag names the home team, logo alt text and table row keys are missing, and the two-column layout has no mobile breakpoints. |

The static assets occupy about **5.5 MB**, mostly complete flag collections in two aspect ratios. They are copied into `dist`, rather than all being loaded initially. Retain needed flags, check provenance/attribution, and prune unused variants during data cleanup. Keep system fonts and plain CSS; use the measured bundle and actual interaction responsiveness as the starting performance baseline.

## Historical checkpoint: React correctness repairs

The existing React 18 editor now validates integer scores/tries, preserves partial/cleared values, and retains accepted values when an invalid nonempty edit is attempted. Only complete predictions count in standings. Losing bonus points, played/W/L/D totals, zero-match teams, accessible field labels, table keys, flag labels and a small-screen layout are repaired.

New URLs use `#predictions=v1.rwc2023.fixtures-v1.<base64url>` with explicit match IDs and field-presence bits. Legacy 2023 paths retain correct bitmap and slash decoding; current tournament/storage validation rejects foreign IDs. Startup does not write history or replace imported links, continuous editing uses `replaceState`, and Back/Forward/hash navigation restores state without feedback. Invalid links remain intact with an explicit recovery action. Displayed fixtures supply result calculations, and selectors return stable state references before deriving collections.

`npm run check` now passes app/tooling type checks, lint, **91 tests**, and the production build. Focused tests are prohibited. Browser regression checks pass for numeric scoring, incomplete and cleared fields, fresh-browser sharing/reload, Back/Forward, unsupported-link recovery, legacy Base64 slashes, mobile overflow and editing focus. The repaired React build is **181.69 kB JS / 57.16 kB gzip**, with **3.28 kB CSS**; the Preact probe below measures the original pre-repair source.

At this checkpoint, full tie-breaks, knockout/2027 resolution, winner-first completion and explicit undo/redo were still future work. Deliveries 1–5 subsequently implemented them; provider integration remains later work.

## Historical dependency inventory and alternatives

All direct dependencies are covered below. Baselines are **resolved lockfile versions**, not manifest ranges. Targets were read from the [official npm registry](https://registry.npmjs.org/) `latest` metadata on **2026-09-30 at 10:07 UTC**; recheck versions, engines, and peers when implementing. Update the manifest and regenerate the lockfile together; transitive bundler/compiler packages follow their owning tools.

| Package | Locked | Latest stable / recommended action |
| --- | --- | --- |
| [fflate](https://registry.npmjs.org/fflate/latest) | 0.8.0 | 0.8.3; remove because unused. Reintroduce only if measured payload savings justify it. |
| [immer](https://registry.npmjs.org/immer/latest) | 10.0.2 | 11.1.18; retain for immutable updates unless simpler reducers remove the need. |
| [react](https://registry.npmjs.org/react/latest) / [react-dom](https://registry.npmjs.org/react-dom/latest) | 18.2.0 / 18.2.0 | 19.3.0 / 19.3.0 if retaining React; frontend choice is pending. Consider Solid for a rebuild or Preact for an incremental migration below. |
| [valibot](https://registry.npmjs.org/valibot/latest) | 0.12.0 | 1.5.0; remove unused dependency, or adopt modern schemas for state/URL validation. |
| [zustand](https://registry.npmjs.org/zustand/latest) | 4.4.1 | 5.0.15, after fixing selector stability and hydration assumptions. |
| [@types/react](https://registry.npmjs.org/@types%2Freact/latest) / [@types/react-dom](https://registry.npmjs.org/@types%2Freact-dom/latest) | 18.2.20 / 18.2.7 | 19.3.0 / 19.3.0 if choosing React 19; review removal when moving to native Preact/Svelte/Solid types. |
| [@typescript-eslint/eslint-plugin](https://registry.npmjs.org/@typescript-eslint%2Feslint-plugin/latest) / [@typescript-eslint/parser](https://registry.npmjs.org/@typescript-eslint%2Fparser/latest) | 6.4.0 / 6.4.0 | 8.71.0 / 8.71.0, preferably supplied by [typescript-eslint](https://registry.npmjs.org/typescript-eslint/latest) 8.71.0. |
| [@vitejs/plugin-react-swc](https://registry.npmjs.org/@vitejs%2Fplugin-react-swc/latest) | 3.3.2 | 4.3.3, or [@vitejs/plugin-react](https://registry.npmjs.org/@vitejs%2Fplugin-react/latest) 6.1.1 for React/Vite 8; use the chosen alternative's Vite integration instead if changing framework. |
| [eslint](https://registry.npmjs.org/eslint/latest) | 8.47.0 | 10.11.0 with flat configuration and [@eslint/js](https://registry.npmjs.org/@eslint%2Fjs/latest) 10.0.1. |
| [eslint-plugin-react-hooks](https://registry.npmjs.org/eslint-plugin-react-hooks/latest) | 4.6.0 | 7.1.1; review new diagnostics. |
| [eslint-plugin-react-refresh](https://registry.npmjs.org/eslint-plugin-react-refresh/latest) | 0.4.3 | 0.5.7 with flat configuration. |
| [fast-check](https://registry.npmjs.org/fast-check/latest) | 3.12.0 | 4.10.2; restore and expand codec property coverage. |
| [typescript](https://registry.npmjs.org/typescript/latest) | 5.1.6 | 7.0.2 compiler with a TypeScript 6 compatibility API for lint; see below. |
| [vite](https://registry.npmjs.org/vite/latest) | 4.4.9 | 8.3.1. |
| [vitest](https://registry.npmjs.org/vitest/latest) | 0.34.2 | 5.0.2, together with compatible Vite. |

Use **Node 24 LTS** as the shared development/CI runtime. The checked release is [24.21.0](https://nodejs.org/dist/index.json); pair it with [npm 12.1.0](https://registry.npmjs.org/npm/latest), whose engines accept Node 24.15+. Node 26 is newer but currently on the Current release line. Add `engines`, a runtime version file, and explicit `@types/node` **24.x** rather than relying on the currently transitive Node 20 types or blindly installing latest 26.x. Keep npm and lockfile v3. Vite 8 requires Node 20.19+/22.12+, ESLint 10 requires 20.19+/22.13+/24+, and Vitest 5 requires 22.12+/24+/26+; Node 24 satisfies all three. [Node release policy](https://nodejs.org/en/about/previous-releases)

### Compatibility gates

**TypeScript:** `typescript-eslint` 8.71.0 requires TypeScript `<6.1.0`; TypeScript 7.0 has no compatible compiler API. First make TypeScript 6 checks clean, then use Microsoft's [supported coexistence setup](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/):

```json
{
  "typescript": "npm:@typescript/typescript6@^6.0.2",
  "@typescript/native": "npm:typescript@^7.0.2"
}
```

This is a proposed `devDependencies` fragment: ESLint imports the TS6 API from `typescript`; `tsc6` provides compatibility checks, while `tsc` uses native TS7. The [compatibility package](https://registry.npmjs.org/@typescript%2Ftypescript6/latest) was also checked at 6.0.2. Compare diagnostics from both compilers for app and tooling projects. Make `types` explicit where necessary, handle side-effect CSS declarations, and remove deprecated configuration instead of suppressing it. Keep strict checking and `noEmit` for application code. [Supported lint dependency versions](https://typescript-eslint.io/users/dependency-versions/)

**Vite/React plugin:** review migration changes through Vite 5, 6, 7, and 8; Vite 8 changes the bundler/transformation stack to Rolldown/Oxc and updates default browser targets. This repo has no custom SWC options, and the [SWC plugin maintainers recommend the default React plugin for most projects](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc/README.md). Prefer that replacement; select a deliberate browser support target. Read [Vite migration](https://vite.dev/guide/migration) and [Vitest migration](https://vitest.dev/guide/migration/) together. Existing `--threads false` is an old-runner diagnostic option, not the future test script. Leave optional React Compiler adoption for a separately measured change.

**ESLint:** replace `.eslintrc.cjs` with ESM flat `eslint.config.mjs`, explicit file matching, browser/tooling globals and ignore rules. Replace the legacy `--ext` command with config-driven discovery. Use the umbrella `typescript-eslint` setup and repair diagnostics rather than disabling rule families. [ESLint 10 migration](https://eslint.org/docs/latest/use/migrate-to-10.0.0), [typescript-eslint setup](https://typescript-eslint.io/getting-started/)

**Zustand:** take a current v4 warning pass, then upgrade to v5. Select stable state references and existing store actions; memoize mapped results outside selectors. `useShallow` alone cannot stabilize newly spread nested records or newly created callbacks. Also test the changed initial persistence behavior, hydration, empty links, and navigation. [Zustand v5 migration](https://zustand.docs.pmnd.rs/reference/migrations/migrating-to-v5)

**React/remaining libraries:** use React 18.3 to surface migration warnings before React 19 and matching types. `createRoot` and the automatic JSX runtime are already present. Verify controlled inputs, focus and repeated edits under StrictMode. Review [React 19 migration](https://react.dev/blog/2024/04/25/react-19-upgrade-guide), [Immer 11 changes](https://github.com/immerjs/immer/releases/tag/v11.0.0), and [fast-check 4 migration](https://fast-check.dev/docs/migration-guide/from-3.x-to-4.x/). If adopting Valibot, write current schemas directly; old pipeline and inferred-type APIs changed. [Valibot migration](https://valibot.dev/guides/migrate-to-v0.31.0/)

## Historical frontend assessment

React 19 is a candidate, not a requirement. The user excludes Vue, wants a lighter app, and is open to a rebuild. This repository has few components and no large UI-library dependency, so changing the renderer is tractable; the state, URL, undo and completion contracts matter more than framework choice for editing responsiveness. **Solid + Vite is the provisional recommendation for a rebuild; Preact + Vite remains the recommendation for an incremental migration.** Actual Solid bundle size and interaction performance need measurement in a representative implementation.

| Option | Assessment for this app |
| --- | --- |
| **Solid + Vite** | Leading rebuild candidate: native signals, property-level stores and memoized derived values fit prediction/standings/bracket dependencies. JSX is familiar, but components/hooks must be rewritten for Solid's semantics. [Reactivity](https://docs.solidjs.com/advanced-concepts/fine-grained-reactivity), [stores](https://docs.solidjs.com/concepts/stores) |
| **Preact + Vite** | Leading incremental candidate: reuse JSX/hooks through compatibility mode, then consider native hooks/signals. Verify store subscriptions and input behavior. [Compatibility guide](https://preactjs.com/guide/v10/differences-to-react/), [signals](https://preactjs.com/guide/v10/signals/) |
| **Svelte 5 + Vite** | Strong alternative for a deliberate UI rebuild: compiled components and reactive state suit forms and derived tables. Requires rewriting components/hooks. SvelteKit is unnecessary here. [Overview](https://svelte.dev/docs/svelte/overview) |
| **Vanilla TypeScript / Lit** | Small/browser-native, but we take on more rendering, lifecycle and focus-management work. Less compelling than the above for this app. [Lit](https://lit.dev/docs/) |
| **React** | Lowest migration risk, broad compatibility; keep React 18 during repairs and reconsider the renderer before choosing React 19. [Upgrade guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide) |

An isolated production build of the original source, using its existing toolchain and **Preact 11.0.0 compatibility aliases**, reduced JavaScript from **174.63 kB / 54.82 kB gzip** to **57.96 kB / 19.10 kB gzip**: **65.2% less compressed JavaScript**. CSS stayed at 2.51 kB. Both rendered 40 fixtures/160 inputs, accepted edits and updated the URL without page errors; both retained the original reload bug. This is migration/size evidence, not complete compatibility or performance certification. That probe preceded the subsequent Solid migration.

For a Solid rebuild, retain the pure validation, scoring and codec contracts/tests and replace the React views/hooks plus their state adapter. Keep prediction intent, overrides, undo history and serialized snapshots as plain data; project accepted updates into native stores and derive standings/qualification/brackets with [memos](https://docs.solidjs.com/reference/basic-reactivity/create-memo). [Batch](https://docs.solidjs.com/reference/reactive-utilities/batch) synchronous consequences for one visible update, but create one explicit application undo entry as well. A store proxy or [unwrap](https://docs.solidjs.com/reference/store-utilities/unwrap) result is not an independent historical copy: clone/retain immutable values at the action boundary. Effects should handle URL synchronization and other external work, not assemble derived tournament state.

Solid [components initialize once](https://docs.solidjs.com/concepts/components/basics), so React render-body assumptions and hooks are not portable. Keep reactive reads in accessors/tracking scopes rather than destructuring values prematurely, use stable fixture identities, and use [onInput](https://docs.solidjs.com/concepts/components/event-handlers) for instant field updates. Start with a representative winner/details → pool standings → qualification → bracket slice with undo and URL replay; measure bundle size, input responsiveness and focus before expanding the rebuild.

### TanStack tools to consider

TanStack libraries can be selected individually and several have official Solid adapters. They do not require adopting the entire stack.

| Tool | Fit for this app |
| --- | --- |
| **[Router](https://tanstack.com/router/latest/docs/overview)** | Useful when pools, bracket, method selection or comparison become distinct navigable views. React and Solid support, typed/validated search parameters and [custom serializers](https://tanstack.com/router/latest/docs/guide/custom-search-param-serialization) suit shareable view state. Prediction schema/versioning and undo remain our responsibility. Keep one URL synchronization authority and preserve legacy fragment links rather than letting the router and persistence controller write independently. A single-screen editor can start without a router. |
| **[Query](https://tanstack.com/query/latest/docs/framework/solid/overview)** | Add if immutable published data snapshots need asynchronous loading, caching, retry and deduplication. Key by exact snapshot/version; never silently refresh a shared scenario into new predictions. Native `createResource` or a bundled snapshot can suffice initially. Local choices and undo belong in application state, and provider credentials remain outside the browser. |
| **[Hotkeys](https://tanstack.com/hotkeys/latest/docs/framework/solid/guides/hotkeys)** | Optional shortcut handling for undo/redo and navigation with Solid lifecycle cleanup. Scope global undo away from text/number inputs so native field editing retains its own undo. Shortcuts trigger our history actions; the library does not implement history. |
| **[Form](https://tanstack.com/form/latest/docs/framework/solid/overview)** | Consider when detailed cross-field constraints and accessible validation warrant it; simple winner buttons and a few numeric fields do not need a full form layer. Keep rugby consistency rules in the pure domain model. |
| **[Table](https://tanstack.com/table/latest/docs/framework/solid/overview) / [Virtual](https://tanstack.com/virtual/latest/docs/framework/solid/overview)** | Useful for substantial sorting/filtering or very large comparisons. Plain tables fit four-team pools, and 52 fixtures do not justify virtualizing the editor without measured rendering trouble. Qualification order must follow rugby rules, independent of user table sorting. |
| **[Store](https://tanstack.com/store/latest) / [DB](https://tanstack.com/db/latest)** | Store is currently alpha; Solid already supplies stores. DB is beta and supports Solid and local-only collections, so it does not inherently require a backend. Its collections/live relational queries add little for the current 24-team/52-match model. Reconsider if scenario datasets or local query needs grow substantially. |
| **[Start](https://tanstack.com/start/latest/docs/framework/solid/overview)** | The Solid documentation currently marks it Release Candidate. It supports [SPA mode](https://tanstack.com/start/latest/docs/framework/solid/guide/spa-mode) and can serve a static client build, but adds SSR/server-function/build conventions beyond the current need. Its own docs recommend Router alone when those features are unnecessary. Consider if prerendered public pages or integrated server services become requirements. |

Proposed initial stack: **Solid + Vite + TypeScript + plain CSS + native Solid stores/memos**, with the existing pure functions and a small explicit history/URL layer. Router is the first TanStack addition to evaluate when navigation warrants it; Query and Hotkeys are optional additions driven by concrete behavior. Solid has since been adopted; TanStack packages remain unnecessary for this milestone.

## Prediction data research

Budget: prefer free sources, with a useful paid supplement up to **US$50/month**. Research reviewed public provider documentation, not authenticated samples; complete men's **RWC2027** coverage is not yet established for this shortlist.

| Candidate | Access and fit | What needs proof |
| --- | --- | --- |
| **OddsPapi** | Documented union internationals, winner/three-way, handicap/totals and historical odds; advertises [250 free requests/month](https://oddspapi.io/sportsbooks/pinnacle). [Rugby coverage example](https://oddspapi.io/blog/rugby-odds-api/) | Account limits, RWC competition, active bookmaker markets and history. Union/league share a sport ID: filter the code explicitly. |
| **API-Sports / API-Rugby** | [100 free requests/day](https://api-sports.io/sports/rugby); explicitly lists World Cup results/fixtures/standings. | Structured tries and useful historical depth. Its coverage table has no World Cup/Six Nations odds: treat it as results data. |
| **Highlightly** | [100 free requests/day; US$5.99/month Pro](https://highlightly.net/rugby-api/) for fixtures/results/stats and paid odds. | Actual international markets and match try fields. [Odds availability](https://highlightly.net/rugby-api/documentation/) is seven days before to 28 days after a match; free access excludes odds. |
| **BetsAPI** | [US$10/month Events plan](https://betsapi.com/mm/pricing_table) includes union results and limited winner/handicap/totals odds. | Competition depth and bookmaker coverage on the cheap plan. Full bookmaker packages cost more than the budget. |
| **The Odds API** | [500 free credits/month, US$30/month paid entry](https://the-odds-api.com/). | Public [union catalogue](https://the-odds-api.com/sports-odds-data/sports-apis.html) currently lists Six Nations rather than World Cup; historical odds need paid access. |
| **Rugby4Cast / Sports4Cast** | Public model predictions; the current [pricing widget](https://widgets.sports4cast.com/website/plans-widget.html) lists rugby Value at **£15/month or £150/year**, Premium at **£40/month or £400/year**. These are personal betting-analysis subscriptions, not API prices. | Older static tables still list Value at £10/£100. No public API/export price established; automated access, pre-match history and permission to publish derived predictions require confirmation. |

Start with a simple locally calibrated ratings model and OddsPapi/API-Rugby sample evaluation, with Highlightly as the cheap combined alternative. [World Rugby ratings](https://www.world.rugby/rankings/explanation?lang=en) provide a strength input, not ready-made win probabilities, margins or try predictions. [RugbyVision](https://www.rugbyvision.com/) and [Rugby4Cast](https://sports4cast.com/4casts/rugby4cast/) publish model outputs, but public APIs and reuse licences were not confirmed. Rugby4Cast is a useful independent-model candidate; its [terms](https://sports4cast.com/terms-and-conditions/) restrict sharing analysis with nonsubscribers and require express written permission for redistribution or derivative works. A consumer subscription does not establish permission for our public engine. Richer [Sportradar](https://developer.sportradar.com/rugby/reference/rugby-sport-event-summary), [Goalserve](https://goalserve.com/en/sport-data-feeds/rugby-api/prices) and Opta options require higher/custom budgets; do not assume their trials allow publishing or training.

The user intends to approach Sports4Cast about sponsorship/collaboration with product attribution. Treat that as a potential partner route, with access terms and sponsorship still unagreed. Useful collaboration inputs are probabilities, expected scores/margins, dated pre-match forecasts for evaluation, and permission to publish derived static snapshots with agreed attribution.

The proposed coarse engine exposes **Consensus / Rugby model / Bookmakers**. Convert complete comparable odds markets into probabilities with the bookmaker margin removed, average bookmakers into one method signal, then average method signals. Do not average decimal odds, rankings or predicted winners directly, and keep regulation-time three-way markets separate from two-way advancement markets. Handicap/totals can inform score/margin; tries and bonus-point outcomes still need a completion model. Explicit user choices remain constraints on that completion.

Collect provider data outside the browser using a local script/build with private keys, and publish small immutable derived snapshots where the licence permits. The browser calculates and edits predictions locally, with a bundled fallback and no server prediction state. A shared URL records method, snapshot and engine version plus overrides, or resolved outcomes. Tomorrow's odds must not change yesterday's shared predictions. [OddsPapi terms](https://oddspapi.io/us/legal/terms) restrict raw redistribution; verify allowed derived snapshots with each provider before publishing.

Sample quality in two stages. First, use free API credentials kept in git-ignored `.env.local`, or a provider-supplied sample export, to inspect 20–30 varied completed men's internationals plus upcoming fixtures. Include close matches, large margins, tier-two teams and try/losing-bonus boundaries. Check competition/team identity, actual kickoff timestamps, scores/tries, field completeness, active markets, update freshness and historical availability against official results. This establishes data usability, not predictive accuracy; also confirm 2027 coverage and permission for derived snapshots.

Then evaluate forecasts on a larger historical holdout, ideally hundreds of matches, using only timestamped information available before each kickoff. Compare probability calibration and Brier/log loss, plus margin/total error and try/bonus accuracy where supported, against a simple ratings baseline and bookmaker consensus. Today's rerun model on old results is not an authentic historical forecast. No accounts, purchases, external messages or provider integrations were created during this research.

## 2027 tournament migration reference (implemented)

This is a format migration, not a branding change. The [confirmed draw](https://www.rugbyworldcup.com/2027/en/news/1019390/pools-confirmed-for-mens-rugby-world-cup-2027-in-australia) has 24 teams in six pools of four. The [announced format](https://www.rugbyworldcup.com/en/news/1017765/rugby-world-cup-2027-all-you-need-to-know-about-the-draw-format-pools-and-dates) produces 36 pool matches and 16 knockout matches, including the round of 16: **52 total**. Each pool's top two and the four best third-place teams qualify.

| Pool | Teams |
| --- | --- |
| A | New Zealand, Australia, Chile, Hong Kong China |
| B | South Africa, Italy, Georgia, Romania |
| C | Argentina, Fiji, Spain, Canada |
| D | Ireland, Scotland, Uruguay, Portugal |
| E | France, Japan, USA, Samoa |
| F | England, Wales, Tonga, Zimbabwe |

Import match identities, dates and venues from the [published official schedule](https://resources.worldrugby-rims.pulselive.com/worldrugby/document/2026/02/02/d096842d-5029-42fc-9720-3eaa66d27134/RWC-2027_Match-Schedule_All.pdf). Its kickoff times are venue local; convert using the venue's Australian timezone and daylight-saving rules, store standard ISO UTC, and display in the viewer's timezone. Use explicit team IDs and flag codes rather than exact country-name lookups; new names such as Hong Kong China and USA need metadata.

Qualification needs a best-third ranking and the official [15 qualifying-pool permutations](https://resources.worldrugby-rims.pulselive.com/photo-resources/2025/12/19/a30b9d1d-d475-48f9-a768-6eacbd94c288/RWC2027_Best-Third-Permutations-16x9.png) to resolve round-of-16 participants. Full standings need head-to-head and other rules required by the final regulations, plus all statistics those rules consume. Do not substitute array order for unresolved ties.

There is a source conflict to resolve: the [November format article](https://www.rugbyworldcup.com/en/news/1017765/rugby-world-cup-2027-all-you-need-to-know-about-the-draw-format-pools-and-dates) mentions try difference, while the [December explanation](https://www.rugbyworldcup.com/2027/en/news/1019814/the-new-mens-rugby-world-cup-draw-format-explained) gives points difference, points scored, and tries scored, then the ranking as of 18 October 2027. Verify final competition regulations before fixing tie-break order. Any future ranking input must be an identified, versioned snapshot or explicitly shared choice so existing predictions remain reproducible.

## Release acceptance checks

Exercise 7/8-point loss margins, 3/4-try bonuses, draws, missing and conflicting fields, tied qualification, all third-place permutations, changed knockout participants, 52-record round trips, malformed and legacy URLs, fresh-browser sharing, missing/offline data snapshots, atomic undo/redo, Back/Forward, keyboard input and mobile layout. Automate the meaningful domain/codec/action and browser behaviors as each delivery introduces them; [Playwright](https://registry.npmjs.org/@playwright%2Ftest/latest) 1.63.0 is installed as development tooling. CI should run the same checks on the pinned runtime, and the static-host preview must verify actual routing, legacy paths, subpaths and cached asset behavior before release.
