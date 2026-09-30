-- Core relational models used by the existing Seasons, Events, Game Forms,
-- and Device Configuration pages. Properties and relationships mirror the
-- current ASP.NET Core EF models; future migrations add the remaining models.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS Seasons (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  Year INTEGER NOT NULL,
  Name TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS IX_Seasons_Year ON Seasons (Year);

CREATE TABLE IF NOT EXISTS Events (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  SeasonId INTEGER NOT NULL,
  Name TEXT NOT NULL,
  Location TEXT NOT NULL,
  BlueAllianceKey TEXT NULL,
  EventType TEXT NOT NULL DEFAULT 'Competition',
  AllianceCount INTEGER NOT NULL DEFAULT 8,
  StartDate TEXT NULL,
  EndDate TEXT NULL,
  NexusEventKey TEXT NULL,
  CONSTRAINT FK_Events_Seasons_SeasonId
    FOREIGN KEY (SeasonId) REFERENCES Seasons (Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IX_Events_SeasonId ON Events (SeasonId);

CREATE TABLE IF NOT EXISTS GameForms (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  SeasonId INTEGER NOT NULL,
  Name TEXT NOT NULL,
  Description TEXT NOT NULL,
  FormType INTEGER NOT NULL,
  CONSTRAINT FK_GameForms_Seasons_SeasonId
    FOREIGN KEY (SeasonId) REFERENCES Seasons (Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IX_GameForms_SeasonId ON GameForms (SeasonId);

CREATE TABLE IF NOT EXISTS GameFormFields (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  GameFormId INTEGER NOT NULL,
  Question TEXT NOT NULL,
  Description TEXT NOT NULL,
  FieldType INTEGER NOT NULL,
  Required INTEGER NOT NULL,
  DisplayOrder INTEGER NOT NULL,
  IsSystemField INTEGER NOT NULL,
  IsAllianceSelectionFilter INTEGER NOT NULL,
  CONSTRAINT FK_GameFormFields_GameForms_GameFormId
    FOREIGN KEY (GameFormId) REFERENCES GameForms (Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IX_GameFormFields_GameFormId
  ON GameFormFields (GameFormId);

CREATE TABLE IF NOT EXISTS GameFormFieldOptions (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  GameFormFieldId INTEGER NOT NULL,
  Value TEXT NOT NULL,
  DisplayOrder INTEGER NOT NULL,
  CONSTRAINT FK_GameFormFieldOptions_GameFormFields_GameFormFieldId
    FOREIGN KEY (GameFormFieldId) REFERENCES GameFormFields (Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IX_GameFormFieldOptions_GameFormFieldId
  ON GameFormFieldOptions (GameFormFieldId);

CREATE TABLE IF NOT EXISTS ActiveScoutingConfigurations (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  ActivePitFormId INTEGER NULL,
  ActiveMatchFormId INTEGER NULL,
  ActiveSeasonId INTEGER NULL,
  ActiveEventId INTEGER NULL,
  CONSTRAINT FK_ActiveScoutingConfigurations_GameForms_ActivePitFormId
    FOREIGN KEY (ActivePitFormId) REFERENCES GameForms (Id) ON DELETE SET NULL,
  CONSTRAINT FK_ActiveScoutingConfigurations_GameForms_ActiveMatchFormId
    FOREIGN KEY (ActiveMatchFormId) REFERENCES GameForms (Id) ON DELETE SET NULL,
  CONSTRAINT FK_ActiveScoutingConfigurations_Seasons_ActiveSeasonId
    FOREIGN KEY (ActiveSeasonId) REFERENCES Seasons (Id) ON DELETE SET NULL,
  CONSTRAINT FK_ActiveScoutingConfigurations_Events_ActiveEventId
    FOREIGN KEY (ActiveEventId) REFERENCES Events (Id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS IX_ActiveScoutingConfigurations_ActivePitFormId
  ON ActiveScoutingConfigurations (ActivePitFormId);
CREATE INDEX IF NOT EXISTS IX_ActiveScoutingConfigurations_ActiveMatchFormId
  ON ActiveScoutingConfigurations (ActiveMatchFormId);
CREATE INDEX IF NOT EXISTS IX_ActiveScoutingConfigurations_ActiveSeasonId
  ON ActiveScoutingConfigurations (ActiveSeasonId);
CREATE INDEX IF NOT EXISTS IX_ActiveScoutingConfigurations_ActiveEventId
  ON ActiveScoutingConfigurations (ActiveEventId);
