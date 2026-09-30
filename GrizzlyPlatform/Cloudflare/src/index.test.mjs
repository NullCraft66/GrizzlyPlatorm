import assert from "node:assert/strict";
import { createHash, pbkdf2Sync } from "node:crypto";
import test from "node:test";
import { verifyAspNetIdentityPassword } from "./auth.ts";
import worker from "./index.ts";

const TEST_SESSION_TOKEN = "A".repeat(43);
const TEST_SESSION_HASH = createHash("sha256").update(TEST_SESSION_TOKEN).digest("hex");
const TEST_SESSION_USER = {
  id: 1,
  username: "scout",
  displayName: "Test Scout",
  role: "Scout",
  isActive: 1,
};

function authenticatedRequest(url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cookie", `__Host-grizzly_session=${TEST_SESSION_TOKEN}`);
  return new Request(url, { ...init, headers });
}

function authenticatedJsonRequest(url, method, body) {
  return authenticatedRequest(url, {
    method,
    headers: {
      Origin: "https://grizzly-platform.test",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function activeConfigurationWriteRequest(body, path = "/api/ActiveScoutingConfiguration/devices") {
  return authenticatedJsonRequest(`https://grizzly-platform.test${path}`, "PUT", body);
}

function createIdentityV3Hash(password, salt = Buffer.from("grizzly-test-salt"), iterations = 100_000) {
  const subkey = pbkdf2Sync(password, salt, iterations, 32, "sha512");
  const bytes = Buffer.alloc(13 + salt.length + subkey.length);
  bytes[0] = 1;
  bytes.writeUInt32BE(2, 1);
  bytes.writeUInt32BE(iterations, 5);
  bytes.writeUInt32BE(salt.length, 9);
  salt.copy(bytes, 13);
  subkey.copy(bytes, 13 + salt.length);
  return bytes.toString("base64");
}

function createIdentityV2Hash(password, salt = Buffer.from("grizzly-v2-salt!")) {
  const subkey = pbkdf2Sync(password, salt, 1_000, 32, "sha1");
  const bytes = Buffer.alloc(1 + salt.length + subkey.length);
  bytes[0] = 0;
  salt.copy(bytes, 1);
  subkey.copy(bytes, 1 + salt.length);
  return bytes.toString("base64");
}

function createDatabase(resolve) {
  const statements = [];
  const db = {
    withSession() {
      return this;
    },
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          this.values = values;
          return this;
        },
        async all() {
          statements.push({ sql, values: this.values, operation: "all" });
          return { results: await resolve(sql, this.values, "all") };
        },
        async first() {
          statements.push({ sql, values: this.values, operation: "first" });
          return await resolve(sql, this.values, "first");
        },
        async run() {
          statements.push({ sql, values: this.values, operation: "run" });
          return await resolve(sql, this.values, "run") ?? { results: [] };
        },
      };
      return statement;
    },
    async batch(batchStatements) {
      const results = [];
      for (const statement of batchStatements) {
        results.push(await statement.run());
      }
      return results;
    },
  };
  return { db, statements };
}

function createRateLimiter(limit) {
  const counts = new Map();
  return {
    counts,
    binding: {
      async limit({ key }) {
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return { success: count <= limit };
      },
    },
  };
}

function createEnv(resolve = () => [], { sessionUser = TEST_SESSION_USER, queue } = {}) {
  const calls = [];
  const loginRateLimiter = createRateLimiter(10);
  const sessions = new Map([[TEST_SESSION_HASH, {
    user: sessionUser,
    expiresAt: Number.MAX_SAFE_INTEGER,
  }]]);
  const usersById = new Map();
  const database = createDatabase(async (sql, values, operation) => {
    if (sql.startsWith("INSERT INTO AuthSessions")) {
      const user = usersById.get(values[1]);
      if (user) sessions.set(values[0], { user, expiresAt: values[3] });
      return { results: [] };
    }

    if (sql.startsWith("DELETE FROM AuthSessions WHERE TokenHash = ?")) {
      sessions.delete(values[0]);
      return { results: [] };
    }

    if (sql.includes("FROM AuthSessions")) {
      const record = sessions.get(values[0]);
      return record && (values.length < 2 || record.expiresAt > values[1])
        ? record.user
        : null;
    }

    const result = await resolve(sql, values, operation);
    if (sql.includes("FROM Users") && operation === "first" && result) {
      usersById.set(result.id, result);
    }
    return result;
  });
  const env = {
    DB: database.db,
    EVENT_SYNC_QUEUE: queue ?? { async send() {} },
    LOGIN_RATE_LIMITER: loginRateLimiter.binding,
    ASSETS: {
      async fetch(request) {
        calls.push(request);
        return new Response("GrizzlyPlatform test asset", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      },
    },
  };

  return { env, calls, statements: database.statements, loginRateLimitCounts: loginRateLimiter.counts };
}

const TEST_ADMIN_USER = {
  id: 2,
  username: "admin",
  displayName: "Test Admin",
  role: "Admin",
  isActive: 1,
};
const TEST_NEXUS_ENCRYPTION_KEY = Buffer.alloc(32, 0x5a).toString("base64");

test("forwards browser routes to static assets", async () => {
  const { env, calls } = createEnv();
  const request = new Request("https://grizzly-platform.test/events");

  const response = await worker.fetch(request, env);

  assert.equal(response.status, 200);
  assert.match(await response.text(), /GrizzlyPlatform/);
  assert.deepEqual(calls, [request]);
});

test("keeps unported API routes separate from app pages", async () => {
  const { env, calls } = createEnv();

  const response = await worker.fetch(
    authenticatedRequest("https://grizzly-platform.test/api/nexus/unimplemented"),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "backend_migration_incomplete");
  assert.equal(calls.length, 0);
});

test("stores the Nexus key encrypted and serves the existing settings and event APIs", async (t) => {
  const nexusKey = "nexus-test-secret-not-for-d1";
  let storedSettings = null;
  const { env, statements } = createEnv((sql, values, operation) => {
    if (sql.includes("FROM NexusSettings")) return storedSettings;
    if (sql.startsWith("INSERT INTO NexusSettings") && operation === "run") {
      storedSettings = {
        apiKeyCiphertext: values[0],
        apiKeyIv: values[1],
        eventKey: values[2],
        enabled: values[3],
      };
    }
    return null;
  }, { sessionUser: TEST_ADMIN_USER });
  env.NEXUS_SETTINGS_ENCRYPTION_KEY = TEST_NEXUS_ENCRYPTION_KEY;
  const upstreamRequests = [];
  t.mock.method(globalThis, "fetch", async (input, init) => {
    const url = new URL(input);
    upstreamRequests.push({ url: url.href, apiKey: new Headers(init.headers).get("Nexus-Api-Key") });
    if (url.pathname.endsWith("/events")) {
      return Response.json({ "2027miket": { name: "Michigan State Championship", start: 1800000000000, end: 1800200000000 } });
    }
    if (url.pathname.endsWith("/pits")) return Response.json({ "66": "A1" });
    if (url.pathname.endsWith("/map")) return Response.json({ pits: { A1: { team: "66" } } });
    return Response.json({ eventKey: "2027miket", nowQueuing: "Qualification 1", matches: [{ label: "Qualification 1" }] });
  });

  const save = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/nexus/settings",
    "PUT",
    { ApiKey: nexusKey, EventKey: " 2027miket ", Enabled: true },
  ), env);
  assert.equal(save.status, 200);
  assert.deepEqual(await save.json(), { eventKey: "2027miket", enabled: true, configured: true });
  assert.notEqual(storedSettings.apiKeyCiphertext, nexusKey);
  assert.ok(!statements.find((statement) => statement.sql.startsWith("INSERT INTO NexusSettings")).values.includes(nexusKey));

  const settingsResponse = await worker.fetch(authenticatedRequest("https://grizzly-platform.test/api/nexus/settings"), env);
  assert.deepEqual(await settingsResponse.json(), { eventKey: "2027miket", enabled: true, configured: true });
  const statusResponse = await worker.fetch(authenticatedRequest("https://grizzly-platform.test/api/nexus/status"), env);
  assert.deepEqual(await statusResponse.json(), { configured: true });
  assert.equal(statusResponse.headers.get("cache-control"), "no-store");

  const eventsResponse = await worker.fetch(authenticatedRequest("https://grizzly-platform.test/api/nexus/settings/events"), env);
  assert.deepEqual(await eventsResponse.json(), {
    "2027miket": { name: "Michigan State Championship", start: 1800000000000, end: 1800200000000 },
  });

  const eventResponse = await worker.fetch(authenticatedRequest("https://grizzly-platform.test/api/nexus/event/2027miket"), env);
  assert.equal(eventResponse.status, 200);
  assert.equal((await eventResponse.json()).nowQueuing, "Qualification 1");

  const mixedCaseResponse = await worker.fetch(authenticatedRequest("https://grizzly-platform.test/api/nexus/event/DemoCaseKey"), env);
  assert.equal(mixedCaseResponse.status, 200);
  assert.ok(upstreamRequests.some((request) => request.url.endsWith("/event/DemoCaseKey")));

  const pitsResponse = await worker.fetch(authenticatedRequest("https://grizzly-platform.test/api/nexus/event/2027miket/pits"), env);
  assert.deepEqual(await pitsResponse.json(), { "66": "A1" });

  const mapResponse = await worker.fetch(authenticatedRequest("https://grizzly-platform.test/api/nexus/event/2027miket/map"), env);
  assert.deepEqual(await mapResponse.json(), { pits: { A1: { team: "66" } } });

  const snapshotResponse = await worker.fetch(authenticatedRequest("https://grizzly-platform.test/api/nexus/snapshot"), env);
  const snapshot = await snapshotResponse.json();
  assert.equal(snapshot.connected, true);
  assert.equal(snapshot.eventKey, "2027miket");
  assert.equal(snapshot.matches[0].label, "Qualification 1");
  assert.ok(snapshot.refreshedAt);
  assert.ok(upstreamRequests.length >= 7);
  assert.ok(upstreamRequests.every((request) => request.apiKey === nexusKey));
});

test("restricts Nexus secret management to administrators and rejects missing encryption secrets", async () => {
  const { env: scoutEnv } = createEnv(() => null);
  const denied = await worker.fetch(authenticatedRequest("https://grizzly-platform.test/api/nexus/settings"), scoutEnv);
  assert.equal(denied.status, 403);

  const { env: adminEnv } = createEnv(() => null, { sessionUser: TEST_ADMIN_USER });
  const missingSecret = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/nexus/settings",
    "PUT",
    { apiKey: "secret", eventKey: "2027miket", enabled: true },
  ), adminEnv);
  assert.equal(missingSecret.status, 503);
});

test("provides hosted pairing details instead of local-network discovery", async () => {
  const { env } = createEnv();
  const response = await worker.fetch(authenticatedRequest(
    "https://grizzly-platform.example/api/discovery/pairing",
  ), env);
  const pairing = await response.json();

  assert.equal(response.status, 200);
  assert.equal(pairing.name, "GrizzlyPlatform");
  assert.equal(pairing.address, "https://grizzly-platform.example/api/");
  assert.equal(pairing.localNetwork, false);
  assert.equal(pairing.mdns, "");
  assert.match(pairing.qr, /^grizzly:\/\/pair\?address=/);
  assert.equal(pairing.id.length, 12);
});

