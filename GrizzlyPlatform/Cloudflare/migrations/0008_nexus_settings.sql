-- Keep the Nexus API key encrypted at rest. The encryption key is a Worker
-- secret and must never be stored in D1 or checked into source control.
CREATE TABLE IF NOT EXISTS NexusSettings (
  Id INTEGER NOT NULL PRIMARY KEY CHECK (Id = 1),
  ApiKeyCiphertext TEXT NOT NULL DEFAULT '',
  ApiKeyIv TEXT NOT NULL DEFAULT '',
  EventKey TEXT NOT NULL DEFAULT '',
  Enabled INTEGER NOT NULL DEFAULT 0 CHECK (Enabled IN (0, 1)),
  UpdatedAt INTEGER NOT NULL
);

INSERT OR IGNORE INTO NexusSettings
  (Id, ApiKeyCiphertext, ApiKeyIv, EventKey, Enabled, UpdatedAt)
VALUES (1, '', '', '', 0, unixepoch());
