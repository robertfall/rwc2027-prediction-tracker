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

The browser suite builds the production app and serves it through the local Cloudflare Workers runtime. CI runs the same checks. The stack is Solid, Vite, TypeScript and plain CSS; calculations and scenario history are independent of the renderer.

## Cloudflare deployment

This follows `../../pss/pss-site`: Cloudflare Workers, GitHub Actions, and **main as production**. The hostname is **https://rwc2027.myplaceforthings.com**, with a secondary [Workers address](https://rwc2027-prediction-tracker.myplaceforthings.workers.dev).

Every push and pull request runs checks. **Normal deployments use `git push` to `main`**: checks pass, the app publishes, the workflow waits for the hostname, and browser/HTTP smoke tests verify it. A manual workflow run also deploys its selected branch. Work on a branch and merge when ready to publish.

The workflow uses the GitHub `production` environment and the same two secret names as PSS:

- `CLOUDFLARE_API_TOKEN`: use the **Edit Cloudflare Workers** template, scoped to the intended account and zone.
- `CLOUDFLARE_ACCOUNT_ID`: the account containing the `myplaceforthings.com` zone.

Set these as repository secrets or `production` environment secrets. Keep Cloudflare credentials out of Vite variables and committed files. The app requires no runtime secrets or prediction storage.

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

`wrangler.jsonc` deploys `dist/` with a small stateless routing Worker. Root and common static assets bypass the Worker. Document requests at legacy prediction paths are internally served the app shell without a redirect: Cloudflare's asset service otherwise normalizes repeated slashes and corrupts ordinary-Base64 links. Current fragment links keep predictions entirely in the browser. The routing Worker retains no predictions.

`public/_headers` gives content-hashed `/assets/*` files one-year immutable caching. HTML and unversioned flags use Cloudflare's revalidation policy; missing assets return 404. The tests exercise the actual Workers runtime and can target the deployed hostname using `BASE_URL`.

`npm run preview` still serves the last build through Vite. Generic static hosting/subdirectory builds remain possible with `npm run build -- --base=/your-path/`; the configured Cloudflare deployment serves this dedicated hostname at its root.

Sources: [static asset routing](https://developers.cloudflare.com/workers/static-assets/routing/), [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/), [headers](https://developers.cloudflare.com/workers/static-assets/headers/), [custom domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/), [GitHub deployment action](https://github.com/cloudflare/wrangler-action).

See [AGENTS.md](AGENTS.md) for development contracts and [the upgrade plan](docs/upgrade-plan.md) for completed work and remaining stages. No external provider credentials are required.