test("reads seasons in the same order and shape as the ASP.NET API", async () => {
  const { env, statements } = createEnv(() => [
    { id: 2026, year: 2026, name: "Rebuilt" },
    { id: 2025, year: 2025, name: "Reefscape" },
  ]);

  const response = await worker.fetch(
    new Request("https://grizzly-platform.test/api/Seasons"),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [
    { id: 2026, year: 2026, name: "Rebuilt" },
    { id: 2025, year: 2025, name: "Reefscape" },
  ]);
  assert.match(statements[0].sql, /ORDER BY Year DESC/);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("returns events with the included season and complete event fields", async () => {
  const { env } = createEnv(() => [{
    id: 7,
    seasonId: 4,
    name: "District Event",
    location: "Detroit",
    blueAllianceKey: "2026miket",
    eventType: "Competition",
    allianceCount: 8,
    startDate: "2026-03-12T00:00:00",
    endDate: "2026-03-14T00:00:00",
    nexusEventKey: "event-7",
    joinedSeasonId: 4,
    seasonYear: 2026,
    seasonName: "Rebuilt",
  }]);

  const response = await worker.fetch(
    new Request("https://grizzly-platform.test/api/events"),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{
    id: 7,
    seasonId: 4,
    name: "District Event",
    location: "Detroit",
    season: { id: 4, year: 2026, name: "Rebuilt" },
    eventTeams: [],
    blueAllianceKey: "2026miket",
    eventType: "Competition",
    allianceCount: 8,
    startDate: "2026-03-12T00:00:00",
    endDate: "2026-03-14T00:00:00",
    nexusEventKey: "event-7",
  }]);
});

test("creates a season with the current ASP.NET response shape", async () => {
  const { env, statements } = createEnv((sql, values) => sql.startsWith("INSERT INTO Seasons")
    ? { id: 22, year: values[0], name: values[1] }
    : null);

  const response = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/Seasons",
    "POST",
    { year: 2027, name: "Rebuilt" },
  ), env);

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("location"), "/api/Seasons/22");
  assert.deepEqual(await response.json(), { id: 22, year: 2027, name: "Rebuilt" });
  const insert = statements.find((statement) => statement.sql.startsWith("INSERT INTO Seasons"));
  assert.deepEqual(insert.values, [2027, "Rebuilt"]);
});

test("rejects invalid season and event creation without writing rows", async () => {
  const { env, statements } = createEnv(() => null);

  const seasonResponse = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/Seasons",
    "POST",
    { year: 0, name: " " },
  ), env);
  const eventResponse = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/Events",
    "POST",
    { seasonId: 999, name: "Event", location: "Detroit" },
  ), env);

  assert.equal(seasonResponse.status, 400);
  assert.equal(eventResponse.status, 400);
  assert.ok(!statements.some((statement) => statement.sql.startsWith("INSERT INTO Seasons")));
  assert.ok(!statements.some((statement) => statement.sql.startsWith("INSERT INTO Events")));
});

test("creates an event with its included season and existing API defaults", async () => {
  const eventRow = {
    id: 42,
    seasonId: 4,
    name: "District Event",
    location: "Detroit",
    blueAllianceKey: "2027miket",
    eventType: "Competition",
    allianceCount: 8,
    startDate: "2027-03-12T00:00:00",
    endDate: "2027-03-14T00:00:00",
    nexusEventKey: null,
    joinedSeasonId: 4,
    seasonYear: 2027,
    seasonName: "Rebuilt",
  };
  const { env, statements } = createEnv((sql, values) => {
    if (sql.startsWith("SELECT Id AS id FROM Seasons")) return { id: 4 };
    if (sql.startsWith("INSERT INTO Events")) return { id: 42 };
    if (sql.includes("FROM Events e")) return eventRow;
    return null;
  });

  const response = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/Events",
    "POST",
    {
      seasonId: 4,
      name: "District Event",
      location: "Detroit",
      blueAllianceKey: "2027miket",
      startDate: eventRow.startDate,
      endDate: eventRow.endDate,
    },
  ), env);

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("location"), "/api/Events/42");
  assert.deepEqual(await response.json(), {
    id: 42,
    seasonId: 4,
    name: "District Event",
    location: "Detroit",
    season: { id: 4, year: 2027, name: "Rebuilt" },
    eventTeams: [],
    blueAllianceKey: "2027miket",
    eventType: "Competition",
    allianceCount: 8,
    startDate: eventRow.startDate,
    endDate: eventRow.endDate,
    nexusEventKey: null,
  });
  const insert = statements.find((statement) => statement.sql.startsWith("INSERT INTO Events"));
  assert.deepEqual(insert.values, [4, "District Event", "Detroit", "2027miket", "Competition", 8,
    eventRow.startDate, eventRow.endDate, null]);
});

test("updates an event and applies the existing alliance-count fallback", async () => {
  const original = {
    id: 42, seasonId: 4, name: "Old Name", location: "Detroit", blueAllianceKey: null,
    eventType: "Competition", allianceCount: 8, startDate: null, endDate: null,
    nexusEventKey: "nexus-42", joinedSeasonId: 4, seasonYear: 2027, seasonName: "Rebuilt",
  };
  const updated = {
    ...original, name: "Updated Event", location: "Grand Rapids", allianceCount: 8,
    startDate: "2027-03-13T09:00:00", endDate: "2027-03-15T17:00:00",
  };
  let eventReads = 0;
  const { env, statements } = createEnv((sql) => {
    if (sql.startsWith("SELECT Id AS id FROM Seasons")) return { id: 4 };
    if (sql.includes("FROM Events e")) return ++eventReads === 1 ? original : updated;
    return null;
  });

  const response = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/Events/42",
    "PUT",
    {
      seasonId: 4,
      name: "Updated Event",
      location: "Grand Rapids",
      allianceCount: 99,
      startDate: updated.startDate,
      endDate: updated.endDate,
    },
  ), env);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).allianceCount, 8);
  assert.equal(updated.nexusEventKey, "nexus-42");
  const update = statements.find((statement) => statement.sql.startsWith("UPDATE Events"));
  assert.deepEqual(update.values, ["Updated Event", "Grand Rapids", 4, null, "Competition", 8,
    updated.startDate, updated.endDate, 42]);
});

test("deletes seasons and events with no-content success responses", async () => {
  const { env, statements } = createEnv((sql) => sql.startsWith("DELETE FROM Seasons")
    || sql.startsWith("DELETE FROM Events")
    ? { id: 9 }
    : null);

  const seasonResponse = await worker.fetch(authenticatedRequest(
    "https://grizzly-platform.test/api/Seasons/4",
    { method: "DELETE", headers: { Origin: "https://grizzly-platform.test" } },
  ), env);
  const eventResponse = await worker.fetch(authenticatedRequest(
    "https://grizzly-platform.test/api/Events/9",
    { method: "DELETE", headers: { Origin: "https://grizzly-platform.test" } },
  ), env);

  assert.equal(seasonResponse.status, 204);
  assert.equal(eventResponse.status, 204);
  assert.ok(statements.some((statement) => statement.sql.startsWith("DELETE FROM Seasons")));
  assert.ok(statements.some((statement) => statement.sql.startsWith("DELETE FROM Events")));
});

test("finds a scouting team by team number", async () => {
  const { env, statements } = createEnv((sql) => sql.includes("FROM Teams")
    ? { id: 8, teamNumber: 2056, name: "RoboBulls", location: "Michigan" }
    : null);

  const response = await worker.fetch(
    authenticatedRequest("https://grizzly-platform.test/api/Teams/number/2056"),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 8,
    teamNumber: 2056,
    name: "RoboBulls",
    location: "Michigan",
    eventTeams: [],
  });
  const teamQuery = statements.find((statement) => statement.sql.includes("FROM Teams"));
  assert.deepEqual(teamQuery.values, [2056]);
});

test("returns an event roster with its nested team", async () => {
  const { env, statements } = createEnv((sql) => sql.includes("FROM EventTeams")
    ? [{
      id: 11,
      eventId: 7,
      teamId: 8,
      eventName: "District Event",
      eventLocation: "Detroit",
      seasonId: 4,
      seasonYear: 2026,
      seasonName: "Rebuilt",
      teamNumber: 2056,
      teamName: "RoboBulls",
      teamLocation: "Michigan",
    }]
    : []);

  const response = await worker.fetch(
    authenticatedRequest("https://grizzly-platform.test/api/EventTeams/event/7"),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{
    id: 11,
    eventId: 7,
    teamId: 8,
    team: { id: 8, teamNumber: 2056, name: "RoboBulls", location: "Michigan" },
  }]);
  const eventTeamQuery = statements.find((statement) => statement.sql.includes("FROM EventTeams"));
  assert.deepEqual(eventTeamQuery.values, [7]);
});

test("returns matches with the nested alliance teams in competition order", async () => {
  const row = {
    id: 30,
    eventId: 7,
    matchType: "Qualification",
    matchNumber: 1,
    setNumber: 1,
    redScore: 81,
    blueScore: 74,
    winningAlliance: "red",
  };
  for (const [side, slots] of Object.entries({ red: [8, 9, 10], blue: [11, 12, 13] })) {
    slots.forEach((teamId, index) => {
      const slot = `${side}Team${index + 1}`;
      row[`${slot}Id`] = teamId;
      row[`${slot}Number`] = 2000 + teamId;
      row[`${slot}Name`] = `Team ${teamId}`;
    });
  }
  const { env, statements } = createEnv((sql) => sql.includes("FROM Matches") ? [row] : []);

  const response = await worker.fetch(
    authenticatedRequest("https://grizzly-platform.test/api/Matches/event/7"),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{
    id: 30,
    eventId: 7,
    matchType: "Qualification",
    matchNumber: 1,
    setNumber: 1,
    redScore: 81,
    blueScore: 74,
    winningAlliance: "red",
    redTeam1: { id: 8, teamNumber: 2008, name: "Team 8" },
    redTeam2: { id: 9, teamNumber: 2009, name: "Team 9" },
    redTeam3: { id: 10, teamNumber: 2010, name: "Team 10" },
    blueTeam1: { id: 11, teamNumber: 2011, name: "Team 11" },
    blueTeam2: { id: 12, teamNumber: 2012, name: "Team 12" },
    blueTeam3: { id: 13, teamNumber: 2013, name: "Team 13" },
  }]);
  const matchQuery = statements.find((statement) => statement.sql.includes("FROM Matches"));
  assert.deepEqual(matchQuery.values, [7]);
  assert.match(matchQuery.sql, /WHEN 'Qualification' THEN 1/);
});

