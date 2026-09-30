# Sunlit Matchday — Design System

Design system for an **independent Rugby World Cup 2027 (Australia) score prediction hub**: fans predict match scores, track picks and compete in league tables.

"Sunlit Matchday" is the source brief's *internal direction label*, not a cleared product name. The system is an original direction informed by research into the official Australia 2027 identity. It deliberately does **not** borrow the official brand. It should read as its own product with every tournament reference removed.

> Disclosure to include on every product surface (subject to legal review): "An independent project. Not affiliated with or endorsed by World Rugby or Rugby World Cup Limited."

## Sources

Everything came from one uploaded package, `rwc2027_style_guide.zip`, expanded to `uploads/rwc2027_style_guide/` and copied to `guidelines/source/`:
- `research-and-design-brief.md`: full brief (colour, type, spacing, shape, motion, voice, rights boundaries, acceptance criteria)
- `style-specimen.html`: browser specimen of the direction (hero, matchday card, palette, type, controls)
- `tokens.css` / `tokens.json`: proposed starter tokens (the values in `tokens/` are taken from these exactly)
- `contrast-checks.json`: WCAG ratios for token pairs
- `source-register.md` / `.json`: 34 researched sources (World Rugby announcements, Homeground, Masters & Savant, IP Australia, ACCC, W3C, font repos)

There was no codebase, Figma file, production UI, logo, imagery or icon set. The fonts are open-source: Barlow Condensed from github.com/jpt/barlow and Source Sans 3 from github.com/adobe-fonts/source-sans, both OFL 1.1.

## Index

