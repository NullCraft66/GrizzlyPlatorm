-- Persist event synchronization safety state and official event rankings.
-- These mirror EventSyncState and EventRanking in the ASP.NET application.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS EventSyncStates (
  EventId INTEGER NOT NULL,
  Resource TEXT NOT NULL,
  ManualMode INTEGER NOT NULL DEFAULT 0,
  Revision INTEGER NOT NULL DEFAULT 0,
  LastAttemptAt TEXT NULL,
  LastSuccessAt TEXT NULL,
  LastChangedAt TEXT NULL,
  SourceEtag TEXT NULL,
  Outcome TEXT NOT NULL DEFAULT 'Never',
  Message TEXT NOT NULL DEFAULT 'No synchronization attempted yet.',
  CONSTRAINT PK_EventSyncStates PRIMARY KEY (EventId, Resource),
  CONSTRAINT FK_EventSyncStates_Events_EventId
    FOREIGN KEY (EventId) REFERENCES Events (Id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS EventRankings (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  EventId INTEGER NOT NULL,
  TeamId INTEGER NOT NULL,
  Rank INTEGER NOT NULL,
  RankingPoints INTEGER NOT NULL,
  TieBreaker1 REAL NULL,
  TieBreaker2 REAL NULL,
  CONSTRAINT FK_EventRankings_Events_EventId
    FOREIGN KEY (EventId) REFERENCES Events (Id) ON DELETE CASCADE,
  CONSTRAINT FK_EventRankings_Teams_TeamId
    FOREIGN KEY (TeamId) REFERENCES Teams (Id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS IX_EventRankings_EventId_Rank
  ON EventRankings (EventId, Rank);
CREATE UNIQUE INDEX IF NOT EXISTS IX_EventRankings_EventId_TeamId
  ON EventRankings (EventId, TeamId);
CREATE INDEX IF NOT EXISTS IX_EventRankings_TeamId
  ON EventRankings (TeamId);