test("returns dynamic game forms with ordered nested fields and options", async () => {
  const { env, statements } = createEnv((sql) => {
    if (sql.includes("FROM GameForms")) {
      return [{ id: 3, seasonId: 4, name: "Match scouting", description: "Match form", formType: 1 }];
    }
    if (sql.includes("FROM GameFormFields")) {
      return [
        {
          id: 21,
          gameFormId: 3,
          question: "Scout Name",
          description: "Scout initials",
          fieldType: 0,
          required: 1,
          displayOrder: 1,
          isSystemField: 1,
          isAllianceSelectionFilter: 0,
        },
        {
          id: 22,
          gameFormId: 3,
          question: "Starting position",
          description: "",
          fieldType: 2,
          required: 0,
          displayOrder: 2,
          isSystemField: 0,
          isAllianceSelectionFilter: 1,
        },
      ];
    }
    if (sql.includes("FROM GameFormFieldOptions")) {
      return [
        { id: 40, gameFormFieldId: 22, value: "Left", displayOrder: 1 },
        { id: 41, gameFormFieldId: 22, value: "Right", displayOrder: 2 },
      ];
    }
    return [];
  });

  const response = await worker.fetch(
    authenticatedRequest("https://grizzly-platform.test/api/GameForms"),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{
    id: 3,
    seasonId: 4,
    name: "Match scouting",
    description: "Match form",
    formType: 1,
    fields: [
      {
        id: 21,
        question: "Scout Name",
        description: "Scout initials",
        fieldType: 0,
        required: true,
        displayOrder: 1,
        isSystemField: true,
        isAllianceSelectionFilter: false,
        options: [],
      },
      {
        id: 22,
        question: "Starting position",
        description: "",
        fieldType: 2,
        required: false,
        displayOrder: 2,
        isSystemField: false,
        isAllianceSelectionFilter: true,
        options: [
          { id: 40, value: "Left", displayOrder: 1 },
          { id: 41, value: "Right", displayOrder: 2 },
        ],
      },
    ],
  }]);
  const gameFormQueries = statements.filter((statement) => !statement.sql.includes("FROM AuthSessions"));
  assert.deepEqual(gameFormQueries.map((statement) => statement.operation), ["all", "all", "all"]);
  assert.deepEqual(gameFormQueries[1].values, [3]);
  assert.deepEqual(gameFormQueries[2].values, [21, 22]);
});

test("creates pit and match forms with their required system fields", async (t) => {
  for (const [formType, expectedQuestions] of [
    [0, ["Scout Name", "Team Number", "Team Name"]],
    [1, ["Scout Name", "Match Number", "Team Number"]],
  ]) {
    await t.test(formType === 0 ? "pit form" : "match form", async () => {
      const { env, statements } = createEnv((sql, values) => {
        if (sql.includes("FROM GameForms") && sql.includes("WHERE SeasonId = ?")) return null;
        if (sql.includes("FROM Seasons WHERE Id = ?")) return { id: values[0] };
        if (sql.startsWith("INSERT INTO GameForms")) {
          return { meta: { last_row_id: 55 }, results: [] };
        }
        return { meta: { changes: 1 }, results: [] };
      });

      const response = await worker.fetch(authenticatedJsonRequest(
        "https://grizzly-platform.test/api/GameForms",
        "POST",
        {
          seasonId: 4,
          name: formType === 0 ? "Pit scouting" : "Match scouting",
          description: "Created in the desktop UI",
          formType,
          fields: [],
        },
      ), env);

      assert.equal(response.status, 201);
      assert.equal(response.headers.get("location"), "/api/GameForms/55");
      assert.deepEqual(await response.json(), {
        id: 55,
        seasonId: 4,
        name: formType === 0 ? "Pit scouting" : "Match scouting",
        description: "Created in the desktop UI",
        formType,
      });
      const systemFields = statements.find(({ sql }) =>
        sql.startsWith("INSERT INTO GameFormFields"));
      assert.ok(systemFields);
      assert.match(systemFields.sql, /UNION ALL/);
      assert.deepEqual(systemFields.values.filter((_, index) => index % 4 === 0), expectedQuestions);
    });
  }
});

test("validates game-form season and duplicate-name rules before inserting", async (t) => {
  await t.test("unknown season", async () => {
    const { env, statements } = createEnv((sql) => {
      if (sql.includes("FROM GameForms") && sql.includes("WHERE SeasonId = ?")) return null;
      if (sql.includes("FROM Seasons WHERE Id = ?")) return null;
      return [];
    });
    const response = await worker.fetch(authenticatedJsonRequest(
      "https://grizzly-platform.test/api/GameForms", "POST",
      { seasonId: 99, name: "Pit", description: "", formType: 0 },
    ), env);
    assert.equal(response.status, 400);
    assert.match(await response.text(), /season does not exist/i);
    assert.equal(statements.some(({ sql }) => sql.startsWith("INSERT INTO GameForms")), false);
  });

  await t.test("duplicate name and type in a season", async () => {
    const { env, statements } = createEnv((sql) => {
      if (sql.includes("FROM GameForms") && sql.includes("WHERE SeasonId = ?")) return { id: 12 };
      return [];
    });
    const response = await worker.fetch(authenticatedJsonRequest(
      "https://grizzly-platform.test/api/GameForms", "POST",
      { seasonId: 4, name: "Pit", description: "", formType: 0 },
    ), env);
    assert.equal(response.status, 409);
    assert.equal(statements.some(({ sql }) => sql.startsWith("INSERT INTO GameForms")), false);
  });
});

test("updates form metadata without replacing its existing fields", async () => {
  const { env, statements } = createEnv((sql, values) => {
    if (sql.includes("FROM GameForms") && sql.includes("WHERE Id = ?")) {
      return { id: values[0], seasonId: 4, name: "Old name", description: "Old", formType: 0 };
    }
    if (sql.includes("FROM GameForms") && sql.includes("WHERE Id <> ?")) return null;
    if (sql.includes("FROM Seasons WHERE Id = ?")) return { id: values[0] };
    if (sql.startsWith("UPDATE GameForms")) {
      return { id: 12, seasonId: 4, name: "New name", description: "Updated", formType: 1 };
    }
    return [];
  });

  const response = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/GameForms/12", "PUT",
    { seasonId: 4, name: "New name", description: "Updated", formType: 1 },
  ), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 12,
    seasonId: 4,
    name: "New name",
    description: "Updated",
    formType: 1,
  });
  assert.equal(statements.some(({ sql }) => sql.startsWith("DELETE FROM GameFormFields")), false);
});

test("creates custom fields and forces IsSystemField off", async () => {
  const { env, statements } = createEnv((sql, values) => {
    if (sql.includes("FROM GameForms WHERE Id = ?")) return { id: 4 };
    if (sql.startsWith("INSERT INTO GameFormFields")) return { meta: { last_row_id: 66 }, results: [] };
    if (sql.includes("FROM GameFormFields WHERE Id = ?")) {
      return {
        id: 66,
        gameFormId: 4,
        question: "Starting position",
        description: "",
        fieldType: 3,
        required: 1,
        displayOrder: 4,
        isSystemField: 0,
        isAllianceSelectionFilter: 1,
      };
    }
    if (sql.includes("FROM GameFormFieldOptions")) return [];
    return [];
  });

  const response = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/GameForms/4/fields", "POST",
    {
      gameFormId: 4,
      question: "Starting position",
      description: "",
      fieldType: 3,
      required: true,
      displayOrder: 4,
      isSystemField: true,
      isAllianceSelectionFilter: true,
    },
  ), env);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).isSystemField, false);
  const insert = statements.find(({ sql }) => sql.startsWith("INSERT INTO GameFormFields"));
  assert.match(insert.sql, /IsSystemField, IsAllianceSelectionFilter\)[\s\S]*VALUES \(\?, \?, \?, \?, \?, \?, 0, \?\)/);
  assert.deepEqual(insert.values, [4, "Starting position", "", 3, 1, 4, 1]);
});

test("updates field options in place, drops removed options, and protects system fields", async (t) => {
  const fieldRow = {
    id: 22,
    gameFormId: 3,
    question: "Starting position",
    description: "",
    fieldType: 3,
    required: 0,
    displayOrder: 2,
    isSystemField: 0,
    isAllianceSelectionFilter: 0,
  };
  const { env, statements } = createEnv((sql) => {
    if (sql.includes("FROM GameFormFields WHERE Id = ?")) return fieldRow;
    if (sql.includes("FROM GameFormFieldOptions")) return [];
    return [];
  });

  const response = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/GameForms/fields/22", "PUT",
    {
      question: "Starting position",
      description: "Choose one",
      fieldType: 3,
      required: true,
      displayOrder: 2,
      isAllianceSelectionFilter: true,
      options: [
        { id: 17, value: "Left", displayOrder: 1 },
        { id: 0, value: "Center", displayOrder: 2 },
      ],
    },
  ), env);

  assert.equal(response.status, 200);
  const writes = statements.filter(({ operation }) => operation === "run");
  assert.match(writes[0].sql, /^UPDATE GameFormFields/);
  assert.match(writes[1].sql, /DELETE FROM GameFormFieldOptions[\s\S]*NOT IN \(\?\)/);
  assert.match(writes[2].sql, /UPDATE GameFormFieldOptions[\s\S]*WHERE Id = \? AND GameFormFieldId = \?/);
  assert.deepEqual(writes[2].values, ["Left", 1, 17, 22]);
  assert.match(writes[3].sql, /^INSERT INTO GameFormFieldOptions/);

  await t.test("system fields cannot be edited or deleted", async () => {
    const protectedEnv = createEnv((sql) => {
      if (sql.includes("FROM GameFormFields WHERE Id = ?")) return { ...fieldRow, isSystemField: 1 };
      return [];
    });
    const update = await worker.fetch(authenticatedJsonRequest(
      "https://grizzly-platform.test/api/GameForms/fields/22", "PUT",
      { question: "Changed", fieldType: 0, required: false, displayOrder: 1, options: [] },
    ), protectedEnv.env);
    const deletion = await worker.fetch(authenticatedRequest(
      "https://grizzly-platform.test/api/GameForms/fields/22",
      { method: "DELETE", headers: { Origin: "https://grizzly-platform.test" } },
    ), protectedEnv.env);
    assert.equal(update.status, 400);
    assert.equal(deletion.status, 400);
    assert.equal(protectedEnv.statements.some(({ operation }) => operation === "run"), false);
  });
});

test("adds only valid dropdown and multi-select options", async (t) => {
  await t.test("creates an option for a dropdown", async () => {
    const { env } = createEnv((sql, values) => {
      if (sql.includes("FROM GameFormFields WHERE Id = ?")) {
        return { id: values[0], gameFormId: 4, fieldType: 3 };
      }
      if (sql.startsWith("INSERT INTO GameFormFieldOptions")) {
        return { id: 80, gameFormFieldId: 44, value: "Left", displayOrder: 1 };
      }
      return [];
    });
    const response = await worker.fetch(authenticatedJsonRequest(
      "https://grizzly-platform.test/api/GameForms/fields/44/options", "POST",
      { gameFormFieldId: 44, value: "Left", displayOrder: 1 },
    ), env);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      id: 80, gameFormFieldId: 44, value: "Left", displayOrder: 1,
    });
  });

  await t.test("rejects options on text fields", async () => {
    const { env, statements } = createEnv((sql, values) =>
      sql.includes("FROM GameFormFields WHERE Id = ?")
        ? { id: values[0], gameFormId: 4, fieldType: 0 }
        : [],
    );
    const response = await worker.fetch(authenticatedJsonRequest(
      "https://grizzly-platform.test/api/GameForms/fields/44/options", "POST",
      { gameFormFieldId: 44, value: "Left", displayOrder: 1 },
    ), env);
    assert.equal(response.status, 400);
    assert.equal(statements.some(({ sql }) => sql.startsWith("INSERT INTO GameFormFieldOptions")), false);
  });
});

