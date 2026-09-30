# Tournament definitions and rules

Verified on 30 September 2026. Tournament data, rule versions and rankings are embedded in the static app; editing never fetches them. Shared scenarios identify these versions and retain their completed values.

## Australia 2027

`rwc2027 / fixtures-2026-02 / provisional-v1` contains 24 teams, six pools, 36 pool fixtures and 16 knockout fixtures. The round of 16, quarter-finals, semi-finals, bronze and final use the [official February 2026 schedule](https://resources.worldrugby-rims.pulselive.com/worldrugby/document/2026/02/02/d096842d-5029-42fc-9720-3eaa66d27134/RWC-2027_Match-Schedule_All.pdf), page 3. Match IDs preserve its numbering, rather than chronological sorting across timezones. Kickoffs and venues remain subject to official changes.

That PDF publishes venue-local times. The stored UTC instants were converted with IANA `Australia/Perth`, `Australia/Brisbane`, `Australia/Sydney`, `Australia/Melbourne` and `Australia/Adelaide` timezones. Daylight saving starts on 3 October 2027 in the observing states. Adelaide changes from UTC+09:30 to UTC+10:30; Queensland and Perth keep their offsets. Tests reproduce schedule times on both sides of this transition.

The top two from each pool and four best third-place teams qualify. All 15 qualifying-pool combinations are transcribed from [World Rugby's permutations graphic](https://resources.worldrugby-rims.pulselive.com/photo-resources/2025/12/19/a30b9d1d-d475-48f9-a768-6eacbd94c288/RWC2027_Best-Third-Permutations-16x9.png). This is a lookup by the four pools, not by the order in which their third-place teams are ranked. The complete pool phase is required before bracket participants appear. Later participants depend on earlier predicted winners and losers; a drawn knockout score requires a separate advancing choice.

### Provisional tie-break assumptions

Final 2027 competition regulations were not found. Within-pool scoring and ties therefore provisionally follow the confirmed 2023 rules: win 4, draw 2, four tries 1 bonus, losing by at most seven 1 bonus; then head-to-head for two tied teams, points difference, try difference, points scored, tries scored and ranking. A multi-team tie selects one place at a time and restarts the criteria for the remaining tied teams. Head-to-head is skipped while more than two teams remain.

For comparisons across pools, use the newer [18 December 2025 World Rugby explanation](https://www.world.rugby/news/1019814/the-new-mens-rugby-world-cup-draw-format-explained?lang=en): competition points, points difference, points scored, tries scored, then rankings dated 18 October 2027. The [earlier November explanation](https://www.rugbyworldcup.com/en/news/1017765/rugby-world-cup-2027-all-you-need-to-know-about-the-draw-format-pools-and-dates) instead mentions try difference. This conflict needs confirmation against final regulations.

The future October 2027 rankings do not exist yet. The current implementation uses the verified [1 December 2025 official rankings snapshot](https://api.wr-rims-prod.pulselive.com/rugby/v3/rankings/mru?date=2025-12-01) as its final fallback and deterministic detail-completion seed. It is explicitly labelled provisional. These are ordinal rankings (smaller is higher), not rating points or calibrated probabilities; Canada is ranked 25th worldwide despite being the 24th qualified team. Introducing final rules or another ranking snapshot requires a new rule version and retention of this one for old links.

## France 2023 compatibility

`rwc2023 / fixtures-v1 / 2023-v1` adapts the repository's original 48 fixture IDs and preserves its four five-team pools. Legacy links never become 2027 predictions.

The [official 2023 regulations](https://resources.world.rugby/worldrugby/document/2023/05/03/fb8ea1ec-b3d9-46c6-933e-bdd1105e3bed/RWC-2023-Tournament-Rules.pdf), sections 5.2.2–5.2.5, define the point and tie-break rules above, quarter-final paths and bronze/final paths. The required final tie-break date is **2 October 2023**, not the end of the pool phase. The embedded positions were verified against the [official historical rankings endpoint](https://api.wr-rims-prod.pulselive.com/rugby/v3/rankings/mru?date=2023-10-02), whose `effective.label` is `2023-10-02`.

The model supports ordinary played-match predictions, not tournament-director decisions about expulsions, cancelled or abandoned fixtures. Scores represent the predicted displayed score; a tied knockout can separately identify the advancing team without modelling every extra-time/kicking step.

## Verification and change boundaries

Domain tests cover all pool pairings, all 15 third-place allocations through actual standings, unique first-round participants, timezone transitions, competition points and bonuses, direct and multi-team ties, all bracket dependencies including bronze, draw advancement, stale participant bindings and conflicting predictions. Incomplete/conflicting fixtures remain visible but do not contribute to standings or qualification.

Verify new official data before changing definitions. Keep stable fixture/team IDs within a dataset version, preserve old tournament versions, and change both source notes and scenario validation when introducing new rules. Do not relabel the 2025 ranking fallback as the official future 2027 tie-break ranking.
