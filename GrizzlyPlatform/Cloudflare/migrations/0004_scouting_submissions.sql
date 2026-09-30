-- Scouting records and answers used by the existing submission, review, and
-- alliance-selection screens. SubmissionKey is an internal correlation key
-- used to insert a parent record and its answers in one D1 batch; imported
-- records can leave it NULL.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS GameFormSubmissions (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  SubmissionKey TEXT NULL,
  GameFormId INTEGER NOT NULL,
  MatchId INTEGER NULL,
  EventId INTEGER NULL,
  TeamId INTEGER NOT NULL,
  SubmittedAt TEXT NOT NULL,
  CONSTRAINT FK_GameFormSubmissions_GameForms_GameFormId
    FOREIGN KEY (GameFormId) REFERENCES GameForms (Id) ON DELETE CASCADE,
  CONSTRAINT FK_GameFormSubmissions_Matches_MatchId
    FOREIGN KEY (MatchId) REFERENCES Matches (Id),
  CONSTRAINT FK_GameFormSubmissions_Events_EventId
    FOREIGN KEY (EventId) REFERENCES Events (Id),
  CONSTRAINT FK_GameFormSubmissions_Teams_TeamId
    FOREIGN KEY (TeamId) REFERENCES Teams (Id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS IX_GameFormSubmissions_SubmissionKey
  ON GameFormSubmissions (SubmissionKey)
  WHERE SubmissionKey IS NOT NULL;
CREATE INDEX IF NOT EXISTS IX_GameFormSubmissions_GameFormId
  ON GameFormSubmissions (GameFormId);
CREATE INDEX IF NOT EXISTS IX_GameFormSubmissions_MatchId
  ON GameFormSubmissions (MatchId);
CREATE INDEX IF NOT EXISTS IX_GameFormSubmissions_EventId
  ON GameFormSubmissions (EventId);
CREATE INDEX IF NOT EXISTS IX_GameFormSubmissions_TeamId
  ON GameFormSubmissions (TeamId);
CREATE INDEX IF NOT EXISTS IX_GameFormSubmissions_SubmittedAt
  ON GameFormSubmissions (SubmittedAt DESC);

CREATE TABLE IF NOT EXISTS GameFormAnswers (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  GameFormSubmissionId INTEGER NOT NULL,
  GameFormFieldId INTEGER NOT NULL,
  Value TEXT NOT NULL,
  CONSTRAINT FK_GameFormAnswers_GameFormFields_GameFormFieldId
    FOREIGN KEY (GameFormFieldId) REFERENCES GameFormFields (Id) ON DELETE CASCADE,
  CONSTRAINT FK_GameFormAnswers_GameFormSubmissions_GameFormSubmissionId
    FOREIGN KEY (GameFormSubmissionId) REFERENCES GameFormSubmissions (Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IX_GameFormAnswers_GameFormFieldId
  ON GameFormAnswers (GameFormFieldId);
CREATE INDEX IF NOT EXISTS IX_GameFormAnswers_GameFormSubmissionId
  ON GameFormAnswers (GameFormSubmissionId);
