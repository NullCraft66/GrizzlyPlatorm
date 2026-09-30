-- User credentials are imported from the existing ASP.NET database; never seed a
-- real password or account in a checked-in migration.
CREATE TABLE IF NOT EXISTS Users (
  Id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  Username TEXT NOT NULL,
  DisplayName TEXT NOT NULL,
  PasswordHash TEXT NOT NULL,
  Role TEXT NOT NULL DEFAULT 'Scout',
  IsActive INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS IX_Users_Username ON Users (Username);

-- Store only a SHA-256 digest of the opaque cookie value, never the bearer token.
CREATE TABLE IF NOT EXISTS AuthSessions (
  TokenHash TEXT NOT NULL PRIMARY KEY,
  UserId INTEGER NOT NULL,
  CreatedAt INTEGER NOT NULL,
  ExpiresAt INTEGER NOT NULL,
  CONSTRAINT FK_AuthSessions_Users_UserId
    FOREIGN KEY (UserId) REFERENCES Users (Id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS IX_AuthSessions_UserId ON AuthSessions (UserId);
CREATE INDEX IF NOT EXISTS IX_AuthSessions_ExpiresAt ON AuthSessions (ExpiresAt);