test("deletes forms and options with not-found and no-content semantics", async (t) => {
  await t.test("existing form", async () => {
    const { env } = createEnv((sql) =>
      sql.startsWith("DELETE FROM GameForms") ? { id: 8 } : [],
    );
    const response = await worker.fetch(authenticatedRequest(
      "https://grizzly-platform.test/api/GameForms/8",
      { method: "DELETE", headers: { Origin: "https://grizzly-platform.test" } },
    ), env);
    assert.equal(response.status, 204);
  });

  await t.test("missing form", async () => {
    const { env } = createEnv(() => null);
    const response = await worker.fetch(authenticatedRequest(
      "https://grizzly-platform.test/api/GameForms/8",
      { method: "DELETE", headers: { Origin: "https://grizzly-platform.test" } },
    ), env);
    assert.equal(response.status, 404);
  });

  await t.test("existing option", async () => {
    const { env } = createEnv((sql) =>
      sql.startsWith("DELETE FROM GameFormFieldOptions") ? { id: 6 } : [],
    );
    const response = await worker.fetch(authenticatedRequest(
      "https://grizzly-platform.test/api/GameForms/fields/options/6",
      { method: "DELETE", headers: { Origin: "https://grizzly-platform.test" } },
    ), env);
    assert.equal(response.status, 204);
  });
});

test("returns the default device configuration when none has been saved", async () => {
  const { env } = createEnv(() => null);

  const response = await worker.fetch(
    authenticatedRequest("https://grizzly-platform.test/api/ActiveScoutingConfiguration"),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 0,
    activePitFormId: null,
    activeMatchFormId: null,
    activeSeasonId: null,
    activeEventId: null,
  });
});

test("saves device defaults after validating season, event, and form references", async () => {
  const savedConfiguration = {
    id: 4,
    activePitFormId: 31,
    activeMatchFormId: 41,
    activeSeasonId: 2026,
    activeEventId: 12,
  };
  let insertedValues;
  const { env, statements } = createEnv((sql, values) => {
    if (sql.includes("FROM ActiveScoutingConfigurations")) return null;
    if (sql.includes("FROM Seasons WHERE Id = ?")) return { id: values[0] };
    if (sql.includes("FROM Events WHERE Id = ? AND SeasonId = ?")) {
      return values[0] === 12 && values[1] === 2026 ? { id: 12 } : null;
    }
    if (sql.includes("FROM GameForms") && sql.includes("WHERE Id = ?")) {
      const formType = values[0] === 31 ? 0 : 1;
      return { id: values[0], seasonId: 2026, formType };
    }
    if (sql.startsWith("INSERT INTO ActiveScoutingConfigurations")) {
      insertedValues = values;
      return savedConfiguration;
    }
    return null;
  });

  const response = await worker.fetch(activeConfigurationWriteRequest({
    activePitFormId: 31,
    activeMatchFormId: 41,
    activeSeasonId: 2026,
    activeEventId: 12,
  }), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), savedConfiguration);
  assert.deepEqual(insertedValues, [31, 41, 2026, 12]);
  assert.equal(statements.filter(({ sql }) => sql.startsWith("INSERT INTO ActiveScoutingConfigurations")).length, 1);
});

test("changing active forms preserves the saved device season and event", async () => {
  const existingConfiguration = {
    id: 5,
    activePitFormId: 30,
    activeMatchFormId: null,
    activeSeasonId: 2026,
    activeEventId: 12,
  };
  let updateValues;
  const { env } = createEnv((sql, values) => {
    if (sql.includes("FROM ActiveScoutingConfigurations")) return existingConfiguration;
    if (sql.includes("FROM Seasons WHERE Id = ?")) return { id: values[0] };
    if (sql.includes("FROM Events WHERE Id = ? AND SeasonId = ?")) return { id: values[0] };
    if (sql.includes("FROM GameForms") && sql.includes("WHERE Id = ?")) {
      return { id: values[0], seasonId: 2026, formType: 0 };
    }
    if (sql.startsWith("UPDATE ActiveScoutingConfigurations")) {
      updateValues = values;
      return {
        id: 5,
        activePitFormId: 31,
        activeMatchFormId: null,
        activeSeasonId: 2026,
        activeEventId: 12,
      };
    }
    return null;
  });

  const response = await worker.fetch(activeConfigurationWriteRequest({
    activePitFormId: 31,
    activeMatchFormId: null,
  }, "/api/ActiveScoutingConfiguration"), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 5,
    activePitFormId: 31,
    activeMatchFormId: null,
    activeSeasonId: 2026,
    activeEventId: 12,
  });
  assert.deepEqual(updateValues, [31, null, 2026, 12, 5]);
});

test("rejects invalid active device configuration references without writing", async (t) => {
  const scenarios = [
    {
      name: "an event without a season",
      body: { activeEventId: 12 },
      resolve: () => null,
      expected: "Select a season for the active event.",
    },
    {
      name: "a missing season",
      body: { activeSeasonId: 2026 },
      resolve: (sql) => sql.includes("FROM Seasons WHERE Id = ?") ? null : null,
      expected: "The selected season does not exist.",
    },
    {
      name: "an event from a different season",
      body: { activeSeasonId: 2026, activeEventId: 12 },
      resolve: (sql, values) => sql.includes("FROM Seasons WHERE Id = ?")
        ? { id: values[0] }
        : null,
      expected: "The selected event does not belong to the selected season.",
    },
    {
      name: "a form with the wrong type",
      body: { activeSeasonId: 2026, activePitFormId: 31 },
      resolve: (sql, values) => {
        if (sql.includes("FROM Seasons WHERE Id = ?")) return { id: values[0] };
        if (sql.includes("FROM GameForms") && sql.includes("WHERE Id = ?")) {
          return { id: values[0], seasonId: 2026, formType: 1 };
        }
        return null;
      },
      expected: "Select a valid Pit form.",
    },
    {
      name: "a form from a different season",
      body: { activeSeasonId: 2026, activePitFormId: 31 },
      resolve: (sql, values) => {
        if (sql.includes("FROM Seasons WHERE Id = ?")) return { id: values[0] };
        if (sql.includes("FROM GameForms") && sql.includes("WHERE Id = ?")) {
          return { id: values[0], seasonId: 2025, formType: 0 };
        }
        return null;
      },
      expected: "The Pit form must belong to the active season. Update Device Configuration first.",
    },
    {
      name: "non-integer IDs",
      body: { activeSeasonId: "2026" },
      resolve: () => null,
      expected: "A valid active scouting configuration is required.",
    },
  ];

  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const { env, statements } = createEnv((sql, values) => {
        if (sql.includes("FROM ActiveScoutingConfigurations")) return null;
        return scenario.resolve(sql, values);
      });

      const response = await worker.fetch(activeConfigurationWriteRequest(scenario.body), env);

      assert.equal(response.status, 400);
      assert.equal(await response.text(), scenario.expected);
      assert.equal(statements.some(({ sql }) =>
        sql.startsWith("INSERT INTO ActiveScoutingConfigurations")
        || sql.startsWith("UPDATE ActiveScoutingConfigurations")), false);
    });
  }
});

test("requires a session and same-origin request to change active device settings", async (t) => {
  const { env, statements } = createEnv();
  const body = JSON.stringify({ activeSeasonId: 2026 });

  await t.test("unauthenticated request", async () => {
    const response = await worker.fetch(new Request(
      "https://grizzly-platform.test/api/ActiveScoutingConfiguration/devices",
      {
        method: "PUT",
        headers: {
          Origin: "https://grizzly-platform.test",
          "Content-Type": "application/json",
        },
        body,
      },
    ), env);
    assert.equal(response.status, 401);
  });

  await t.test("cross-origin request", async () => {
    const response = await worker.fetch(authenticatedRequest(
      "https://grizzly-platform.test/api/ActiveScoutingConfiguration/devices",
      {
        method: "PUT",
        headers: {
          Origin: "https://attacker.example",
          "Content-Type": "application/json",
        },
        body,
      },
    ), env);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: { code: "cross_origin_request_rejected" } });
  });

  assert.equal(statements.some(({ sql }) =>
    sql.startsWith("INSERT INTO ActiveScoutingConfigurations")
    || sql.startsWith("UPDATE ActiveScoutingConfigurations")), false);
});

test("returns submission rows in the existing review-page contract", async () => {
  const rows = [{
    id: 71,
    gameFormId: 4,
    gameFormName: "Pit scouting",
    formType: 0,
    seasonId: 6,
    seasonYear: 2026,
    seasonName: "Rebuilt",
    eventId: 12,
    matchId: null,
    matchNumber: null,
    matchType: null,
    setNumber: null,
    teamId: 8,
    teamNumber: 2056,
    teamName: "RoboBulls",
    submittedAt: "2026-09-26 08:15:30.1200000",
    answerFieldId: 42,
    answerQuestion: "Scout Name",
    answerValue: "Scout A",
  }, {
    id: 71,
    gameFormId: 4,
    gameFormName: "Pit scouting",
    formType: 0,
    seasonId: 6,
    seasonYear: 2026,
    seasonName: "Rebuilt",
    eventId: 12,
    matchId: null,
    matchNumber: null,
    matchType: null,
    setNumber: null,
    teamId: 8,
    teamNumber: 2056,
    teamName: "RoboBulls",
    submittedAt: "2026-09-26 08:15:30.1200000",
    answerFieldId: 43,
    answerQuestion: "Notes",
    answerValue: "Strong intake",
  }];
  const { env, statements } = createEnv((sql) => sql.includes("FROM GameFormSubmissions s") ? rows : []);

  const response = await worker.fetch(
    authenticatedRequest("https://grizzly-platform.test/api/GameFormSubmissions?seasonId=6&formType=Pit"),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{
    id: 71,
    gameFormId: 4,
    gameFormName: "Pit scouting",
    formType: "Pit",
    seasonId: 6,
    seasonYear: 2026,
    seasonName: "Rebuilt",
    eventId: 12,
    matchId: null,
    matchNumber: null,
    teamId: 8,
    teamNumber: 2056,
    teamName: "RoboBulls",
    scoutName: "Scout A",
    submittedAt: "2026-09-26T08:15:30.120Z",
    createdAt: "2026-09-26T08:15:30.120Z",
    answers: [
      { fieldId: 42, question: "Scout Name", value: "Scout A" },
      { fieldId: 43, question: "Notes", value: "Strong intake" },
    ],
  }]);
  const query = statements.find((statement) => statement.sql.includes("FROM GameFormSubmissions s"));
  assert.match(query.sql, /gf\.SeasonId = \?/);
  assert.match(query.sql, /gf\.FormType = \?/);
  assert.deepEqual(query.values, [6, 0]);
});

test("rejects unsupported submission form-type filters", async () => {
  const { env, statements } = createEnv();

  const response = await worker.fetch(
    authenticatedRequest("https://grizzly-platform.test/api/GameFormSubmissions?formType=unknown"),
    env,
  );

  assert.equal(response.status, 400);
  assert.equal(await response.text(), "Form type must be Pit or Match.");
  assert.equal(statements.some((statement) => statement.sql.includes("FROM GameFormSubmissions s")), false);
});

