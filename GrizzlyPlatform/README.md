# GrizzlyPlatform

GrizzlyPlatform is the shared backend and admin dashboard for scouting.

## Downloads and installation

The easiest way to get started is to download the latest package from the repository's **Releases** page:

- **Windows desktop app:** download the `GrizzlyRoboticsPlatform-win-x64` package, extract it, and run `GrizzlyPlatform.Desktop.exe`.
- **Android scouting app:** download the GrizzlyScout APK and install it on the scouting phones.
- **Windows installation guide:** [WINDOWS_INSTALLATION.md](WINDOWS_INSTALLATION.md)
- **GrizzlyScout Android installation guide:** [GrizzlyScout/INSTALLATION.md](../GrizzlyScout/INSTALLATION.md)

The Windows app starts the API and web dashboard automatically. Android devices connect to the host computer over the local network using the host computer's IPv4 address.

> For normal team distribution, attach the Windows ZIP and Android APK to a GitHub Release so users can find them at the top of the repository.
## Project roles

- `GrizzlyPlatform.Api` is the server and database API. This is the source of truth for seasons, events, teams, matches, scouting forms, and submissions.
- `GrizzlyPlatform.Web` is the admin dashboard for managing seasons, events, teams, matches, forms, and collected scouting data.
- `..\GrizzlyScout` is the student Android scouting app. It should load forms from `GrizzlyPlatform.Api` and submit answers back to `GrizzlyPlatform.Api`.
- `..\GrizzlyScout-Server` is an older desktop shell and is not used by the current platform plan.

## Local ports

- API: `http://localhost:5263`
- Web dashboard: `http://localhost:5019`

When a phone or tablet connects to the API, use the computer's network IP address instead of `localhost`.

Example:

```text
http://192.168.1.25:5263
```

## Scout submission endpoint

Student scouting apps should post match scouting data to:

```text
POST /api/GameFormSubmissions/scout
```

Example body:

```json
{
  "gameFormId": 4,
  "eventId": 2,
  "matchType": "Qualification",
  "matchNumber": 12,
  "setNumber": 1,
  "teamNumber": 3504,
  "answers": [
    {
      "gameFormFieldId": 16,
      "value": "5"
    }
  ]
}
```

The API resolves the internal match and team IDs from the event, match number, match type, set number, and team number.
If the form has fields named `Team Number` or `Match Number`, the API automatically fills those answers from the top-level request values when the app does not send them separately.

