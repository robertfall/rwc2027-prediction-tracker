# Short prediction links

**Copy link** stores the clicked prediction as an immutable public snapshot and copies a URL such as `/s/maple.river.sunny`. Opening that URL retrieves the exact saved v3 token and redirects to the existing `/#predictions=...` reader. Scores, tries, explicit choices, conflicts, tournament identity and dormant bracket outcomes all use the existing codec. No prediction schema, profiles or long-link readers change.

Editing, recalculation and undo remain local and synchronous. Sharing replaces the address bar with the short URL when the saved token exactly matches the current state, without creating an undo entry or changing predictions. Changes made while a share request is pending do not alter the snapshot being shared or let its response overwrite the newer editing URL. Each changed scenario can have a different link; existing shared links keep their original data permanently.

## Bidirectional lookup

The D1 `shared_snapshots` table stores `alias`, `fingerprint`, `token` and `created_at`:

- The fingerprint is SHA-256 of the canonical token, with a unique index. Repeated shares reuse the same alias, including concurrent requests.
- The alias is three dot-separated words with a primary-key constraint. Crypto-generated collisions retry; inserts never overwrite an existing record.
- Tokens are normalized with `encodeScenario(decodeScenario(token))`. Storage deliberately does not create a controller or reconcile the scenario: that could replace accepted intent or dormant outcomes.
- A database trigger rejects updates. There is no deletion, expiry or edit endpoint. Future schema migrations must preserve existing aliases and tokens.

The 128-word vocabulary is explicitly reviewed for this product and retained in `src/sharing/words.ts`, giving 2,097,152 possible aliases. This is an allocated name backed by storage, rather than a three-word compression of every possible tournament state. Existing aliases must remain readable if future vocabulary changes.

## HTTP contract

| Endpoint | Behavior |
|---|---|
| `POST /api/shares` | JSON `{ "token": "v3.…" }` → `{ "alias": "maple.river.sunny", "token": "v3.…" }`; create or reuse a snapshot. Older supported tokens normalize to v3. |
| `GET /api/shares?fingerprint=:sha256` | Read-only lookup of an existing snapshot by its 64-character lowercase SHA-256 fingerprint; returns alias/token or 404. |
| `GET /api/shares/:alias` | Return the saved alias and canonical token. |
| `GET /s/:alias` | Redirect to the same-origin full prediction URL. |
| `HEAD` on lookup routes | Same status/headers without a response body. |

JSON bodies are limited to 16,384 bytes, incoming tokens to 12,000 characters, and canonical v3 tokens to 1,369 characters. Existing codec validation also bounds frames, decompression and fixture data. Unknown fields, invalid tokens and unsupported methods are rejected. Missing aliases return 404; missing/unavailable storage returns 503. Errors are not cached. Successful immutable lookups have one-hour public caching; creation responses use `no-store`.

Creation rejects cross-origin browser requests and uses the Worker `SHARE_LIMITER` binding: 60 attempts per client IP per minute per Cloudflare location. This is a coarse anonymous limit; clients behind the same gateway share its allowance. Lookup routes remain available. Service errors, including throttling, preserve the browser's full-link fallback.

## Browser behavior

The share client captures the canonical token and full URL before awaiting anything. It bounds the request to five seconds, validates both the alias and the exact echoed token, and keeps a session cache for already-shared scenarios. No local storage is required. The copy button is pending while a share request runs; all prediction controls remain usable.

On startup and after 350 ms without another prediction change, the browser checks whether the canonical state's fingerprint already has an alias. This lookup never creates a snapshot. An exact token match lets `src/state/browser.ts` replace the address with `/s/:alias`, preserving the query string and the existing undo session. Known aliases return synchronously on undo/redo; an unshared edit immediately gets its full fragment URL. Superseded lookups are aborted, and responses are guarded against intervening edits, navigation or disposal. Missing aliases and service failures leave the current URL untouched. Browser navigation to a known alias imports that snapshot and starts a new undo session, matching full-link navigation.

A short alias and a prediction fragment cannot describe different snapshots at once. Same-document navigation to `/s/:alias#...` is rejected and preserved until recovery, preventing a displayed state that would change on reload.

The direct backend lookup retrieves the alias and verifies its exact token in one request. A Bloom filter could only answer possible membership and would still need that lookup; keeping a downloaded filter fresh would add a separate protocol without removing the retrieval request.

Where supported, the clipboard write starts during the click with a promised text payload, so waiting for storage preserves [Safari's user-gesture requirement](https://webkit.org/blog/10855/async-clipboard-api/). Failed or unsupported native writes use the existing text/manual copying paths.

If storage, the network or the response is unavailable, the client copies the captured full URL and explains that the short link was unavailable. If clipboard APIs also fail, the existing selectable URL field remains available. An empty 2027 scenario can share the root URL directly. Malformed prediction links must be recovered before sharing.

Opening or refreshing a short link retrieves the saved token through the Worker redirect; the initial lookup restores its short address. Generic static/Vite hosting can continue to edit and share full links. Use the Workers preview to exercise actual short links. Open Graph currently uses the existing static image; the stored snapshot makes state-specific image generation possible in a later change.

Full URLs, short URLs, cached links and Worker redirects preserve the captured query string, including `?match=25`. That destination opens the match's Details dialog without changing token/fingerprint/alias identity; different matches in the same prediction reuse one alias. Empty 2027 scenarios can share a match destination at the root without allocating a record. [Match-link contract](match-links.md)

## Storage and deployment

`wrangler.jsonc` binds `SHARES` to `rwc2027-shares`; migrations live in `migrations/`. The database identifier is public configuration, not a credential. Local state stays under ignored `.wrangler/`.

```sh
npm run build
npm run preview:cloudflare      # migrates local D1, then serves port 8787
npm run test:browser           # builds and starts that preview automatically
npm run deploy:check           # bundles without publishing
```

The normal GitHub deployment applies `db:migrate:remote` before publishing. The Cloudflare API token needs **D1 Edit** as well as the existing Workers permissions. Recovery `npm run deploy` follows the same ordering. Applying migrations does not publish the app.

For a new Cloudflare account, create `rwc2027-shares` with `npx wrangler d1 create rwc2027-shares`, replace the database ID in `wrangler.jsonc`, then apply `npm run db:migrate:remote`. Keep production records; do not recreate or reset the database during normal releases.

D1 has a [free allocation](https://developers.cloudflare.com/d1/platform/pricing/) of 5 million rows read/day, 100,000 rows written/day and 5 GB total storage. Indexed lookups and deduplication keep normal usage small; inserts also write index entries, so one share is not necessarily one billed row write. Workers request limits/pricing apply separately.

References: [Worker bindings](https://developers.cloudflare.com/d1/worker-api/), [migrations](https://developers.cloudflare.com/d1/reference/migrations/), [creation rate limiter](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Verification

Both TypeScript compilers, lint, all 343 unit/property tests, the production build and Cloudflare deployment dry run pass. All 37 browser journeys pass against local Workers/D1, including duplicate shares, fresh-browser replay, automatic read-only lookup, address replacement and refresh, custom/conflicting/dormant predictions, edits during sharing, stale responses, native clipboard ordering, offline fallback, cached alias navigation and conflicting fragment recovery. The production database and initial schema are provisioned. Release applies migrations before publishing the Worker, then runs these browser journeys against the live hostname.

That release (`20ca470`) also passed all 37 journeys against production on 1 October 2026. Match-query preservation adds coverage in the 369-test combined check and 46-browser-journey suite; see [match destinations](match-links.md).
