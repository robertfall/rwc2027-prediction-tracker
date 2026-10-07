# Pool posters and permanent sharing

The pool poster shows the focused team's own fixtures, large flags, scores where picked, kickoff dates and times, venues, and the selected timezone. Its footer invites people to make predictions at the public application address. Header labels distinguish fixtures from fixtures with predictions. Scored rows retain the prediction label without repeating the winner.

Cards use a shared layout grid: 384px height, 24px gutters and visible outer padding, and an abbreviation row centred between the flag frame and separator. Text placement uses the embedded fonts' ink extents. The schedule has separate date/time and venue rows. Current exports are 1080×1808 for 2027 and 1080×2216 for 2023.

Preview and download work on the device. Flags and fonts are embedded in the SVG; the browser creates the PNG. Each open dialog captures its scenario, focus and timezone. Both prediction variants reuse their local render and PNG. Downloading does not upload anything or change predictions, URLs or undo. SVG remains available if the device cannot produce a PNG.

## The return path

**Copy share link** explicitly uploads the prepared PNG and its captured scenario. The copied `/p/three.word.alias` page displays that exact image, with a prominent **Make your predictions** link back to the predictor. That destination reproduces the captured tournament and focuses its team. It does not overwrite the recipient's stored focus preference. The modal also exposes the permanent `/i/three.word.alias.png` URL for direct image use.

Selecting another team clears the incoming focus destination and saves that local choice. Focus-only navigation keeps prediction undo and redo. Prediction tokens and poster identity do not include this view destination.

The landing page supplies Open Graph and Twitter image metadata before JavaScript runs. Chat apps and social crawlers can retrieve the PNG directly. The landing page and download work without JavaScript; the predictor retains its usual browser editing behavior. Platforms decide their own preview crop and display, so a full portrait poster may be cropped in a social feed.

Turning **Show predictions** off removes picks from both the artwork and the uploaded scenario. Its return link opens an empty scenario of the same tournament. It does not silently reveal hidden predictions. Showing predictions shares the captured full tournament state, while the artwork shows the focused team's pool fixtures.

If publishing fails, the modal keeps local downloads and supplies a full predictor link with the captured team and permitted predictions. Clipboard failures expose selectable link fields. Variant changes and closing the modal suppress stale publication results and clipboard writes.

## Storage and serving

The first implementation uses an additive immutable `shared_posters` table in the existing D1 database. No additional service must be provisioned. The client sends standard base64 PNG bytes; the server validates bounded input, PNG structure and expected dimensions, supported tournament/team/timezone, renderer version and canonical token. It does not render images or independently verify that uploaded pixels express the submitted predictions.

The stored fingerprint covers canonical metadata and the exact PNG bytes. Equal artifacts reuse an alias; collisions and concurrent requests never overwrite earlier artifacts. Images remain unchanged if fonts, design or completion defaults change later. New designs use a new renderer version.

PNG uploads are capped at 512 KiB and JSON requests at 750 KiB. Stored base64 fits below 1 MiB per row, within D1's [2 MB row limit](https://developers.cloudflare.com/d1/platform/limits/). Successful PNG responses have immutable cache headers; errors are never cached. Only explicit publication writes storage. The existing creation limiter also applies to poster publication.

D1 makes the local and initial release implementation small. If image volume becomes material, move image bytes into R2 while keeping metadata, fingerprints, aliases and public URLs stable. R2 is designed for object storage and has [no egress bandwidth charge](https://developers.cloudflare.com/r2/pricing/). This is a storage migration, not a change to browser rendering or sharing behavior.

## Routes

| Route | Purpose |
| --- | --- |
| `POST /api/posters` | Publish or reuse the exact PNG and metadata. |
| `GET /p/:alias` | Image landing page, crawler metadata and predictor return link. |
| `GET /i/:alias.png` | Permanent immutable PNG. |
| `HEAD` on public routes | Same status and headers with no response body. |

POST accepts only `{token, teamId, timeZone, showPredictions, rendererVersion, png}`. The current renderer version is `pool-poster-v2`. The response echoes validated metadata and returns the alias, relative page URL and relative image URL. The browser validates that response before copying it.

Local Workers preview applies the additive migration. Normal release applies remote migrations before publishing, as with existing short links. Development-host URLs stay on that host; publicly reachable links require this version to be deployed.

The preview command sets `--local-upstream 127.0.0.1:8787` so absolute crawler links use the local server. Wrangler otherwise infers the Worker request origin from the first configured route. This uses [Wrangler's local origin setting](https://developers.cloudflare.com/workers/wrangler/commands/workers/); the application does not trust forwarding headers to choose its public origin.
