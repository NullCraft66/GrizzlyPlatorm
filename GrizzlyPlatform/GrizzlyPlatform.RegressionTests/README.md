# Device configuration regression checks

Run dotnet run from this directory.

Uses an isolated in-memory SQLite database and real EF migrations/controllers.
Checks persisted configuration, season validation, compatibility with existing form
toggles, pit duplicates across events, historical event/season filtering,
in-progress forms, legacy match events, and migration data preservation.
No running API or production database is used.