CREATE TABLE shared_snapshots (
  alias TEXT PRIMARY KEY NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE CHECK (length(fingerprint) = 64),
  token TEXT NOT NULL CHECK (substr(token, 1, 3) = 'v3.' AND length(token) <= 1369),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
) STRICT;

-- An alias always names the original snapshot, even if a future writer changes.
CREATE TRIGGER shared_snapshots_no_update
BEFORE UPDATE ON shared_snapshots
BEGIN
  SELECT RAISE(ABORT, 'Shared snapshots are immutable');
END;
