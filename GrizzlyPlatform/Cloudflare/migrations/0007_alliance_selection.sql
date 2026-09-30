-- Persist the existing event alliance-selection workflow and its undo history.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS AllianceSelections (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  EventId INTEGER NOT NULL,
  Status TEXT NOT NULL,
  CurrentRound INTEGER NOT NULL,
  CurrentAlliance INTEGER NOT NULL,
  StartedAt TEXT NULL,
  CompletedAt TEXT NULL,
  -- Conditional D1 batches use this token as a per-selection optimistic-write fence.
  MutationId TEXT NOT NULL DEFAULT '',
  CONSTRAINT FK_AllianceSelections_Events_EventId
    FOREIGN KEY (EventId) REFERENCES Events (Id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS IX_AllianceSelections_EventId
  ON AllianceSelections (EventId);

CREATE TABLE IF NOT EXISTS AlliancePicks (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  AllianceSelectionId INTEGER NOT NULL,
  AllianceNumber INTEGER NOT NULL,
  Round INTEGER NOT NULL,
  PickOrder INTEGER NOT NULL,
  InvitingTeamId INTEGER NULL,
  InvitedTeamId INTEGER NOT NULL,
  Result TEXT NOT NULL,
  Timestamp TEXT NOT NULL,
  PreviousStateJson TEXT NULL,
  CONSTRAINT FK_AlliancePicks_AllianceSelections_AllianceSelectionId
    FOREIGN KEY (AllianceSelectionId) REFERENCES AllianceSelections (Id) ON DELETE CASCADE,
  CONSTRAINT FK_AlliancePicks_Teams_InvitedTeamId
    FOREIGN KEY (InvitedTeamId) REFERENCES Teams (Id) ON DELETE RESTRICT,
  CONSTRAINT FK_AlliancePicks_Teams_InvitingTeamId
    FOREIGN KEY (InvitingTeamId) REFERENCES Teams (Id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS IX_AlliancePicks_AllianceSelectionId
  ON AlliancePicks (AllianceSelectionId);
CREATE INDEX IF NOT EXISTS IX_AlliancePicks_InvitedTeamId
  ON AlliancePicks (InvitedTeamId);
CREATE INDEX IF NOT EXISTS IX_AlliancePicks_InvitingTeamId
  ON AlliancePicks (InvitingTeamId);

CREATE TABLE IF NOT EXISTS Alliances (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  AllianceSelectionId INTEGER NOT NULL,
  AllianceNumber INTEGER NOT NULL,
  CaptainTeamId INTEGER NOT NULL,
  CONSTRAINT FK_Alliances_AllianceSelections_AllianceSelectionId
    FOREIGN KEY (AllianceSelectionId) REFERENCES AllianceSelections (Id) ON DELETE CASCADE,
  CONSTRAINT FK_Alliances_Teams_CaptainTeamId
    FOREIGN KEY (CaptainTeamId) REFERENCES Teams (Id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS IX_Alliances_AllianceSelectionId_AllianceNumber
  ON Alliances (AllianceSelectionId, AllianceNumber);
CREATE INDEX IF NOT EXISTS IX_Alliances_CaptainTeamId
  ON Alliances (CaptainTeamId);

CREATE TABLE IF NOT EXISTS AllianceMembers (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  AllianceId INTEGER NOT NULL,
  TeamId INTEGER NOT NULL,
  SelectionRound INTEGER NOT NULL,
  SelectionOrder INTEGER NOT NULL,
  CONSTRAINT FK_AllianceMembers_Alliances_AllianceId
    FOREIGN KEY (AllianceId) REFERENCES Alliances (Id) ON DELETE CASCADE,
  CONSTRAINT FK_AllianceMembers_Teams_TeamId
    FOREIGN KEY (TeamId) REFERENCES Teams (Id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS IX_AllianceMembers_AllianceId_TeamId
  ON AllianceMembers (AllianceId, TeamId);
CREATE INDEX IF NOT EXISTS IX_AllianceMembers_TeamId
  ON AllianceMembers (TeamId);

CREATE TABLE IF NOT EXISTS AllianceRankedTeam (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  AllianceSelectionId INTEGER NOT NULL,
  TeamId INTEGER NOT NULL,
  Rank INTEGER NOT NULL,
  CONSTRAINT FK_AllianceRankedTeam_AllianceSelections_AllianceSelectionId
    FOREIGN KEY (AllianceSelectionId) REFERENCES AllianceSelections (Id) ON DELETE CASCADE,
  CONSTRAINT FK_AllianceRankedTeam_Teams_TeamId
    FOREIGN KEY (TeamId) REFERENCES Teams (Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IX_AllianceRankedTeam_AllianceSelectionId
  ON AllianceRankedTeam (AllianceSelectionId);
CREATE INDEX IF NOT EXISTS IX_AllianceRankedTeam_TeamId
  ON AllianceRankedTeam (TeamId);