test("returns event scouting data and individual submission details", async (t) => {
  const row = {
    id: 72,
    gameFormId: 9,
    gameFormName: "Match scouting",
    formType: 1,
    seasonId: 6,
    seasonYear: 2026,
    seasonName: "Rebuilt",
    eventId: 12,
    matchId: 33,
    matchNumber: 2,
    matchType: "Qualification",
    setNumber: 1,
    teamId: 8,
    teamNumber: 2056,
    teamName: "RoboBulls",
    submittedAt: "2026-09-26T08:15:30.120Z",
    answerFieldId: 50,
    answerQuestion: "Scout Name",
    answerValue: "Scout B",
  };

  await t.test("event route preserves Alliance Selection fields", async () => {
    const { env, statements } = createEnv((sql) => sql.includes("FROM GameFormSubmissions s") ? [row] : []);
    const response = await worker.fetch(
      authenticatedRequest("https://grizzly-platform.test/api/GameFormSubmissions/event/12"),
      env,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{
      id: 72,
      gameFormId: 9,
      gameFormName: "Match scouting",
      formType: "Match",
      eventId: 12,
      matchId: 33,
      matchNumber: 2,
      matchType: "Qualification",
      teamId: 8,
      teamNumber: 2056,
      teamName: "RoboBulls",
      scoutName: "Scout B",
      submittedAt: "2026-09-26T08:15:30.120Z",
      createdAt: "2026-09-26T08:15:30.120Z",
      answers: [{ fieldId: 50, question: "Scout Name", value: "Scout B" }],
    }]);
    const query = statements.find((statement) => statement.sql.includes("FROM GameFormSubmissions s"));
    assert.deepEqual(query.values, [12, 12]);
  });

  await t.test("item route returns the single-submission shape", async () => {
    const { env } = createEnv((sql) => sql.includes("FROM GameFormSubmissions s") ? [row] : []);
    const response = await worker.fetch(
      authenticatedRequest("https://grizzly-platform.test/api/GameFormSubmissions/72"),
      env,
    );

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      id: 72,
      gameFormId: 9,
      gameFormName: "Match scouting",
      eventId: 12,
      matchId: 33,
      matchNumber: 2,
      teamId: 8,
      teamNumber: 2056,
      teamName: "RoboBulls",
      scoutName: "Scout B",
      submittedAt: "2026-09-26T08:15:30.120Z",
      createdAt: "2026-09-26T08:15:30.120Z",
      answers: [{ fieldId: 50, question: "Scout Name", value: "Scout B" }],
    });
  });
});

test("scout submission validates and atomically stores the auto-filled system answers", async () => {
  const fields = [
    { id: 41, gameFormId: 4, question: "Team Number", required: 1 },
    { id: 42, gameFormId: 4, question: "Scout Name", required: 1 },
    { id: 43, gameFormId: 4, question: "Notes", required: 1 },
  ];
  const savedRows = [fields[2], fields[0], fields[1]].map((field) => ({
    id: 71,
    gameFormId: 4,
    gameFormName: "Pit scouting",
    formType: 0,
    seasonId: 6,
    seasonYear: 2026,
    seasonName: "Rebuilt",
    eventId: null,
    matchId: null,
    matchNumber: null,
    matchType: null,
    setNumber: null,
    teamId: 8,
    teamNumber: 2056,
    teamName: "RoboBulls",
    submittedAt: "2026-09-26T12:00:00.000Z",
    answerFieldId: field.id,
    answerQuestion: field.question,
    answerValue: field.id === 41 ? "2056" : field.id === 42 ? "Scout A" : "Strong intake",
  }));
  const { env, statements } = createEnv((sql) => {
    if (sql.includes("FROM GameForms")) {
      return { id: 4, seasonId: 6, name: "Pit scouting", formType: 0 };
    }
    if (sql.includes("FROM GameFormFields")) return fields;
    if (sql.includes("FROM Teams")) return { id: 8, teamNumber: 2056, name: "RoboBulls" };
    if (sql.includes("SELECT Id AS id FROM GameFormSubmissions")) return null;
    if (sql.includes("FROM GameFormSubmissions s")) return savedRows;
    return [];
  });
  const request = authenticatedRequest(
    "https://grizzly-platform.test/api/GameFormSubmissions/scout",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://grizzly-platform.test",
      },
      body: JSON.stringify({
        gameFormId: 4,
        teamNumber: 2056,
        scoutName: "Scout A",
        eventId: null,
        answers: [{ gameFormFieldId: 43, value: "Strong intake" }],
      }),
    },
  );

  const response = await worker.fetch(request, env);
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(response.headers.get("location"), "/api/GameFormSubmissions/71");
  assert.equal(body.formType, "Pit");
  assert.deepEqual(body.answers, [
    { fieldId: 43, question: "Notes", value: "Strong intake" },
    { fieldId: 41, question: "Team Number", value: "2056" },
    { fieldId: 42, question: "Scout Name", value: "Scout A" },
  ]);

  const inserts = statements.filter((statement) => statement.operation === "run");
  assert.equal(inserts.length, 4);
  assert.match(inserts[0].sql, /WHERE NOT EXISTS/);
  assert.deepEqual(inserts.slice(1).map((statement) => statement.values.slice(0, 2)), [
    [43, "Strong intake"],
    [41, "2056"],
    [42, "Scout A"],
  ]);
});

test("rejects missing required scout answers and duplicate submissions", async (t) => {
  const fields = [
    { id: 41, gameFormId: 4, question: "Scout Name", required: 1 },
    { id: 43, gameFormId: 4, question: "Notes", required: 1 },
  ];
  const makeRequest = (answers) => authenticatedRequest(
    "https://grizzly-platform.test/api/GameFormSubmissions/scout",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://grizzly-platform.test",
      },
      body: JSON.stringify({ gameFormId: 4, teamNumber: 2056, scoutName: "Scout A", answers }),
    },
  );
  const baseResolver = (duplicate) => (sql) => {
    if (sql.includes("FROM GameForms")) return { id: 4, seasonId: 6, name: "Pit scouting", formType: 0 };
    if (sql.includes("FROM GameFormFields")) return fields;
    if (sql.includes("FROM Teams")) return { id: 8, teamNumber: 2056, name: "RoboBulls" };
    if (sql.includes("SELECT Id AS id FROM GameFormSubmissions")) return duplicate ? { id: 12 } : null;
    return [];
  };

  await t.test("missing required field", async () => {
    const { env, statements } = createEnv(baseResolver(false));
    const response = await worker.fetch(makeRequest([]), env);
    assert.equal(response.status, 400);
    assert.equal(await response.text(), "Required field 'Notes' is missing an answer.");
    assert.equal(statements.some((statement) => statement.operation === "run"), false);
  });

  await t.test("duplicate scout/team/form combination", async () => {
    const { env, statements } = createEnv(baseResolver(true));
    const response = await worker.fetch(makeRequest([{ gameFormFieldId: 43, value: "Notes" }]), env);
    assert.equal(response.status, 409);
    assert.equal(await response.text(), "A submission for this team already exists.");
    assert.equal(statements.some((statement) => statement.operation === "run"), false);
  });
});

test("edits a submission by replacing its answers transactionally", async () => {
  const fields = [
    { id: 50, gameFormId: 9, question: "Scout Name", required: 1 },
    { id: 51, gameFormId: 9, question: "Notes", required: 1 },
  ];
  const savedRows = fields.map((field) => ({
    id: 72,
    gameFormId: 9,
    gameFormName: "Match scouting",
    formType: 1,
    seasonId: 6,
    seasonYear: 2026,
    seasonName: "Rebuilt",
    eventId: 12,
    matchId: 33,
    matchNumber: 2,
    matchType: "Qualification",
    setNumber: 1,
    teamId: 8,
    teamNumber: 2056,
    teamName: "RoboBulls",
    submittedAt: "2026-09-26T08:15:30.120Z",
    answerFieldId: field.id,
    answerQuestion: field.question,
    answerValue: field.id === 50 ? "Scout B" : "Updated notes",
  }));
  const { env, statements } = createEnv((sql) => {
    if (sql.startsWith("SELECT s.Id AS id, s.GameFormId AS gameFormId, s.TeamId AS teamId")) {
      return {
        id: 72,
        gameFormId: 9,
        teamId: 8,
        matchId: 33,
        submittedAt: "2026-09-26T08:15:30.120Z",
        gameFormName: "Match scouting",
      };
    }
    if (sql.includes("FROM GameFormFields")) return fields;
    if (sql.includes("FROM GameFormSubmissions s")) return savedRows;
    return [];
  });
  const request = authenticatedRequest(
    "https://grizzly-platform.test/api/GameFormSubmissions/72",
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://grizzly-platform.test",
      },
      body: JSON.stringify({ answers: [
        { gameFormFieldId: 50, value: "Scout B" },
        { gameFormFieldId: 51, value: "Updated notes" },
      ] }),
    },
  );

  const response = await worker.fetch(request, env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    id: 72,
    gameFormId: 9,
    gameFormName: "Match scouting",
    teamId: 8,
    matchId: 33,
    submittedAt: "2026-09-26T08:15:30.120Z",
    answers: [
      { fieldId: 50, question: "Scout Name", value: "Scout B" },
      { fieldId: 51, question: "Notes", value: "Updated notes" },
    ],
  });
  const writes = statements.filter((statement) => statement.operation === "run");
  assert.equal(writes[0].sql, "DELETE FROM GameFormAnswers WHERE GameFormSubmissionId = ?");
  assert.equal(writes.length, 3);
});

test("restricts the destructive clear-all route to administrators", async (t) => {
  const makeRequest = () => authenticatedRequest(
    "https://grizzly-platform.test/api/GameFormSubmissions/clear-all",
    { method: "DELETE", headers: { Origin: "https://grizzly-platform.test" } },
  );

  await t.test("scouts cannot clear scouting records", async () => {
    const { env, statements } = createEnv();
    const response = await worker.fetch(makeRequest(), env);
    assert.equal(response.status, 403);
    assert.equal(statements.some((statement) => statement.operation === "run"), false);
  });

  await t.test("administrators receive the removal counts", async () => {
    const admin = { ...TEST_SESSION_USER, role: "Admin" };
    const { env, statements } = createEnv((sql) => {
      if (sql.includes("COUNT(*) AS count FROM GameFormAnswers")) return { count: 12 };
      if (sql.includes("COUNT(*) AS count FROM GameFormSubmissions")) return { count: 4 };
      return [];
    }, { sessionUser: admin });
    const response = await worker.fetch(makeRequest(), env);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      message: "All submissions cleared.",
      removedSubmissions: 4,
      removedAnswers: 12,
    });
    const writes = statements.filter((statement) => statement.operation === "run");
    assert.deepEqual(writes.map((statement) => statement.sql), [
      "DELETE FROM GameFormAnswers",
      "DELETE FROM GameFormSubmissions",
    ]);
  });
});

test("verifies the Identity V3 password format emitted by the ASP.NET API", async () => {
  const hash = createIdentityV3Hash("correct horse battery staple");

  assert.equal(await verifyAspNetIdentityPassword("correct horse battery staple", hash), true);
  assert.equal(await verifyAspNetIdentityPassword("incorrect password", hash), false);
  assert.equal(await verifyAspNetIdentityPassword("correct horse battery staple", "not-a-hash"), false);
});

test("verifies the older ASP.NET Identity V2 password format", async () => {
  const hash = createIdentityV2Hash("legacy password");

  assert.equal(await verifyAspNetIdentityPassword("legacy password", hash), true);
  assert.equal(await verifyAspNetIdentityPassword("wrong password", hash), false);
});

