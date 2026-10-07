-- Explicit image sharing keeps the original browser-rendered PNG. The bounded
-- base64 value keeps every row below 1 MiB.
CREATE TABLE shared_posters (
  alias TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE CHECK (length(fingerprint) = 64),
  token TEXT NOT NULL CHECK (substr(token, 1, 3) = 'v3.' AND length(token) <= 1369),
  team_id TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  show_predictions TEXT NOT NULL CHECK (show_predictions IN ('true', 'false')),
  renderer_version TEXT NOT NULL CHECK (renderer_version = 'pool-poster-v2'),
  png_hash TEXT NOT NULL CHECK (length(png_hash) = 64),
  png TEXT NOT NULL CHECK (length(png) BETWEEN 1 AND 699052),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

CREATE TRIGGER shared_posters_no_update
BEFORE UPDATE ON shared_posters
BEGIN
  SELECT RAISE(ABORT, 'Shared posters are immutable');
END;
