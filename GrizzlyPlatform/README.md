# GrizzlyPlatform

GrizzlyPlatform is the shared backend and admin dashboard for scouting.

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