test("login creates an HttpOnly session, restores it, and logout revokes it", async () => {
  const password = "correct horse battery staple";
  const user = {
    id: 42,
    username: "robotics-scout",
    displayName: "Robotics Scout",
    passwordHash: createIdentityV3Hash(password),
    role: "Scout",
    isActive: 1,
  };
  const { env, statements } = createEnv((sql) => sql.includes("FROM Users") ? user : []);

  const loginResponse = await worker.fetch(new Request(
    "https://grizzly-platform.test/api/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://grizzly-platform.test",
      },
      body: JSON.stringify({ username: user.username, password }),
    },
  ), env);

  assert.equal(loginResponse.status, 200);
  assert.deepEqual(await loginResponse.json(), {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  });

  const setCookie = loginResponse.headers.get("set-cookie");
  assert.ok(setCookie);
  assert.match(setCookie, /^__Host-grizzly_session=[A-Za-z0-9_-]{43};/);
  assert.match(setCookie, /; HttpOnly/);
  assert.match(setCookie, /; Secure/);
  assert.match(setCookie, /; SameSite=Lax/);
  assert.equal(statements.some((entry) => entry.sql.startsWith("INSERT INTO AuthSessions")), true);

  const token = setCookie.match(/^__Host-grizzly_session=([^;]+)/)?.[1];
  assert.ok(token);
  const insert = statements.find((entry) => entry.sql.startsWith("INSERT INTO AuthSessions"));
  assert.equal(insert.values[0], createHash("sha256").update(token).digest("hex"));
  assert.notEqual(insert.values[0], token);
  const cookieHeader = `__Host-grizzly_session=${token}`;
  const meResponse = await worker.fetch(new Request(
    "https://grizzly-platform.test/api/auth/me",
    { headers: { Cookie: cookieHeader } },
  ), env);
  assert.equal(meResponse.status, 200);
  assert.deepEqual(await meResponse.json(), {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  });

  const logoutResponse = await worker.fetch(new Request(
    "https://grizzly-platform.test/api/auth/logout",
    {
      method: "POST",
      headers: {
        Cookie: cookieHeader,
        Origin: "https://grizzly-platform.test",
      },
    },
  ), env);
  assert.equal(logoutResponse.status, 204);
  assert.match(logoutResponse.headers.get("set-cookie") ?? "", /Max-Age=0/);

  const afterLogout = await worker.fetch(new Request(
    "https://grizzly-platform.test/api/auth/me",
    { headers: { Cookie: cookieHeader } },
  ), env);
  assert.equal(afterLogout.status, 401);
});

test("rate limits login attempts by normalized username before querying user records", async () => {
  const { env, statements, loginRateLimitCounts } = createEnv();
  const url = "https://grizzly-platform.test/api/auth/login";

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await worker.fetch(new Request(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://grizzly-platform.test",
      },
      body: JSON.stringify({ username: attempt < 5 ? "Scout" : "sCoUt", password: "wrong" }),
    }), env);
    assert.equal(response.status, 401);
  }

  const limitedResponse = await worker.fetch(new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://grizzly-platform.test",
    },
    body: JSON.stringify({ username: "SCOUT", password: "wrong" }),
  }), env);

  assert.equal(limitedResponse.status, 429);
  assert.equal(limitedResponse.headers.get("Retry-After"), "60");
  assert.deepEqual(await limitedResponse.json(), { error: { code: "login_rate_limited" } });
  assert.equal(statements.filter((entry) => entry.sql.includes("FROM Users")).length, 10);
  assert.equal(loginRateLimitCounts.size, 1);
  assert.equal([...loginRateLimitCounts.values()][0], 11);
});

test("fails closed when the login rate limiter is missing or unavailable", async (t) => {
  const url = "https://grizzly-platform.test/api/auth/login";
  const request = () => new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://grizzly-platform.test",
    },
    body: JSON.stringify({ username: "scout", password: "password" }),
  });

  await t.test("missing binding", async () => {
    const { env, statements } = createEnv();
    delete env.LOGIN_RATE_LIMITER;
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: "login_rate_limiter_unavailable" } });
    assert.equal(statements.length, 0);
  });

  await t.test("binding failure", async () => {
    const { env, statements } = createEnv();
    env.LOGIN_RATE_LIMITER = { async limit() { throw new Error("rate limiter unavailable"); } };
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: "login_rate_limiter_unavailable" } });
    assert.equal(statements.length, 0);
  });
});

test("rejects cross-origin login and blocks private API reads without a session", async () => {
  const { env } = createEnv();
  const crossOriginLogin = await worker.fetch(new Request(
    "https://grizzly-platform.test/api/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://attacker.example",
      },
      body: JSON.stringify({ username: "scout", password: "password" }),
    },
  ), env);
  assert.equal(crossOriginLogin.status, 403);

  const privateRead = await worker.fetch(
    new Request("https://grizzly-platform.test/api/teams"),
    env,
  );
  assert.equal(privateRead.status, 401);
});

test("restricts user listing to administrator sessions", async () => {
  const { env } = createEnv();
  const response = await worker.fetch(
    authenticatedRequest("https://grizzly-platform.test/api/auth/users"),
    env,
  );
  assert.equal(response.status, 403);
});

test("returns user profile fields to administrators without exposing password hashes", async () => {
  const admin = { ...TEST_SESSION_USER, role: "Admin" };
  const user = {
    id: 42,
    username: "robotics-scout",
    displayName: "Robotics Scout",
    role: "Scout",
    isActive: 1,
  };
  const { env } = createEnv((sql) => sql.includes("FROM Users") ? [user] : [], { sessionUser: admin });

  const response = await worker.fetch(
    authenticatedRequest("https://grizzly-platform.test/api/auth/users"),
    env,
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isActive: true,
  }]);
});

test("preserves administrator access for the existing trusted staff account", async () => {
  const trustedStaff = { ...TEST_SESSION_USER, username: "awoodman", role: "Staff" };
  const { env } = createEnv(() => [], { sessionUser: trustedStaff });

  const response = await worker.fetch(
    authenticatedRequest("https://grizzly-platform.test/api/auth/users"),
    env,
  );
  assert.equal(response.status, 200);
});

test("reports database connectivity without claiming full route readiness", async () => {
  const { env } = createEnv(() => ({ ok: 1 }));

  const response = await worker.fetch(
    new Request("https://grizzly-platform.test/api/health"),
    env,
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.status, "degraded");
  assert.equal(body.databaseStatus, "connected");
  assert.equal(body.loginRateLimitConfigured, true);
  assert.equal(body.apiRoutesReady, false);
  assert.ok(body.implementedRoutes.includes("GET /api/health"));
  assert.ok(body.implementedRoutes.includes("GET /api/events"));
});

test("reports missing D1 binding as unavailable instead of throwing", async () => {
  const { env } = createEnv();
  delete env.DB;

  const response = await worker.fetch(
    new Request("https://grizzly-platform.test/api/health"),
    env,
  );

  assert.equal(response.status, 503);
  assert.equal((await response.json()).databaseStatus, "unavailable");
});

test("queues an authenticated Blue Alliance event sync and returns its pending state", async () => {
  const sent = [];
  const queue = {
    async send(body, options) { sent.push({ body, options }); },
  };
  const state = {
    eventId: 7,
    resource: "teams",
    manualMode: 0,
    revision: 4,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastChangedAt: null,
    outcome: "Never",
    message: "No synchronization attempted yet.",
    sourceEtag: null,
  };
  const { env, statements } = createEnv((sql) => {
    if (sql.includes("FROM Events WHERE Id = ?")) return { id: 7, blueAllianceKey: "2026miket" };
    if (sql.includes("FROM EventSyncStates WHERE EventId = ? AND Resource = ?")) return state;
    if (sql.startsWith("UPDATE EventSyncStates") && sql.includes("SET LastAttemptAt")) return { meta: { changes: 1 } };
    return [];
  }, { queue });

  const response = await worker.fetch(authenticatedRequest(
    "https://grizzly-platform.test/api/EventOperations/7/sync/teams",
    { method: "POST", headers: { Origin: "https://grizzly-platform.test" } },
  ), env);

  assert.equal(response.status, 202);
  assert.deepEqual(sent, [{
    body: { eventId: 7, resource: "teams", revision: 4 },
    options: { contentType: "json" },
  }]);
  assert.equal((await response.json()).outcome, "Queued");
  assert.ok(statements.some((statement) => statement.sql.includes("UPDATE EventSyncStates")));
});

