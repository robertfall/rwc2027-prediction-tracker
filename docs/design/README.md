# Design reference

The supplied [Rugby World Cup Predictor archive](<Rugby World Cup Predictor.zip>) is unpacked under `reference/`. [Predictor.dc.html](reference/Predictor.dc.html) is the final composition target; [CLAUDE.md](reference/CLAUDE.md) records its compact toolbar, dense match column, standings margin and Pools → Knockout flow. The PNGs under `reference/uploads/` record earlier design iterations.

| Reference | Solid implementation |
| --- | --- |
| `Predictor.dc.html` | `src/App.tsx`: toolbar, stage/view/filter controls, URL recovery, sharing and footer |
| `MatchCard.dc.html`, `MatchRow.dc.html`, `BracketMatch.dc.html` | `src/components/FixtureCard.tsx`: card, row and bracket variants; `MatchDetailsDialog.tsx`: shared live editor |
| `PoolsByPool.dc.html`, `Timeline.dc.html` | `src/components/TournamentViews.tsx`: pool sections and chronological groups with responsive standings context |
| `PoolTable.dc.html` | `src/components/StandingsTable.tsx`: full and compact semantic tables with qualification markers |
| `KnockoutRounds.dc.html`, `KnockoutBracket.dc.html` | `src/components/TournamentViews.tsx`: actual stage/dependency ordering, mobile round selection, final and bronze |
| Design tokens and font examples | `src/index.css`, `src/App.css`, `src/assets/fonts/`; small inline SVGs in `Icon.tsx` |

The implementation preserves the existing domain and scenario controller: official 2027 fixtures, provisional rules, exact third-place allocations, legacy 2023 links, participant bindings, deterministic completion and URL/history validation. The prototype's sample data, rankings, calculations, seeded predictions and local-storage persistence are not application contracts. Layout and filter state remain local; only predictions are shared.

Details changes apply live and group into one undo action per dialog session. Closing retains edits; Clear pick starts a separate action. Suggested values remain distinguishable from explicit values. Knockout opens only after every pool result is valid.

Source Sans 3 and Barlow Condensed are self-hosted with their OFL licences in `src/assets/fonts/`. Flags remain local and icons use inline SVG. The supplied `support.js`, design-system bundle and preview runtime are reference material only; production uses Solid and plain CSS.

Mobile match choices use smaller text/flags and tighter spacing, with full team names wrapping naturally. Preserve 44px touch targets and stable left/right fixture slots when selecting teams.
