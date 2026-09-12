# Device Configuration

Open Device Configuration in the website sidebar. Choose an existing season,
then an event from that season, and the pit/match forms devices should use.
Save for devices applies the configuration to all devices connected to this API.

A new pit form opens directly with the preset event and displays its name.
Match scouting uses that event automatically. Forms already open keep their
original event, even when the preset changes. Event and season filters on
Submissions continue to use each submission's own event and form season.

To restore manual event selection, choose "Let scouts select an event" and save.
Changing seasons clears incompatible event/form choices; choose the new forms
before saving. Events and forms must belong to the same season.

## Updating another installation

1. Back up its SQLite database.
2. From GrizzlyPlatform.Api, run: dotnet ef database update
3. Rebuild and restart the API and website.
4. Build/install the updated GrizzlyScout Android app on each device.

The migration adds nullable season/event settings and preserves existing active
forms and submissions. Existing pit records without an event remain unassigned;
the current preset is never used to relabel historical data.

## Verification

From GrizzlyPlatform.RegressionTests, run: dotnet run

The executable uses an isolated in-memory SQLite database to verify presets,
season validation, existing form toggles, duplicates across events, historical
filters, in-progress submissions, and migration data preservation.