test("Blue Alliance preview routes proxy authenticated team and match data without syncing it", async () => {
  const previousFetch = globalThis.fetch;
  const tbaCalls = [];
  const { env, statements } = createEnv((sql) => {
    if (sql.includes("FROM Events WHERE Id = ?")) return { blueAllianceKey: "2026miket" };
    return [];
  });
  env.TBA_API_KEY = "local-test-key";
  globalThis.fetch = async (url, init) => {
    tbaCalls.push({ url, headers: new Headers(init.headers) });
    return Response.json(url.endsWith("/teams")
      ? [{ team_number: 254, nickname: "The Cheesy Poofs" }]
      : [{ key: "2026miket_qm1", comp_level: "qm", match_number: 1 }]);
  };

  try {
    const teamsResponse = await worker.fetch(authenticatedRequest(
      "https://grizzly-platform.test/api/events/7/bluealliance/teams",
    ), env);
    const matchesResponse = await worker.fetch(authenticatedRequest(
      "https://grizzly-platform.test/api/events/7/bluealliance/matches",
    ), env);

    assert.equal(teamsResponse.status, 200);
    assert.deepEqual(await teamsResponse.json(), [{ team_number: 254, nickname: "The Cheesy Poofs" }]);
    assert.equal(matchesResponse.status, 200);
    assert.deepEqual(await matchesResponse.json(), [{ key: "2026miket_qm1", comp_level: "qm", match_number: 1 }]);
    assert.deepEqual(tbaCalls.map((call) => call.url), [
      "https://www.thebluealliance.com/api/v3/event/2026miket/teams",
      "https://www.thebluealliance.com/api/v3/event/2026miket/matches",
    ]);
    assert.ok(tbaCalls.every((call) => call.headers.get("X-TBA-Auth-Key") === "local-test-key"));
    assert.equal(statements.some((statement) => /INSERT|UPDATE|DELETE/i.test(statement.sql)), false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("Blue Alliance previews keep missing-event, missing-key, and upstream failures explicit", async () => {
  const previousFetch = globalThis.fetch;
  let eventRow = null;
  const { env } = createEnv((sql) => {
    if (sql.includes("FROM Events WHERE Id = ?")) return eventRow;
    return [];
  });
  env.TBA_API_KEY = "local-test-key";

  try {
    const missingEvent = await worker.fetch(authenticatedRequest(
      "https://grizzly-platform.test/api/events/7/bluealliance/teams",
    ), env);
    assert.equal(missingEvent.status, 404);

    eventRow = { blueAllianceKey: "  " };
    const missingKey = await worker.fetch(authenticatedRequest(
      "https://grizzly-platform.test/api/events/7/bluealliance/teams",
    ), env);
    assert.equal(missingKey.status, 400);
    assert.equal(await missingKey.text(), "This event does not have a Blue Alliance key.");

    eventRow = { blueAllianceKey: "2026miket" };
    globalThis.fetch = async () => new Response("rate limited", { status: 429 });
    const upstreamFailure = await worker.fetch(authenticatedRequest(
      "https://grizzly-platform.test/api/events/7/bluealliance/matches",
    ), env);
    assert.equal(upstreamFailure.status, 502);
    assert.match(await upstreamFailure.text(), /HTTP 429/);

    delete env.TBA_API_KEY;
    const missingSecret = await worker.fetch(authenticatedRequest(
      "https://grizzly-platform.test/api/events/7/bluealliance/matches",
    ), env);
    assert.equal(missingSecret.status, 503);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("event sync queue validates The Blue Alliance data before committing the roster", async () => {
  const previousFetch = globalThis.fetch;
  const messageCalls = { acknowledged: 0, retries: [] };
  const { env, statements } = createEnv((sql) => {
    if (sql.includes("FROM EventSyncStates WHERE EventId = ? AND Resource = ?")) {
      return {
        eventId: 7, resource: "teams", manualMode: 0, revision: 4,
        lastAttemptAt: null, lastSuccessAt: null, lastChangedAt: null,
        outcome: "Queued", message: "Queued for The Blue Alliance.", sourceEtag: null,
      };
    }
    if (sql.includes("FROM Events WHERE Id = ?")) return { blueAllianceKey: "2026miket" };
    if (sql.includes("FROM EventTeams et JOIN Teams")) return [];
    if (sql.startsWith("UPDATE EventSyncStates")) return { meta: { changes: 1 } };
    return [];
  });
  env.TBA_API_KEY = "local-test-key";
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://www.thebluealliance.com/api/v3/event/2026miket/teams");
    assert.equal(new Headers(init.headers).get("X-TBA-Auth-Key"), "local-test-key");
    return new Response(JSON.stringify([{
      team_number: 254, nickname: "The Cheesy Poofs", city: "San Jose", state_prov: "CA", country: "USA",
    }]), { headers: { ETag: '"roster-v1"' } });
  };

  try {
    await worker.queue({
      queue: "grizzly-event-sync",
      messages: [{
        body: { eventId: 7, resource: "teams", revision: 4 },
        attempts: 1,
        ack() { messageCalls.acknowledged += 1; },
        retry(options) { messageCalls.retries.push(options); },
      }],
    }, env);
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(messageCalls.acknowledged, 1);
  assert.deepEqual(messageCalls.retries, []);
  assert.ok(statements.some((statement) => statement.sql.includes("INSERT INTO Teams")));
  assert.ok(statements.some((statement) => statement.sql.includes("INSERT INTO EventTeams")));
  assert.ok(statements.some((statement) => statement.sql.includes("SourceEtag")));
});

test("preserves event data and retries transient TBA errors from the sync queue", async () => {
  const previousFetch = globalThis.fetch;
  const messageCalls = { acknowledged: 0, retries: [] };
  const { env, statements } = createEnv((sql) => {
    if (sql.includes("FROM EventSyncStates WHERE EventId = ? AND Resource = ?")) {
      return {
        eventId: 7, resource: "matches", manualMode: 0, revision: 2,
        lastAttemptAt: null, lastSuccessAt: null, lastChangedAt: null,
        outcome: "Queued", message: "Queued for The Blue Alliance.", sourceEtag: null,
      };
    }
    if (sql.includes("FROM Events WHERE Id = ?")) return { blueAllianceKey: "2026miket" };
    if (sql.startsWith("UPDATE EventSyncStates")) return { meta: { changes: 1 } };
    return [];
  });
  env.TBA_API_KEY = "local-test-key";
  globalThis.fetch = async () => new Response("rate limited", { status: 429 });

  try {
    await worker.queue({
      queue: "grizzly-event-sync",
      messages: [{
        body: { eventId: 7, resource: "matches", revision: 2 },
        attempts: 1,
        ack() { messageCalls.acknowledged += 1; },
        retry(options) { messageCalls.retries.push(options); },
      }],
    }, env);
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(messageCalls.acknowledged, 0);
  assert.deepEqual(messageCalls.retries, [{ delaySeconds: 10 }]);
  assert.ok(statements.some((statement) => statement.sql.includes("SET Outcome = ?")
    && statement.values[0] === "Retrying"));
});

test("dead-letter event sync jobs finish with a visible failed status", async () => {
  const messageCalls = { acknowledged: 0 };
  const { env, statements } = createEnv((sql) => sql.startsWith("UPDATE EventSyncStates")
    ? { meta: { changes: 1 } }
    : []);

  await worker.queue({
    queue: "grizzly-event-sync-dlq",
    messages: [{
      body: { eventId: 7, resource: "rankings", revision: 3 },
      attempts: 1,
      ack() { messageCalls.acknowledged += 1; },
      retry() { assert.fail("A dead-letter result must not be retried indefinitely."); },
    }],
  }, env);

  assert.equal(messageCalls.acknowledged, 1);
  assert.ok(statements.some((statement) => statement.sql.includes("SET Outcome = ?")
    && statement.values[0] === "Failed"));
});

test("event sync mode uses revision checks and returns the saved mode", async () => {
  const state = {
    eventId: 7, resource: "teams", manualMode: 0, revision: 4,
    lastAttemptAt: null, lastSuccessAt: null, lastChangedAt: null,
    outcome: "Ready", message: "Ready", sourceEtag: null,
  };
  const { env, statements } = createEnv((sql, values) => {
    if (sql.includes("FROM Events WHERE Id = ?")) return { id: 7 };
    if (sql.includes("FROM EventSyncStates WHERE EventId = ? AND Resource = ?")) return state;
    if (sql.startsWith("UPDATE EventSyncStates") && sql.includes("SET ManualMode")) {
      state.manualMode = values[0];
      state.revision += 1;
      state.outcome = values[1];
      state.message = values[2];
      return { meta: { changes: 1 } };
    }
    return [];
  });

  const response = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/EventOperations/7/mode/teams",
    "PUT",
    { revision: 4, manualMode: true },
  ), env);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).manualMode, true);
  assert.equal(state.revision, 5);
  assert.ok(statements.some((statement) => statement.sql.includes("Revision = ?")));
});

test("event operations can add a manual team and pause automatic roster updates", async () => {
  const state = {
    eventId: 7, resource: "teams", manualMode: 0, revision: 2,
    lastAttemptAt: null, lastSuccessAt: null, lastChangedAt: null,
    outcome: "Ready", message: "Ready", sourceEtag: null,
  };
  const { env, statements } = createEnv((sql, values) => {
    if (sql.includes("FROM Events WHERE Id = ?")) return { id: 7 };
    if (sql.includes("FROM EventSyncStates WHERE EventId = ? AND Resource = ?")) return state;
    if (sql.includes("FROM Teams WHERE TeamNumber = ?")) {
      return sql.startsWith("SELECT Id AS id") ? { id: 99, teamNumber: 2056, name: "RoboTigers" } : null;
    }
    if (sql.includes("FROM EventTeams WHERE EventId = ? AND TeamId = ?")) return null;
    if (sql.startsWith("UPDATE EventSyncStates") && sql.includes("ManualMode = 1")) {
      state.manualMode = 1;
      state.revision += 1;
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("INSERT INTO Teams")) return { meta: { changes: 1 } };
    if (sql.startsWith("INSERT INTO EventTeams")) return { meta: { changes: 1 } };
    return [];
  });

  const response = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/EventOperations/7/teams",
    "POST",
    { revision: 2, teamNumber: 2056, name: "RoboTigers" },
  ), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: 99, teamNumber: 2056, name: "RoboTigers" });
  assert.equal(state.manualMode, 1);
  assert.equal(state.revision, 3);
  assert.ok(statements.some((statement) => statement.sql.includes("INSERT INTO EventTeams")));
});

test("event operations save a manual ranking order transactionally", async () => {
  const { env, statements } = createEnv((sql, values) => {
    if (sql.includes("FROM Events WHERE Id = ?")) return { id: 7 };
    if (sql.includes("FROM EventSyncStates WHERE EventId = ? AND Resource = ?")) {
      return { eventId: 7, resource: "rankings", manualMode: 0, revision: 3, outcome: "Ready", message: "Ready" };
    }
    if (sql.includes("FROM EventRankings WHERE EventId = ?")) {
      return [{ teamId: 10, rank: 1, rankingPoints: 8, tieBreaker1: 2, tieBreaker2: 1 }];
    }
    if (sql.includes("FROM EventTeams WHERE EventId = ?")) return [{ teamId: 10 }];
    if (sql.startsWith("UPDATE EventSyncStates") && sql.includes("ManualMode = 1")) return { meta: { changes: 1 } };
    if (sql.startsWith("DELETE FROM EventRankings")) return { meta: { changes: 1 } };
    if (sql.includes("INSERT INTO EventRankings")) return { meta: { changes: 1 } };
    return [];
  });

  const response = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/EventOperations/7/rankings",
    "PUT",
    { revision: 3, teamIds: [10] },
  ), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    message: "Manual ranking order saved. Existing alliance drafts retain their saved order.",
  });
  assert.ok(statements.some((statement) => statement.sql.startsWith("DELETE FROM EventRankings")));
  assert.ok(statements.some((statement) => statement.sql.includes("INSERT INTO EventRankings")));
});

test("event operations create a manual match with the saved event revision", async () => {
  const numbers = [1, 2, 3, 4, 5, 6];
  const { env, statements } = createEnv((sql) => {
    if (sql.includes("FROM Events WHERE Id = ?")) return { id: 7 };
    if (sql.includes("FROM EventSyncStates WHERE EventId = ? AND Resource = ?")) {
      return { eventId: 7, resource: "matches", manualMode: 0, revision: 5, outcome: "Ready", message: "Ready" };
    }
    if (sql.includes("FROM Teams") && sql.includes("TeamNumber IN")) {
      return numbers.map((teamNumber, index) => ({ id: 20 + index, teamNumber }));
    }
    if (sql.includes("FROM EventTeams WHERE EventId = ?")) {
      return numbers.map((_, index) => ({ teamId: 20 + index }));
    }
    if (sql.includes("Id != ? LIMIT 1")) return null;
    if (sql.includes("FROM Matches") && sql.includes("WHERE EventId = ?")
        && sql.includes("MatchType = ?") && sql.includes("SetNumber = ?")) return { id: 44 };
    if (sql.startsWith("UPDATE EventSyncStates") && sql.includes("ManualMode = 1")) return { meta: { changes: 1 } };
    if (sql.startsWith("INSERT INTO Matches")) return { meta: { changes: 1 } };
    return [];
  });

  const response = await worker.fetch(authenticatedJsonRequest(
    "https://grizzly-platform.test/api/EventOperations/7/matches",
    "PUT",
    {
      revision: 5,
      id: 0,
      matchType: "Qualification",
      matchNumber: 1,
      setNumber: 0,
      teamNumbers: numbers,
      redScore: null,
      blueScore: null,
    },
  ), env);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { id: 44 });
  assert.ok(statements.some((statement) => statement.sql.startsWith("INSERT INTO Matches")));
});

