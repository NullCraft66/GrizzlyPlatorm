# Shared alliance planning

## Host website

Open Alliance Plan in the sidebar and choose an event, or use the planning board
on Alliance Selection. The Add to wishlist button beside a team lets you carry
scouting-filter results into your plan.

Choose our team, add preferred teams, write the reasons, and use Move up / Move
down to set priority. Partner 1 / Partner 2 buttons assign proposed alliance
partners. Add strategy notes, then Publish plan to devices.

Edits stay local until published. Event switching is disabled while the board has
unpublished edits; publish or discard them first. Another host's newer version
cannot be silently overwritten.

Device suggestions appear in the inbox, which refreshes every 15 seconds.
Accept to wishlist appends a new team with the scout's reason. Existing wishlist
teams keep their current position and host reason. Dismiss leaves the plan alone.
Optional host responses and review status are visible on devices.

Planning does not create accepted picks in the official alliance-selection draft.

## Mobile

Open Alliance Plan / Suggest Teams on Home, or Alliance Plan in the drawer.
The configured active event is selected initially; other events can be viewed.
The screen shows proposed partners, ordered reasons, strategy notes, and
suggestion status/host responses. It refreshes every 15 seconds while open.

Enter your name/team, select a team, explain why, and tap Send suggestion.
The host reviews suggestions before the published wishlist changes.

The last fetched plan is cached separately for each event. Offline data is
labeled with its last refresh time. Suggestion drafts are retained when leaving
the screen or when sending fails. Reconnect and retry Send; retries reuse the
request identifier to avoid duplicates. Suggestions are not sent automatically
in the background.

## Installation and checks

Back up the SQLite database, then run dotnet ef database update in the API
directory. Rebuild/restart the API and website and install the updated Android
APK. All devices must be able to reach the configured API.

Run dotnet run from GrizzlyPlatform.RegressionTests for isolated SQLite
regression checks of plans, priorities, host review, duplicate retries, event
isolation, and the existing device/draft features.