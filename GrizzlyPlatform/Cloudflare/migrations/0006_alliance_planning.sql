-- Shared alliance-planning board and device-submitted suggestions.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS AlliancePlans (
  EventId INTEGER NOT NULL PRIMARY KEY,
  Version INTEGER NOT NULL DEFAULT 0,
  OurTeamId INTEGER NULL,
  FirstPartnerId INTEGER NULL,
  SecondPartnerId INTEGER NULL,
  Notes TEXT NOT NULL DEFAULT '',
  UpdatedAt TEXT NULL,
  -- A per-write fence lets batched mutations remain conditional on the
  -- optimistic-concurrency update that began the batch.
  MutationId TEXT NOT NULL DEFAULT '',
  CONSTRAINT FK_AlliancePlans_Events_EventId
    FOREIGN KEY (EventId) REFERENCES Events (Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS AlliancePlanEntries (
  EventId INTEGER NOT NULL,
  TeamId INTEGER NOT NULL,
  Position INTEGER NOT NULL,
  Reason TEXT NOT NULL DEFAULT '',
  CONSTRAINT PK_AlliancePlanEntries PRIMARY KEY (EventId, TeamId),
  CONSTRAINT FK_AlliancePlanEntries_AlliancePlans_EventId
    FOREIGN KEY (EventId) REFERENCES AlliancePlans (EventId) ON DELETE CASCADE,
  CONSTRAINT FK_AlliancePlanEntries_Teams_TeamId
    FOREIGN KEY (TeamId) REFERENCES Teams (Id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS IX_AlliancePlanEntries_TeamId
  ON AlliancePlanEntries (TeamId);

CREATE TABLE IF NOT EXISTS AlliancePlanSuggestions (
  Id TEXT NOT NULL PRIMARY KEY,
  EventId INTEGER NOT NULL,
  TeamId INTEGER NOT NULL,
  Author TEXT NOT NULL,
  Reason TEXT NOT NULL,
  Status TEXT NOT NULL DEFAULT 'Pending',
  HostResponse TEXT NOT NULL DEFAULT '',
  CreatedAt TEXT NOT NULL,
  ReviewedAt TEXT NULL,
  CONSTRAINT FK_AlliancePlanSuggestions_Events_EventId
    FOREIGN KEY (EventId) REFERENCES Events (Id) ON DELETE CASCADE,
  CONSTRAINT FK_AlliancePlanSuggestions_Teams_TeamId
    FOREIGN KEY (TeamId) REFERENCES Teams (Id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS IX_AlliancePlanSuggestions_EventId_CreatedAt
  ON AlliancePlanSuggestions (EventId, CreatedAt DESC);