test("alliance planning loads the same shared-board shape as the ASP.NET API", async () => {
  const { env } = createEnv((sql) => {
    if (sql.includes("FROM Events WHERE Id = ?")) {
      return { id: 9, eventName: "Michigan Regional", seasonId: 2026 };
    }
    if (sql.includes("FROM AlliancePlans WHERE EventId = ?")) {
      return {
        eventId: 9,
        version: 3,
        ourTeamId: 51,
        firstPartnerId: 52,
        secondPartnerId: null,
        notes: "Defense first",
        updatedAt: "2026-09-26T12:00:00.000Z",
      };
    }
    if (sql.includes("FROM Teams t")) {
      return [{ teamId: 51, teamNumber: 2056, teamName: "RoboTigers" }];
    }
    if (sql.includes("FROM AlliancePlanEntries")) {
      return [{ teamId: 51, position: 1, reason: "Reliable defense" }];
    }
    if (sql.includes("FROM AlliancePlanSuggestions WHERE EventId = ?")) {
      return [{
        id: "a3e51255-39fb-4b41-b9e7-c0fba2a6ed63",
        eventId: 9,
        teamId: 51,
        author: "Scout 1",
        reason: "Strong intake",
        status: "Pending",
        hostResponse: "",
        createdAt: "2026-09-26T11:00:00.000Z",
        reviewedAt: null,
      }];
    }
    return [];
  });

  const response = await worker.fetch(
    authenticatedRequest("https://grizzly-platform.test/api/AlliancePlans/event/9"),
    env,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    eventId: 9,
    eventName: "Michigan Regional",
    seasonId: 2026,
    version: 3,
    ourTeamId: 51,
    firstPartnerId: 52,
    secondPartnerId: null,
    notes: "Defense first",
    updatedAt: "2026-09-26T12:00:00.000Z",
    teams: [{ teamId: 51, teamNumber: 2056, teamName: "RoboTigers" }],
    wishlist: [{ teamId: 51, position: 1, reason: "Reliable defense" }],
    suggestions: [{
      id: "a3e51255-39fb-4b41-b9e7-c0fba2a6ed63",
      eventId: 9,
      teamId: 51,
      author: "Scout 1",
      reason: "Strong intake",
      status: "Pending",
      hostResponse: "",
      createdAt: "2026-09-26T11:00:00.000Z",
      reviewedAt: null,
    }],
  });
});

test("alliance plan publication uses versioned batch writes and validates event teams", async (t) => {
  const requestBody = {
    version: 0,
    ourTeamId: 51,
    firstPartnerId: null,
    secondPartnerId: null,
    notes: "  shared notes  ",
    wishlist: [{ teamId: 52, reason: "  quick cycle  " }],
  };

  await t.test("creates and publishes the plan", async () => {
    const { env, statements } = createEnv((sql) => {
      if (sql.includes("FROM Events WHERE Id = ?")) {
        return { id: 9, eventName: "Michigan Regional", seasonId: 2026 };
      }
      if (sql.includes("FROM EventTeams WHERE EventId = ?")) return [{ teamId: 51 }, { teamId: 52 }];
      if (sql.startsWith("UPDATE AlliancePlans")) return { meta: { changes: 0 } };
      if (sql.startsWith("INSERT INTO AlliancePlans")) return { meta: { changes: 1 } };
      if (sql.startsWith("INSERT INTO AlliancePlanEntries")) return { meta: { changes: 1 } };
      return { meta: { changes: 0 }, results: [] };
    });

    const response = await worker.fetch(authenticatedJsonRequest(
      "https://grizzly-platform.test/api/AlliancePlans/event/9", "PUT", requestBody,
    ), env);

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.version, 1);
    assert.match(body.updatedAt, /^2026-/);
    const insertPlan = statements.find(({ sql }) => sql.startsWith("INSERT INTO AlliancePlans"));
    assert.deepEqual(insertPlan.values.slice(0, 6), [9, 51, null, null, "shared notes", body.updatedAt]);
    assert.match(insertPlan.values[6], /^[0-9a-f-]{36}$/);
    assert.equal(insertPlan.values[7], 9);
    assert.ok(statements.some(({ sql, values }) =>
      sql.startsWith("INSERT INTO AlliancePlanEntries") && values.slice(0, 4).join("|") === "9|52|1|quick cycle"));
  });

  await t.test("rejects stale versions without applying wishlist changes", async () => {
    const staleRequest = { ...requestBody, version: 2 };
    const { env, statements } = createEnv((sql) => {
      if (sql.includes("FROM Events WHERE Id = ?")) {
        return { id: 9, eventName: "Michigan Regional", seasonId: 2026 };
      }
      if (sql.includes("FROM EventTeams WHERE EventId = ?")) return [{ teamId: 51 }, { teamId: 52 }];
      return { meta: { changes: 0 }, results: [] };
    });

    const response = await worker.fetch(authenticatedJsonRequest(
      "https://grizzly-platform.test/api/AlliancePlans/event/9", "PUT", staleRequest,
    ), env);

    assert.equal(response.status, 409);
    assert.equal(statements.some(({ sql }) => sql.startsWith("INSERT INTO AlliancePlanEntries")), true);
    assert.equal(statements.some(({ sql }) => sql.startsWith("INSERT INTO AlliancePlanEntries")
      && sql.includes("SELECT")), true);
  });

  await t.test("rejects duplicate alliance slots before writing", async () => {
    const { env, statements } = createEnv();
    const response = await worker.fetch(authenticatedJsonRequest(
      "https://grizzly-platform.test/api/AlliancePlans/event/9", "PUT",
      { ...requestBody, ourTeamId: 51, firstPartnerId: 51 },
    ), env);

    assert.equal(response.status, 400);
    assert.equal(statements.some(({ sql }) => sql.startsWith("UPDATE AlliancePlans")), false);
  });
});

test("alliance suggestions are idempotent and reject reused IDs with different content", async (t) => {
  const id = "a3e51255-39fb-4b41-b9e7-c0fba2a6ed63";
  const body = { id, teamId: 52, author: "Scout 1", reason: "Strong intake" };
  let saved = null;
  const resolve = (sql, values, operation) => {
    if (sql.includes("FROM Events WHERE Id = ?")) {
      return { id: 9, eventName: "Michigan Regional", seasonId: 2026 };
    }
    if (sql.includes("FROM AlliancePlanSuggestions WHERE Id = ?")) return saved;
    if (sql.includes("FROM EventTeams WHERE EventId = ?")) return [{ teamId: 52 }];
    if (sql.startsWith("INSERT INTO AlliancePlanSuggestions")) {
      saved = {
        id: values[0], eventId: values[1], teamId: values[2], author: values[3], reason: values[4],
        status: "Pending", hostResponse: "", createdAt: values[5], reviewedAt: null,
      };
      return { meta: { changes: 1 } };
    }
    return operation === "all" ? [] : null;
  };

  await t.test("saves once and safely replays the same suggestion", async () => {
    saved = null;
    const { env, statements } = createEnv(resolve);
    const makeRequest = () => authenticatedJsonRequest(
      "https://grizzly-platform.test/api/AlliancePlans/event/9/suggestions", "POST", body,
    );

    const firstResponse = await worker.fetch(makeRequest(), env);
    const replayResponse = await worker.fetch(makeRequest(), env);

    assert.equal(firstResponse.status, 200);
    assert.equal(replayResponse.status, 200);
    assert.equal((await replayResponse.json()).status, "Pending");
    assert.equal(statements.filter(({ sql }) => sql.startsWith("INSERT INTO AlliancePlanSuggestions")).length, 1);
  });

  await t.test("rejects an idempotency key reused for different data", async () => {
    saved = {
      id,
      eventId: 9,
      teamId: 52,
      author: "Scout 1",
      reason: "Different reason",
      status: "Pending",
      hostResponse: "",
      createdAt: "2026-09-26T11:00:00.000Z",
      reviewedAt: null,
    };
    const { env, statements } = createEnv(resolve);
    const response = await worker.fetch(authenticatedJsonRequest(
      "https://grizzly-platform.test/api/AlliancePlans/event/9/suggestions", "POST", body,
    ), env);
    assert.equal(response.status, 409);
    assert.equal(statements.some(({ sql }) => sql.startsWith("INSERT INTO AlliancePlanSuggestions")), false);
  });
});

test("alliance suggestion review checks the published-plan version and accepts atomically", async (t) => {
  const id = "a3e51255-39fb-4b41-b9e7-c0fba2a6ed63";
  const saved = {
    id,
    eventId: 9,
    teamId: 52,
    author: "Scout 1",
    reason: "Strong intake",
    status: "Pending",
    hostResponse: "",
    createdAt: "2026-09-26T11:00:00.000Z",
    reviewedAt: null,
  };

  await t.test("accepts to the wishlist and advances the plan version", async () => {
    let reviewed = { ...saved };
    const { env, statements } = createEnv((sql, values, operation) => {
      if (sql.startsWith("UPDATE AlliancePlans")) return { meta: { changes: 1 } };
      if (sql.startsWith("INSERT INTO AlliancePlanEntries")) return { meta: { changes: 1 } };
      if (sql.startsWith("UPDATE AlliancePlanSuggestions")) {
        reviewed = { ...reviewed, status: "Accepted", hostResponse: values[0], reviewedAt: values[1] };
        return { meta: { changes: 1 } };
      }
      if (sql.startsWith("SELECT") && sql.includes("FROM AlliancePlanSuggestions WHERE Id = ?")) return reviewed;
      if (sql.startsWith("SELECT") && sql.includes("FROM AlliancePlans WHERE EventId = ?")) {
        return { eventId: 9, version: 4, ourTeamId: null, firstPartnerId: null,
          secondPartnerId: null, notes: "", updatedAt: "2026-09-26T10:00:00.000Z" };
      }
      if (sql.startsWith("SELECT") && sql.includes("FROM AlliancePlanEntries")) return [];
      if (sql.includes("FROM EventTeams WHERE EventId = ?")) return [{ teamId: 52 }];
      return operation === "all" ? [] : { meta: { changes: 0 }, results: [] };
    });

    const response = await worker.fetch(authenticatedJsonRequest(
      `https://grizzly-platform.test/api/AlliancePlans/event/9/suggestions/${id}/review`,
      "POST",
      { version: 4, accept: true, hostResponse: "  Good pick  " },
    ), env);

    assert.equal(response.status, 200, `${await response.clone().text()}\n${JSON.stringify(statements.map(({ sql, values }) => [sql, values]))}`);
    assert.equal((await response.json()).status, "Accepted");
    assert.ok(statements.some(({ sql }) => sql.startsWith("INSERT INTO AlliancePlanEntries")));
    assert.equal(reviewed.hostResponse, "Good pick");
  });

  await t.test("does not review against a stale plan version", async () => {
    const { env, statements } = createEnv((sql) => {
      if (sql.includes("FROM AlliancePlanSuggestions WHERE Id = ?")) return saved;
      if (sql.includes("FROM AlliancePlans WHERE EventId = ?")) {
        return { eventId: 9, version: 5, ourTeamId: null, firstPartnerId: null,
          secondPartnerId: null, notes: "", updatedAt: null };
      }
      if (sql.includes("FROM AlliancePlanEntries")) return [];
      return [];
    });

    const response = await worker.fetch(authenticatedJsonRequest(
      `https://grizzly-platform.test/api/AlliancePlans/event/9/suggestions/${id}/review`,
      "POST",
      { version: 4, accept: false, hostResponse: "" },
    ), env);

    assert.equal(response.status, 409);
    assert.equal(statements.some(({ sql }) => sql.startsWith("UPDATE AlliancePlanSuggestions")), false);
  });
});
