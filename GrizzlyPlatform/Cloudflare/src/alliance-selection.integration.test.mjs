import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fileURLToPath } from "node:url";
import worker from "./index.ts";

const ORIGIN = "https://grizzly-platform.test";
const SESSION_TOKEN = "A".repeat(43);
const SESSION_HASH = createHash("sha256").update(SESSION_TOKEN).digest("hex");
const MIGRATIONS = [
  "0001_core_read_models.sql",
  "0002_team_match_read_models.sql",
  "0003_authentication.sql",
  "0004_scouting_submissions.sql",
  "0005_event_sync_and_rankings.sql",
  "0006_alliance_planning.sql",
  "0007_alliance_selection.sql",
  "0008_nexus_settings.sql",
];

function createD1(sqlite) {
  const db = {
    withSession() {
      return this;
    },
    prepare(sql) {
      let values = [];
      return {
        bind(...boundValues) {
          values = boundValues;
          return this;
        },
        async first() {
          return sqlite.prepare(sql).get(...values) ?? null;
        },
        async all() {
          return { results: sqlite.prepare(sql).all(...values) };
        },
        async run() {
          const results = sqlite.prepare(sql).all(...values);
          const changes = sqlite.prepare("SELECT changes() AS changes").get().changes;
          return { results, meta: { changes } };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return db;
}

async function createFixture(t, teamCount = 24) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const migration of MIGRATIONS) {
    const path = fileURLToPath(new URL(`../migrations/${migration}`, import.meta.url));
    sqlite.exec(await readFile(path, "utf8"));
  }

  const now = Math.floor(Date.now() / 1_000);
  sqlite.prepare(`INSERT INTO Users (Id, Username, DisplayName, PasswordHash, Role, IsActive)
    VALUES (1, 'scout', 'Test Scout', 'unused', 'Scout', 1)`).run();
  sqlite.prepare(`INSERT INTO AuthSessions (TokenHash, UserId, CreatedAt, ExpiresAt)
    VALUES (?, 1, ?, ?)`).run(SESSION_HASH, now, now + 43_200);
  sqlite.prepare("INSERT INTO Seasons (Id, Year, Name) VALUES (1, 2026, 'Rebuilt')").run();
  sqlite.prepare(`INSERT INTO Events (Id, SeasonId, Name, Location)
    VALUES (1, 1, 'Test Event', 'Detroit')`).run();

  const insertTeam = sqlite.prepare(`INSERT INTO Teams (Id, TeamNumber, Name, Location)
    VALUES (?, ?, ?, 'Michigan')`);
  const insertRanking = sqlite.prepare(`INSERT INTO EventRankings
    (EventId, TeamId, Rank, RankingPoints) VALUES (1, ?, ?, 0)`);
  for (let teamId = 1; teamId <= teamCount; teamId++) {
    insertTeam.run(teamId, 1000 + teamId, `Team ${teamId}`);
    insertRanking.run(teamId, teamId);
  }

  t.after(() => sqlite.close());
  const env = {
    DB: createD1(sqlite),
    EVENT_SYNC_QUEUE: { async send() {} },
    ASSETS: { async fetch() { return new Response("app"); } },
  };
  return { sqlite, env };
}

function apiRequest(path, method = "GET", body, { authenticated = true, origin = ORIGIN } = {}) {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  if (authenticated) headers.set("Cookie", `__Host-grizzly_session=${SESSION_TOKEN}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

test("team routes preserve the ASP.NET CRUD response shape", async (t) => {
  const { env, sqlite } = await createFixture(t, 6);

  const invalid = await worker.fetch(apiRequest("/api/Teams", "POST", {
    teamNumber: 0, name: "Invalid", location: "Detroit",
  }), env);
  assert.equal(invalid.status, 400);

  const created = await worker.fetch(apiRequest("/api/Teams", "POST", {
    teamNumber: 2056, name: "OP Robotics", location: "Detroit, MI",
  }), env);
  assert.equal(created.status, 201);
  const team = await created.json();
  assert.equal(created.headers.get("location"), `/api/Teams/${team.id}`);
  assert.deepEqual(team, {
    id: team.id,
    teamNumber: 2056,
    name: "OP Robotics",
    location: "Detroit, MI",
    eventTeams: [],
  });

  const updated = await worker.fetch(apiRequest(`/api/Teams/${team.id}`, "PUT", {
    TeamNumber: 2057, Name: "OP Robotics Updated", Location: "Warren, MI",
  }), env);
  assert.equal(updated.status, 200);
  assert.deepEqual(await updated.json(), {
    id: team.id,
    teamNumber: 2057,
    name: "OP Robotics Updated",
    location: "Warren, MI",
    eventTeams: [],
  });

  const deleted = await worker.fetch(apiRequest(`/api/Teams/${team.id}`, "DELETE"), env);
  assert.equal(deleted.status, 204);
  assert.equal(sqlite.prepare("SELECT Id FROM Teams WHERE Id = ?").get(team.id), undefined);
  const missing = await worker.fetch(apiRequest(`/api/Teams/${team.id}`, "DELETE"), env);
  assert.equal(missing.status, 404);
});

test("direct event-roster edits pause TBA overwrites and enforce duplicate checks", async (t) => {
  const { env, sqlite } = await createFixture(t, 6);

  const added = await worker.fetch(apiRequest("/api/EventTeams", "POST", {
    EventId: 1, TeamId: 1,
  }), env);
  assert.equal(added.status, 200);
  const eventTeam = await added.json();
  assert.deepEqual(eventTeam, { id: eventTeam.id, eventId: 1, teamId: 1 });
  const syncState = sqlite.prepare(`SELECT ManualMode AS manualMode, Revision AS revision
    FROM EventSyncStates WHERE EventId = 1 AND Resource = 'teams'`).get();
  assert.equal(syncState.manualMode, 1);
  assert.equal(syncState.revision, 1);

  const duplicate = await worker.fetch(apiRequest("/api/EventTeams", "POST", {
    EventId: 1, TeamId: 1,
  }), env);
  assert.equal(duplicate.status, 409);

  const removed = await worker.fetch(apiRequest(`/api/EventTeams/${eventTeam.id}`, "DELETE"), env);
  assert.equal(removed.status, 204);
  assert.equal(sqlite.prepare("SELECT Id FROM EventTeams WHERE Id = ?").get(eventTeam.id), undefined);
  assert.equal(sqlite.prepare(`SELECT Revision FROM EventSyncStates
    WHERE EventId = 1 AND Resource = 'teams'`).get().Revision, 2);
});

async function startSelection(env, teamCount = 24) {
  const response = await worker.fetch(apiRequest("/api/AllianceSelection/start", "POST", {
    eventId: 1,
    teamIds: [1, 2, 3, 4, 5, 6, 7, 8],
    rankedTeamIds: Array.from({ length: teamCount }, (_, index) => index + 1),
  }), env);
  return { response, body: await response.json() };
}

async function getSelection(env) {
  const response = await worker.fetch(
    apiRequest("/api/AllianceSelection/event/1"),
    env,
  );
  return { response, body: await response.json() };
}

test("alliance selection validates rankings, persists captains, and matches the API response", async (t) => {
  const { env, sqlite } = await createFixture(t, 120);
  const invalid = await worker.fetch(apiRequest("/api/AllianceSelection/start", "POST", {
    eventId: 1,
    teamIds: [1, 2, 3, 4, 5, 6, 7, 8],
    rankedTeamIds: Array.from({ length: 120 }, (_, index) => index + 1).toReversed(),
  }), env);
  assert.equal(invalid.status, 400);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM AllianceSelections").get().count, 0);

  const { response, body } = await startSelection(env, 120);
  assert.equal(response.status, 201);
  assert.equal(body.eventId, 1);
  assert.equal(body.status, "InProgress");
  assert.equal(body.currentRound, 1);
  assert.equal(body.currentAlliance, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM AllianceRankedTeam").get().count, 120);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM Alliances").get().count, 8);

  const duplicate = await worker.fetch(apiRequest("/api/AllianceSelection/start", "POST", {
    eventId: 1,
    teamIds: [1, 2, 3, 4, 5, 6, 7, 8],
    rankedTeamIds: Array.from({ length: 120 }, (_, index) => index + 1),
  }), env);
  assert.equal(duplicate.status, 409);

  const { response: getResponse, body: selectionBody } = await getSelection(env);
  assert.equal(getResponse.status, 200);
  assert.equal(selectionBody.exists, true);
  assert.equal(selectionBody.selection.alliances.length, 8);
  assert.equal(selectionBody.selection.alliances[0].captainTeamId, 1);
  assert.equal(selectionBody.selection.alliances[7].captainTeamId, 8);
  assert.deepEqual(selectionBody.selection.alliances[0].members, []);
  assert.deepEqual(selectionBody.selection.picks, []);
});

test("picking a later captain promotes captains and undo restores the exact draft state", async (t) => {
  const { env, sqlite } = await createFixture(t);
  const { body: started } = await startSelection(env);

  const pick = await worker.fetch(apiRequest("/api/AllianceSelection/pick", "POST", {
    allianceSelectionId: started.id,
    allianceNumber: 1,
    teamId: 7,
    expectedRound: 1,
    expectedPickCount: 0,
  }), env);
  assert.equal(pick.status, 200);
  assert.deepEqual(await pick.json(), {
    success: true,
    allianceNumber: 1,
    teamId: 7,
    teamNumber: 1007,
    selectionRound: 1,
    selectionOrder: 1,
    status: "InProgress",
    nextRound: 1,
    nextAlliance: 2,
  });
  assert.equal(sqlite.prepare(`SELECT CaptainTeamId AS captain FROM Alliances
    WHERE AllianceSelectionId = ? AND AllianceNumber = 7`).get(started.id).captain, 8);
  assert.equal(sqlite.prepare(`SELECT CaptainTeamId AS captain FROM Alliances
    WHERE AllianceSelectionId = ? AND AllianceNumber = 8`).get(started.id).captain, 9);

  const undo = await worker.fetch(apiRequest("/api/AllianceSelection/undo", "POST", {
    allianceSelectionId: started.id,
  }), env);
  assert.equal(undo.status, 200);
  assert.deepEqual(await undo.json(), { success: true });

  const { body: restored } = await getSelection(env);
  assert.equal(restored.selection.currentRound, 1);
  assert.equal(restored.selection.currentAlliance, 1);
  assert.equal(restored.selection.alliances[6].captainTeamId, 7);
  assert.equal(restored.selection.alliances[7].captainTeamId, 8);
  assert.deepEqual(restored.selection.alliances[0].members, []);
  assert.deepEqual(restored.selection.picks, []);
});

test("declines keep the same turn, stale invitations are rejected, and undo clears the decline", async (t) => {
  const { env } = await createFixture(t);
  const { body: started } = await startSelection(env);

  const declined = await worker.fetch(apiRequest("/api/AllianceSelection/decline", "POST", {
    allianceSelectionId: started.id,
    allianceNumber: 1,
    teamId: 9,
    expectedRound: 1,
    expectedPickCount: 0,
  }), env);
  assert.equal(declined.status, 200);
  const declinedBody = await declined.json();
  assert.equal(declinedBody.result, "Declined");
  assert.equal(declinedBody.nextRound, 1);
  assert.equal(declinedBody.nextAlliance, 1);

  const stale = await worker.fetch(apiRequest("/api/AllianceSelection/decline", "POST", {
    allianceSelectionId: started.id,
    allianceNumber: 1,
    teamId: 10,
    expectedRound: 1,
    expectedPickCount: 0,
  }), env);
  assert.equal(stale.status, 409);

  const undo = await worker.fetch(apiRequest("/api/AllianceSelection/undo", "POST", {
    allianceSelectionId: started.id,
  }), env);
  assert.equal(undo.status, 200);

  const pick = await worker.fetch(apiRequest("/api/AllianceSelection/pick", "POST", {
    allianceSelectionId: started.id,
    allianceNumber: 1,
    teamId: 9,
    expectedRound: 1,
    expectedPickCount: 0,
  }), env);
  assert.equal(pick.status, 200);
});

test("the two-round serpentine draft completes and deletion cascades its saved records", async (t) => {
  const { env, sqlite } = await createFixture(t);
  const { body: started } = await startSelection(env);
  let round = 1;
  let alliance = 1;

  for (let index = 0; index < 16; index++) {
    const response = await worker.fetch(apiRequest("/api/AllianceSelection/pick", "POST", {
      allianceSelectionId: started.id,
      allianceNumber: alliance,
      teamId: index + 9,
      expectedRound: round,
      expectedPickCount: index,
    }), env);
    assert.equal(response.status, 200, `pick ${index + 1} should succeed`);
    const body = await response.json();
    round = body.nextRound;
    alliance = body.nextAlliance;
  }

  const { body: completed } = await getSelection(env);
  assert.equal(completed.selection.status, "Completed");
  assert.ok(completed.selection.completedAt);
  assert.equal(completed.selection.picks.length, 16);
  assert.equal(completed.selection.alliances.reduce((sum, item) => sum + item.members.length, 0), 16);
  assert.deepEqual(
    completed.selection.picks.filter((pick) => pick.round === 2).map((pick) => pick.allianceNumber),
    [8, 7, 6, 5, 4, 3, 2, 1],
  );

  const deleted = await worker.fetch(apiRequest(`/api/AllianceSelection/${started.id}`, "DELETE"), env);
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), {
    success: true,
    message: "Alliance Selection deleted successfully.",
  });
  for (const table of ["AllianceSelections", "AllianceRankedTeam", "Alliances", "AllianceMembers", "AlliancePicks"]) {
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0, `${table} should cascade`);
  }
});

test("alliance selection APIs require a server session and same-origin mutations", async (t) => {
  const { env } = await createFixture(t);
  const unauthenticatedRead = await worker.fetch(apiRequest(
    "/api/AllianceSelection/event/1", "GET", undefined, { authenticated: false },
  ), env);
  assert.equal(unauthenticatedRead.status, 401);

  const crossOriginWrite = await worker.fetch(apiRequest(
    "/api/AllianceSelection/start", "POST", {
      eventId: 1,
      teamIds: [1, 2, 3, 4, 5, 6, 7, 8],
      rankedTeamIds: Array.from({ length: 24 }, (_, index) => index + 1),
    }, { origin: "https://attacker.example" },
  ), env);
  assert.equal(crossOriginWrite.status, 403);

  const unauthenticatedDelete = await worker.fetch(apiRequest(
    "/api/AllianceSelection/1", "DELETE", undefined, { authenticated: false },
  ), env);
  assert.equal(unauthenticatedDelete.status, 401);
});

test("match CRUD preserves schedule revisions and protects scouted match identities", async (t) => {
  const { env, sqlite } = await createFixture(t, 6);
  const match = {
    eventId: 1,
    matchType: "Qualification",
    matchNumber: 1,
    setNumber: 0,
    redTeam1Id: 1,
    redTeam2Id: 2,
    redTeam3Id: 3,
    blueTeam1Id: 4,
    blueTeam2Id: 5,
    blueTeam3Id: 6,
    redScore: 92,
    blueScore: 80,
  };

  const badScores = await worker.fetch(apiRequest("/api/Matches", "POST", {
    ...match,
    blueScore: null,
  }), env);
  assert.equal(badScores.status, 400);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM Matches").get().count, 0);

  const created = await worker.fetch(apiRequest("/api/Matches?revision=0", "POST", match), env);
  assert.equal(created.status, 201);
  const { id } = await created.json();
  assert.equal(created.headers.get("location"), `/api/Matches/${id}`);
  assert.deepEqual({ ...sqlite.prepare(`SELECT EventId AS eventId, MatchType AS matchType,
      MatchNumber AS matchNumber, SetNumber AS setNumber, RedScore AS redScore,
      BlueScore AS blueScore, WinningAlliance AS winningAlliance FROM Matches WHERE Id = ?`).get(id) }, {
    eventId: 1,
    matchType: "Qualification",
    matchNumber: 1,
    setNumber: 0,
    redScore: 92,
    blueScore: 80,
    winningAlliance: "red",
  });
  assert.deepEqual({ ...sqlite.prepare("SELECT Revision AS revision, ManualMode AS manualMode FROM EventSyncStates WHERE EventId = 1 AND Resource = 'matches'").get() }, {
    revision: 1,
    manualMode: 1,
  });

  const duplicate = await worker.fetch(apiRequest("/api/Matches", "POST", match), env);
  assert.equal(duplicate.status, 409);

  const stale = await worker.fetch(apiRequest(`/api/Matches/${id}?revision=0`, "PUT", {
    ...match,
    redScore: 100,
    blueScore: 80,
  }), env);
  assert.equal(stale.status, 409);

  sqlite.prepare(`INSERT INTO GameForms (Id, SeasonId, Name, Description, FormType)
    VALUES (1, 1, 'Match scouting', '', 1)`).run();
  sqlite.prepare(`INSERT INTO GameFormSubmissions (GameFormId, MatchId, EventId, TeamId, SubmittedAt)
    VALUES (1, ?, 1, 1, '2026-09-28T12:00:00.000Z')`).run(id);

  const identityChange = await worker.fetch(apiRequest(`/api/Matches/${id}`, "PUT", {
    ...match,
    matchNumber: 2,
  }), env);
  assert.equal(identityChange.status, 400);
  assert.equal(await identityChange.text(), "This match has scouting submissions. Only its scores can be edited.");

  const scoreEdit = await worker.fetch(apiRequest(`/api/Matches/${id}?Revision=1`, "PUT", {
    ...match,
    redScore: 70,
    blueScore: 80,
  }), env);
  assert.equal(scoreEdit.status, 200);
  assert.deepEqual(await scoreEdit.json(), { id });
  assert.equal(sqlite.prepare("SELECT WinningAlliance FROM Matches WHERE Id = ?").get(id).WinningAlliance, "blue");
  assert.equal(sqlite.prepare("SELECT Revision FROM EventSyncStates WHERE EventId = 1 AND Resource = 'matches'").get().Revision, 2);

  const protectedDelete = await worker.fetch(apiRequest(`/api/Matches/${id}`, "DELETE"), env);
  assert.equal(protectedDelete.status, 400);

  const second = await worker.fetch(apiRequest("/api/Matches", "POST", {
    ...match,
    matchNumber: 2,
    redScore: null,
    blueScore: null,
  }), env);
  assert.equal(second.status, 201);
  const secondId = (await second.json()).id;
  const deleted = await worker.fetch(apiRequest(`/api/Matches/${secondId}`, "DELETE"), env);
  assert.equal(deleted.status, 204);
  assert.equal(sqlite.prepare("SELECT Id FROM Matches WHERE Id = ?").get(secondId), undefined);
  assert.equal(sqlite.prepare("SELECT Revision FROM EventSyncStates WHERE EventId = 1 AND Resource = 'matches'").get().Revision, 4);

  const missing = await worker.fetch(apiRequest(`/api/Matches/${secondId}`, "DELETE"), env);
  assert.equal(missing.status, 404);
});

test("legacy submission creation keeps its API response and saves parent and answers together", async (t) => {
  const { env, sqlite } = await createFixture(t, 7);
  const matchId = Number(sqlite.prepare(`INSERT INTO Matches (EventId, MatchType, MatchNumber, SetNumber,
      RedTeam1Id, RedTeam2Id, RedTeam3Id, BlueTeam1Id, BlueTeam2Id, BlueTeam3Id)
    VALUES (1, 'Qualification', 1, 0, 1, 2, 3, 4, 5, 6)`).run().lastInsertRowid);
  sqlite.prepare(`INSERT INTO GameForms (Id, SeasonId, Name, Description, FormType)
    VALUES (1, 1, 'Match scouting', '', 1)`).run();
  const insertField = sqlite.prepare(`INSERT INTO GameFormFields
    (Id, GameFormId, Question, Description, FieldType, Required, DisplayOrder, IsSystemField, IsAllianceSelectionFilter)
    VALUES (?, 1, ?, '', 0, ?, ?, ?, 0)`);
  insertField.run(11, "Scout Name", 1, 1, 1);
  insertField.run(12, "Defense rating", 1, 2, 0);
  insertField.run(13, "Notes", 0, 3, 0);

  const payload = {
    gameFormId: 1,
    matchId,
    eventId: 1,
    teamId: 1,
    answers: [
      { gameFormFieldId: 11, value: "AB" },
      { GameFormFieldId: 12, Value: "Strong" },
      { gameFormFieldId: 13 },
    ],
  };
  const missingRequired = await worker.fetch(apiRequest("/api/GameFormSubmissions", "POST", {
    ...payload,
    answers: [{ gameFormFieldId: 11, value: "AB" }],
  }), env);
  assert.equal(missingRequired.status, 400);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM GameFormSubmissions").get().count, 0);

  const wrongTeam = await worker.fetch(apiRequest("/api/GameFormSubmissions", "POST", {
    ...payload,
    teamId: 7,
  }), env);
  assert.equal(wrongTeam.status, 400);
  assert.equal(await wrongTeam.text(), "The specified team did not participate in the selected match.");

  sqlite.exec(`CREATE TRIGGER reject_legacy_answer BEFORE INSERT ON GameFormAnswers
    WHEN NEW.Value = 'ROLLBACK-TEST'
    BEGIN SELECT RAISE(ABORT, 'forced answer failure'); END`);
  const failedBatch = await worker.fetch(apiRequest("/api/GameFormSubmissions", "POST", {
    ...payload,
    answers: [
      { gameFormFieldId: 11, value: "AB" },
      { gameFormFieldId: 12, value: "ROLLBACK-TEST" },
    ],
  }), env);
  assert.equal(failedBatch.status, 500);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM GameFormSubmissions").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM GameFormAnswers").get().count, 0);
  sqlite.exec("DROP TRIGGER reject_legacy_answer");

  const created = await worker.fetch(apiRequest("/api/GameFormSubmissions", "POST", payload), env);
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(created.headers.get("location"), `/api/GameFormSubmissions/${body.id}`);
  assert.deepEqual(body, {
    id: body.id,
    gameFormId: 1,
    gameFormName: "Match scouting",
    eventId: 1,
    matchId,
    matchNumber: 1,
    teamId: 1,
    teamNumber: 1001,
    teamName: "Team 1",
    submittedAt: body.submittedAt,
    answers: [
      { fieldId: 11, question: "Scout Name", value: "AB" },
      { fieldId: 12, question: "Defense rating", value: "Strong" },
      { fieldId: 13, question: "Notes", value: "" },
    ],
  });
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM GameFormAnswers WHERE GameFormSubmissionId = ?").get(body.id).count, 3);

  const repeated = await worker.fetch(apiRequest("/api/GameFormSubmissions", "POST", payload), env);
  assert.equal(repeated.status, 201, "the legacy API did not reject duplicate submissions");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM GameFormSubmissions").get().count, 2);
});