- `styles.css`: entry point (imports only)
- `tokens/`: `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `shape.css`, `motion.css`, `utilities.css` (`.sm-*` opt-in helpers from the source)
- `fonts/`: self-hosted woff2 files (latin + latin-ext) for Barlow Condensed 600/700 and Source Sans 3 400/600/700
- `components/`: React primitives plus `components.css` (the class styles they use)
- `guidelines/cards/`: foundation specimen cards; `guidelines/source/`: the original brief package
- `ui_kits/prediction-hub/`: click-through web app (Home, Fixtures, Match prediction, Leaderboard)
- `thumbnail.html`, `SKILL.md`

### Components
- **actions/**: Button, IconButton
- **forms/**: Input, Select, Checkbox, Radio, Switch, ScoreStepper
- **display/**: Card, Badge, Tag
- **navigation/**: Tabs, TopNav
- **feedback/**: Dialog, Toast, Tooltip, Notice
- **brand/**: Wordmark, Icon
- **matchday/**: FixtureCard, FixtureRow, LeaderboardTable

No source defined a component inventory, so this is a standard set sized to a prediction product. Domain-specific components follow the brief. FixtureCard evolves the specimen's matchday card. FixtureRow and LeaderboardTable cover the "dense fixture list" the brief asks for.

**Intentional additions:** `Icon` wraps Lucide (CDN) because no icon set was supplied. `Wordmark` exists because no logo was supplied and the name is set in plain type. `ScoreStepper` is the core prediction input.

### UI kits
- `ui_kits/prediction-hub/`: see its README. No existing product UI was supplied, so these screens apply the brief's handoff instruction (marketing header, dense fixture list, detail screen). They are not recreations of an existing product. All fixtures are fictional.

---

## CONTENT FUNDAMENTALS

**Voice:** a knowledgeable, welcoming rugby companion. It is warm rather than clinical, confident rather than aggressive, and sociable rather than exclusive. It uses useful verbs and a little anticipation instead of event-promoter superlatives.

- **Person:** second person ("your plans", "Find your next match"). The product rarely says "we".
- **Casing:** sentence case for navigation, buttons, forms and descriptions. Uppercase only for short display headlines (Barlow Condensed) and small tracked eyebrows ("POOL B · ROUND 2").
- **Headlines:** short, often in two beats, with the second line in clay. Examples: "Big occasion. / Open invitation.", "Call the score. / Back your read.", "Make a day of it."
- **Microcopy examples from the brief:** "Find your next match", "Build your matchday", "Your plans, all together", "Save match", "Ready to plan", "✓ Saved to demo plan".
- **Paired contrasts** set the brand's character: "Warm, not rustic.", "Confident, not combative.", "Expressive, not distracting."
- **Facts first:** teams and time come first, then venue and an explicit time-zone label ("17:30 · Venue-local time"), then the action. Important fixture info is never tiny metadata.
- **No emoji.** A plain ✓ glyph appears once in the specimen's saved state; prefer the Lucide `check` icon.
- **Humour** is occasional, original and editorial. It never replicates campaign scenes (vehicles, lizard, and so on).
- **Never use:** the official slogan ("Go All Out"), betting language (odds, punt, stake), or national-cliché collage copy.
- Paragraphs run 55–68 characters wide. Numbers are 24-hour and tabular.

## VISUAL FOUNDATIONS

**Concept:** festival energy around the edges and product clarity at the centre. There are two levels of expression. Marketing and editorial pages get an oversized condensed headline, one bold colour panel and at most one strong photograph. Fixtures, planning, account and leaderboard screens keep the same type, accents and rhythm with the decoration turned down.

- **Colour:** paper `#F7F3E8` canvas, white task surfaces, ink `#202A27` text, eucalyptus `#245C4A` for structure and nav panels, clay `#B84E32` for the primary action and editorial emphasis, and sun `#E9B949` for small celebratory accents (ink text only; white on sun is 1.83:1). The rough balance is 70% light neutral, 20% dark structure and 10% accent. Avoid large green-and-gold blocks, which read as a national-team identity. Semantic colours (success, warning, error, info) are separate from brand colours and always come with a label or icon. Pool and team coding stays text-labelled and separate from brand colours.
- **Type:** Barlow Condensed 700 uppercase for heroes (48–88px, line-height 1.0, −0.02em) and big numerals such as dates and scores. Source Sans 3 400/600/700 for everything else: h1 40/1.1, h2 28/1.15, h3 22/1.2 (600), body 16/1.5, secondary 14/1.4, label 14/600. Eyebrows are 12px/700 with 0.14em tracking in caps. The condensed display is deliberately narrow to contrast with the wide official capitals. Never horizontally scale a typeface.
- **Spacing:** 4px base on the scale 4, 8, 12, 16, 24, 32, 48, 64, 96. Content max width is 1248px. Gutters are 20/32/48px. Card padding is 16px (compact) or 24px (comfortable). Sections are 64px apart, with 96px around hero moments. Icon to label is 8px, label to control is 8px, and groups are 24–32px apart. Dense rows use 12px vertical padding.
- **Backgrounds:** flat paper. There are no gradients, textures or patterns behind data. The only full-colour grounds are the eucalyptus panel and the sand notice. Original geometry may come from straight pitch markings, alignment rails and single route connectors, used sparingly. Never use nested ovals, the "aura" silhouette or dense cultural patterns.
- **Imagery:** inhabited and warm, in directional daylight at eye level: supporters arriving, shared tables, city light, coastal and urban life as well as landscape, with room left for text. Imagery must be owned or licensed. **None was supplied.** The system must still have an identity with no photography at all.
- **Corner radii:** 8px for controls, 12px for cards, 20px for dialogs, and pills only for badges, filter tags and switches. Frames are ordinary rectangles, never asymmetric ovals. Don't nest rounded cards.
- **Cards:** white fill, 1px subtle keyline `#D6D0C3`, 12px radius, no shadow by default. Sections inside a card are separated by keylines, not nested cards.
- **Borders:** the subtle border is decorative only. Controls use the strong border `#7D857D`, which reaches 3.43:1 on paper.
- **Shadows:** flat by default. "Raised" is `0 4px 16px rgb(32 42 39/.08)`. "Overlay" is `0 16px 48px rgb(32 42 39/.16)`, for dialogs and toasts only. No glows, glass, embossing or inner shadows.
- **Transparency and blur:** there is no blur. The only transparency is the dialog scrim (ink at 48%) and the ghost hover tint (ink at 6%).
- **Hover:** fills darken (clay to `#9C4028`, eucalyptus to `#1B493A`), white fills go to paper, and input borders go from strong to ink. Nav links gain an underline. There is no opacity fading and no scale.
- **Press:** there is no shrink or bounce; the hover colour holds. Toggles such as Tag go to an ink fill with `aria-pressed`.
- **Focus:** a 3px `#255D7A` outline with a 3px offset and a 3px paper separation ring, on `:focus-visible` only.
- **Motion:** 150ms for controls, 240ms for panels, and at most 450ms for hero entrances, all on `cubic-bezier(.2,.8,.2,1)`. Dialogs and toasts fade up by 8px. There are no tickers, no parallax behind text and no autoplay sound. Every duration drops to 0 under `prefers-reduced-motion`.
- **Targets:** controls are 48px tall by default, with a 44px minimum.
- **Layout:** a sticky or fixed header is optional, and the kit's TopNav is static. Toasts sit fixed at the bottom right. Hero layouts use a 1.15fr / .85fr grid with the headline next to a single card.

## ICONOGRAPHY

The source package contains **no icons, icon font or sprite**, and describes no icon style. The system therefore uses **Lucide** (line icons, 2px stroke, round joins), loaded from `https://unpkg.com/lucide-static@0.460.0/icons/<name>.svg` through the `Icon` component. Icons are rendered as a CSS mask so they take `currentColor`. **This is a substitution. Replace it if the project adopts its own set.**

- Sizes are 20px by default, 16px in meta text and tags, 14px in badges, and 24px at most in UI. There is an 8px gap to the label.
- An icon always sits next to a text label. An icon on its own (IconButton) must have an `aria-label`.
- Common icons: `calendar`, `clock`, `map-pin`, `check`, `lock`, `star` (exact score), `trophy`, `users`, `bell`, `arrow-up` / `arrow-down` (rank movement), `circle-alert`, `info`.
- No emoji. Unicode is used only for typographic characters (the en dash in scores "24 – 17", the middle dot "·" as a separator).
- **No logo exists.** The product name is set in plain type through `Wordmark` ("sunlit / matchday" with a clay slash). Never draw a mark, and never use the official RWC mark, trophy silhouette, tournament lockups, team crests or the Riki Salam tapestry. Culturally grounded artwork requires a genuine, consented collaboration.
