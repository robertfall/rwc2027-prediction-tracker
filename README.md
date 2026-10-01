# Rugby World Cup prediction tracker

A lightweight predictor for the 2027 Rugby World Cup. Pick winners across six pools and the complete knockout bracket, or open **Details** to choose scores, margin, tries and bonus points. Editing, undo, redo and reset work locally. **Copy link** shares an immutable snapshot through a three-word URL, with a full-link fallback when offline or the shortener is unavailable.

Browse pools by pool or timeline, then unlock knockout rounds, timeline and bracket views once every pool result is valid. Standings sit beside matches on desktop and stack on mobile. View and filter changes leave predictions and the URL untouched. Details edits apply immediately as one undoable session; **Clear pick** is a separate action. [Design reference](docs/design/README.md)

Opening **Details** adds `?match=25` (for match 25) to the URL. Share from the dialog's **Copy match link** control to open that game in a fresh browser, including its current predictions. Full and three-word links retain this destination; closing removes it without changing predictions or undo. [Match links](docs/match-links.md)

Shared links use sparse v3 bit-packing: one shallow winner takes a nine-character token and 52 winner/advancement choices take 129; older links remain readable. Generated scores and tries use the existing saved-outcome encoding. [Prediction-link format](docs/prediction-links.md)

The built-in shortener stores that exact token in Cloudflare D1, deduplicates identical predictions and resolves `/s/maple.river.sunny` back to the full scenario. Sharing replaces the address bar with the short URL when its snapshot is still current. A quiet background lookup also reuses already-shared states; edits stay instant and undo restores known aliases locally. Older shared snapshots stay unchanged. [Short-link contract](docs/short-links.md)

**Fill matches** projects every eligible unpicked pool and knockout match from World Rugby ratings. It plans outcomes separately, then applies one batch: one undo action and one URL update, preserving existing choices. Manual winner picks retain 24–17 completion. Fixed snapshots and a simple rating-gap heuristic provide the first pass; live odds and calibration are follow-ups. [Prediction engine](docs/prediction-engine.md)

The official 52-match schedule is included; final 2027 tie regulations and the future qualification tie-break ranking snapshot remain provisional. [Sources and assumptions](docs/tournament-sources.md)

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

The browser suite builds the production app and serves it through the local Cloudflare Workers runtime. CI runs the same checks. The stack is Solid, Vite, TypeScript and plain CSS; calculations and scenario history are independent of the renderer.

## Cloudflare deployment

This follows `../../pss/pss-site`: Cloudflare Workers, GitHub Actions, and **main as production**. The hostname is **https://rwc2027.myplaceforthings.com**, with a secondary [Workers address](https://rwc2027-prediction-tracker.myplaceforthings.workers.dev).

Every push and pull request runs checks. **Normal deployments use `git push` to `main`**: checks pass, the app publishes, the workflow waits for the hostname, and browser/HTTP smoke tests verify it. A manual workflow run also deploys its selected branch. Work on a branch and merge when ready to publish.

The workflow uses the GitHub `production` environment and the same two secret names as PSS:

- `CLOUDFLARE_API_TOKEN`: use the **Edit Cloudflare Workers** template, scoped to the intended account and zone, and add account **D1 Edit** permission.
- `CLOUDFLARE_ACCOUNT_ID`: the account containing the `myplaceforthings.com` zone.

Set these as repository secrets or `production` environment secrets. Keep Cloudflare credentials out of Vite variables and committed files. The Worker binds `SHARES` to the configured D1 database; prediction edits require no backend or account.

```sh
npm run build
npm run deploy:check           # validate without uploading
npm run preview:cloudflare     # local Workers runtime at http://127.0.0.1:8787
```

For bootstrap or recovery deployments:

```sh
npx wrangler login            # once, for manual deployments
npm run deploy                # build and publish the configured Worker/domain
BASE_URL=https://rwc2027.myplaceforthings.com npm run test:browser
```

`wrangler.jsonc` deploys `dist/` with a small routing/sharing Worker. Root and common static assets bypass it. Document requests at legacy prediction paths are internally served the app shell without a redirect: Cloudflare's asset service otherwise normalizes repeated slashes and corrupts ordinary-Base64 links. Current fragment links keep editing state in the browser; explicit sharing creates an immutable D1 snapshot. Local preview applies local migrations, and deployments apply remote migrations before publishing.

`public/_headers` gives content-hashed `/assets/*` files one-year immutable caching. HTML, flags and social preview images use Cloudflare's revalidation policy; missing assets return 404. Open Graph/Twitter tags are present in the HTML without JavaScript, using the static `/social/rwc2027-card-v1.png` image. Shared predictions currently use this app preview; state-specific images remain a follow-up. The tests exercise the actual Workers runtime and can target the deployed hostname using `BASE_URL`.

`npm run preview` still serves the last build through Vite. Generic static hosting/subdirectory builds remain possible with `npm run build -- --base=/your-path/`; the configured Cloudflare deployment serves this dedicated hostname at its root.

Sources: [static asset routing](https://developers.cloudflare.com/workers/static-assets/routing/), [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/), [headers](https://developers.cloudflare.com/workers/static-assets/headers/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [GitHub deployment action](https://github.com/cloudflare/wrangler-action).

See [AGENTS.md](AGENTS.md) for development contracts and [the upgrade plan](docs/upgrade-plan.md) for completed work and remaining stages. No external provider credentials are required.
