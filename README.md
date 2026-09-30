# Rugby World Cup prediction tracker

A lightweight, browser-only predictor for the 2027 Rugby World Cup. Pick winners across six pools and the complete knockout bracket, or expand a match to choose scores, margin, tries and bonus points. Undo, redo and reset work locally; copying the URL shares the whole scenario.

Unspecified details use deterministic suggestions. Live odds and the calibrated forecasting engine are follow-ups. The official 52-match schedule is included; final 2027 tie regulations and the future ranking snapshot remain provisional. [Sources and assumptions](docs/tournament-sources.md)

## Development

Use **Node 24.21.0** (`.node-version`) and **npm 12.1.0**.

```sh
npm ci
npm run dev
```

```sh
npm run check
npx playwright install chromium
npm run test:browser
```

The browser suite builds and previews the production app. CI runs the same checks. The stack is Solid, Vite, TypeScript and plain CSS; calculations and scenario history are independent of the renderer.

## Static hosting

`npm run build` creates `dist/`; `npm run preview` serves it locally. For a subdirectory, build with `npm run build -- --base=/your-path/`.

Current links keep versioned compressed predictions in the URL fragment and need no prediction server. Original 2023 path links remain supported when the host sends unknown paths to `index.html`; imported 2023 links retain their tournament identity. Invalid links are preserved until the user chooses recovery.

See [AGENTS.md](AGENTS.md) for development contracts and [the upgrade plan](docs/upgrade-plan.md) for completed work and remaining stages. No external provider credentials are required.
