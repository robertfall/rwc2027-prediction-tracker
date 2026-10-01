# First-pass prediction engine

**Fill matches** projects every eligible unpicked fixture, regardless of the current view or pool filter, working through pool and knockout dependencies to bronze and the final. Existing choices and completed outcomes remain intact. Contradictory choices stay visible and can leave later fixtures waiting. The entire fill, including incompatible dependent-pick replacements, is one undo action and one URL update.

The engine is independent plain TypeScript. `planRankingFill(scenario)` in `src/domain/ranking-fill.ts` works on a clone and returns `PredictionUpdate` values, conflict and replacement counts. It uses `rankings.ts`, immutable `ranking-data.ts` inputs and the shared `reconcileScenario` rules. The UI passes the plan to generic `controller.applyBatch`, which validates and applies all updates together. The planner writes no application state or URLs; no credentials, requests or server state are needed.

## Fixed inputs

| Tournament | Engine rating snapshot | Source |
| --- | --- | --- |
| 2027 | 28 September 2026, all 24 teams | [Official World Rugby API](https://api.wr-rims-prod.pulselive.com/rugby/v3/rankings/mru?date=2026-09-28) |
| Legacy 2023 | 2 October 2023, all 20 teams | [Official World Rugby API](https://api.wr-rims-prod.pulselive.com/rugby/v3/rankings/mru?date=2023-10-02) |

Verified on 1 October 2026. The newest API response reported an effective date of 28 September; it agreed with the dated response. Full-precision ratings, ordinal positions, official team IDs and raw response hashes are retained as provenance. Engine inputs are separate from `Tournament.rankings`, whose existing qualification tie-break snapshots remain unchanged.

## Score heuristic

Use rating-point difference because adjacent ranking positions can represent very different gaps. The higher rating wins; equal ratings use ordinal position, then stable team ID. First-listed fixture slots receive no home weighting.

1. Project the winning margin as twice the absolute rating-point gap, rounded to an integer and bounded to 1–100.
2. Project the losing score as `max(3, 21 - round(margin / 4))` and the winning score as the losing score plus the margin.
3. Infer tries from `floor(score / 7)`, bounded to 15. Existing scoring rules derive try and losing bonuses.

For example, Australia versus Hong Kong China has a rating gap of about 24.81, projecting **58–8**, a 50-point margin with **8–1 tries**. A one-point margin projects **22–21**. Generated knockout outcomes include an advancing team bound to the actual participants.

These constants are an initial app heuristic, not a fitted probability or score model. Filling leaves existing picks alone. Manual winner choices retain the existing **24–17** completion, with **21–21** for a draw; the constrained solver continues to respect margin, scores, tries and bonuses. Generated numerical values are saved in `Scenario.resolved`, while intent contains only a pool winner or knockout advancing choice. This keeps suggested values distinct from explicit numerical choices.

## Replay and future changes

The engine changes no URL shape, transport/schema version, profile or completion metadata. Keep `defaults-v1` and v3 profiles 1/2 unchanged. Actual generated scores and tries use the existing custom saved-result encoding, so later formula/data changes cannot recompute a shared prediction. Shallow token budgets remain **9/11/73/129 characters**; a fully generated tournament has a **355-character budget** because it also saves the projected outcomes. [Link protocol](prediction-links.md)

The application publishes the batch once and records one session undo entry. Current edits replace the URL; browser Back/Forward as prediction undo is an explicit follow-up. Dormant matching knockout picks retain their pins; proven participant changes replace incompatible picks inside the same batch.

Future Consensus, Rugby model and Bookmakers methods can return the same batch-update contract using permissible immutable snapshots. Calibration, probabilities and provider ingestion remain follow-ups. World Rugby's [published source terms](https://www.world.rugby/terms-and-conditions) do not supply an open-data/API licence; review publication permissions as part of provider work.
