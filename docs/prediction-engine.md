# First-pass prediction engine

Fresh scenarios use `rankings-v1`. A winner pick fills unspecified scores, tries and bonuses from a deterministic World Rugby rating-gap projection. **Fill matches** fills every eligible unpicked fixture, regardless of the current view or pool filter, working through the pool and knockout dependencies to the bronze match and final. Existing choices and completed outcomes remain intact. Contradictory choices stay visible and can leave later fixtures waiting. The entire fill, including any incompatible dependent picks, is one undo action and one URL update.

The engine is plain TypeScript in `src/domain/rankings.ts`; immutable inputs are in `ranking-data.ts`. No credentials, requests or server state are required for editing or filling.

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

For example, Australia versus Hong Kong China has a rating gap of about 24.81, projecting **58–8**, a 50-point margin with **8–1 tries**. A one-point margin projects **22–21**. An explicitly chosen draw uses **21–21**; a knockout draw also needs an advancing team.

These constants are an initial app heuristic, not a fitted probability or score model. An explicit winner chooses which side receives the gap-based winning score. The existing constrained completion solver respects explicit margin, scores, tries and bonuses; impossible combinations remain conflicts. Generated numerical values stay suggestions rather than being written as explicit choices.

## Replay and future changes

Retain `defaults-v1` and its historical 24–17 / 21–21 behavior. V3 profiles 3/4 fix `rankings-v1` and the snapshots above; profiles 1/2 keep their original inputs. New data or formula changes require a new completion version/profile. Imported links never upgrade silently. An explicit Fill can upgrade an older scenario while preserving existing pinned outcomes, including dormant bracket picks; undo restores the original profile. [Link protocol](prediction-links.md)

Future Consensus, Rugby model and Bookmakers methods can supply different deterministic completion seeds from permissible immutable snapshots. Calibration, probabilities and provider ingestion remain follow-ups. World Rugby's [published source terms](https://www.world.rugby/terms-and-conditions) do not supply an open-data/API licence; review publication permissions as part of provider work.
