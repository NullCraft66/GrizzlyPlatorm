const RESOURCES = ["teams", "matches", "rankings"] as const;

export type EventSyncResource = (typeof RESOURCES)[number];

export interface EventSyncJob {
  eventId: number;
  resource: EventSyncResource;
  revision: number;
}

type Row = Record<string, unknown>;

interface EventSyncEnvironment {
  DB: D1Database;
  EVENT_SYNC_QUEUE?: Queue<EventSyncJob>;
  TBA_API_KEY?: string;
}

interface SyncStateRow extends Row {
  eventId: number;
  resource: string;
  manualMode: number | boolean;
  revision: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastChangedAt: string | null;
  outcome: string;
  message: string;
  sourceEtag?: string | null;
}

interface TbaTeam {
  number: number;
  name: string;
  location: string;
}

interface TbaMatch {
  type: string;
  number: number;
  set: number;
  teamNumbers: number[];
  redScore: number | null;
  blueScore: number | null;
}

interface TbaRanking {
  teamNumber: number;
  rank: number;
  points: number;
  tie1: number | null;
  tie2: number | null;
}

class SourceError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

class InvalidSourceDataError extends Error {}

const pendingOutcomes = ["Queued", "Checking", "Retrying"];

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

async function all<T extends Row>(db: D1Database, sql: string, values: unknown[] = []): Promise<T[]> {
  const statement = db.prepare(sql);
  const result = values.length > 0
    ? await statement.bind(...values).all<T>()
    : await statement.all<T>();
  return result.results ?? [];
}

async function first<T extends Row>(db: D1Database, sql: string, values: unknown[] = []): Promise<T | null> {
  const statement = db.prepare(sql);
  return values.length > 0
    ? statement.bind(...values).first<T>()
    : statement.first<T>();
}

export async function getBlueAlliancePreview(
  db: D1Database,
  eventId: number,
  resource: "teams" | "matches",
  apiKey: string | undefined,
): Promise<Response> {
  const event = await first<{ blueAllianceKey: string | null }>(db,
    "SELECT BlueAllianceKey AS blueAllianceKey FROM Events WHERE Id = ?", [eventId]);
  if (!event) return new Response(null, { status: 404 });
  if (!event.blueAllianceKey?.trim()) {
    return textResponse("This event does not have a Blue Alliance key.", 400);
  }
  if (!apiKey?.trim()) return textResponse("The Blue Alliance API key is not configured.", 503);

  const url = `https://www.thebluealliance.com/api/v3/event/${encodeURIComponent(event.blueAllianceKey)}/${resource}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "X-TBA-Auth-Key": apiKey },
        signal: controller.signal,
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      return textResponse(
        timedOut ? "The Blue Alliance request timed out." : "The Blue Alliance request failed.",
        timedOut ? 504 : 502,
      );
    }

    if (!response.ok) {
      return textResponse(`The Blue Alliance returned HTTP ${response.status}.`, 502);
    }

    const body = await response.text();
    if (body.length > 5_000_000) return textResponse("The Blue Alliance response is too large to process.", 502);
    try {
      return json(JSON.parse(body));
    } catch {
      return textResponse("The Blue Alliance returned invalid JSON.", 502);
    }
  } catch {
    return textResponse("The Blue Alliance response could not be read.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeState(state: SyncStateRow): Record<string, unknown> {
  return {
    eventId: state.eventId,
    resource: state.resource,
    manualMode: state.manualMode === true || state.manualMode === 1,
    revision: state.revision,
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    lastChangedAt: state.lastChangedAt,
    outcome: state.outcome,
    message: state.message,
  };
}

function defaultState(eventId: number, resource: EventSyncResource): SyncStateRow {
  return {
    eventId,
    resource,
    manualMode: 0,
    revision: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastChangedAt: null,
    outcome: "Never",
    message: "No synchronization attempted yet.",
    sourceEtag: null,
  };
}

async function ensureState(db: D1Database, eventId: number, resource: EventSyncResource): Promise<void> {
  await db.prepare(`INSERT OR IGNORE INTO EventSyncStates
      (EventId, Resource, ManualMode, Revision, Outcome, Message)
      VALUES (?, ?, 0, 0, 'Never', 'No synchronization attempted yet.')`)
    .bind(eventId, resource)
    .run();
}

async function getState(
  db: D1Database,
  eventId: number,
  resource: EventSyncResource,
): Promise<SyncStateRow> {
  return await first<SyncStateRow>(db, `SELECT
      EventId AS eventId, Resource AS resource, ManualMode AS manualMode,
      Revision AS revision, LastAttemptAt AS lastAttemptAt,
      LastSuccessAt AS lastSuccessAt, LastChangedAt AS lastChangedAt,
      Outcome AS outcome, Message AS message, SourceEtag AS sourceEtag
    FROM EventSyncStates WHERE EventId = ? AND Resource = ?`, [eventId, resource])
    ?? defaultState(eventId, resource);
}

function resultChanges(result: unknown): number | null {
  const meta = (result as { meta?: { changes?: unknown } } | null)?.meta;
  return typeof meta?.changes === "number" ? meta.changes : null;
}

function didChange(result: unknown): boolean {
  const changes = resultChanges(result);
  // Wrangler/Miniflare return D1Result.meta.changes. Treat a missing mock value
  // as changed so isolated tests can focus on the contract under test.
  return changes === null || changes > 0;
}

function stateGuard(): string {
  return `EXISTS (
    SELECT 1 FROM EventSyncStates s
    WHERE s.EventId = ? AND s.Resource = ? AND s.Revision = ?
      AND s.ManualMode = 0 AND s.Outcome = 'Checking'
  )`;
}

function guardValues(job: EventSyncJob): unknown[] {
  return [job.eventId, job.resource, job.revision];
}

export async function queueEventSync(
  db: D1Database,
  queue: Queue<EventSyncJob> | undefined,
  eventId: number,
  resource: EventSyncResource,
): Promise<Response> {
  const event = await first<{ id: number; blueAllianceKey: string | null }>(db,
    "SELECT Id AS id, BlueAllianceKey AS blueAllianceKey FROM Events WHERE Id = ?", [eventId]);
  if (!event) return new Response(null, { status: 404 });

  await ensureState(db, eventId, resource);
  const current = await getState(db, eventId, resource);
  if (current.manualMode === true || current.manualMode === 1 || pendingOutcomes.includes(current.outcome)) {
    return json(normalizeState(current));
  }

  if (!event.blueAllianceKey?.trim()) {
    const now = new Date().toISOString();
    await db.prepare(`UPDATE EventSyncStates
        SET LastAttemptAt = ?, Outcome = 'Failed',
            Message = 'This event has no The Blue Alliance key. Manual data is available.'
      WHERE EventId = ? AND Resource = ? AND Revision = ? AND ManualMode = 0`)
      .bind(now, eventId, resource, current.revision)
      .run();
    return json(normalizeState(await getState(db, eventId, resource)));
  }

  if (!queue || typeof queue.send !== "function") {
    return json({ message: "The event synchronization queue is unavailable." }, 503);
  }

  const now = new Date().toISOString();
  const job: EventSyncJob = { eventId, resource, revision: current.revision };
  const marked = await db.prepare(`UPDATE EventSyncStates
      SET LastAttemptAt = ?, Outcome = 'Queued', Message = 'Queued for The Blue Alliance.'
    WHERE EventId = ? AND Resource = ? AND Revision = ? AND ManualMode = 0
      AND Outcome NOT IN ('Queued', 'Checking', 'Retrying')`)
    .bind(now, eventId, resource, current.revision)
    .run();

  if (!didChange(marked)) {
    return json(normalizeState(await getState(db, eventId, resource)));
  }

  try {
    await queue.send(job, { contentType: "json" });
  } catch {
    await db.prepare(`UPDATE EventSyncStates
        SET Outcome = 'Failed', Message = 'The event sync could not be queued. Saved data was kept.'
      WHERE EventId = ? AND Resource = ? AND Revision = ? AND ManualMode = 0 AND Outcome = 'Queued'`)
      .bind(eventId, resource, current.revision)
      .run();
    return json(normalizeState(await getState(db, eventId, resource)), 503);
  }

  return json({
    ...normalizeState(current),
    lastAttemptAt: now,
    outcome: "Queued",
    message: "Queued for The Blue Alliance.",
  }, 202);
}

export async function getEventOperations(db: D1Database, eventId: number): Promise<Response> {
  const event = await first<{ name: string; blueAllianceKey: string | null }>(db,
    "SELECT Name AS name, BlueAllianceKey AS blueAllianceKey FROM Events WHERE Id = ?", [eventId]);
  if (!event) return new Response(null, { status: 404 });

  const storedStates = await all<SyncStateRow>(db, `SELECT
      EventId AS eventId, Resource AS resource, ManualMode AS manualMode,
      Revision AS revision, LastAttemptAt AS lastAttemptAt,
      LastSuccessAt AS lastSuccessAt, LastChangedAt AS lastChangedAt,
      Outcome AS outcome, Message AS message
    FROM EventSyncStates WHERE EventId = ?`, [eventId]);
  const statesByResource = new Map(storedStates.map((state) => [state.resource, state]));
  const states = RESOURCES.map((resource) => normalizeState(
    statesByResource.get(resource) ?? defaultState(eventId, resource),
  ));

  const teams = await all<{ id: number; teamNumber: number; name: string }>(db, `SELECT
      t.Id AS id, t.TeamNumber AS teamNumber, t.Name AS name
    FROM Teams t
    WHERE t.Id IN (
      SELECT TeamId FROM EventTeams WHERE EventId = ?
      UNION SELECT TeamId FROM EventRankings WHERE EventId = ?
    )
    ORDER BY t.TeamNumber`, [eventId, eventId]);
  const matches = await all<Row>(db, `SELECT
      m.Id AS id, m.MatchType AS matchType, m.MatchNumber AS matchNumber,
      m.SetNumber AS setNumber, m.RedScore AS redScore, m.BlueScore AS blueScore,
      r1.TeamNumber AS red1, r2.TeamNumber AS red2, r3.TeamNumber AS red3,
      b1.TeamNumber AS blue1, b2.TeamNumber AS blue2, b3.TeamNumber AS blue3
    FROM Matches m
    JOIN Teams r1 ON r1.Id = m.RedTeam1Id
    JOIN Teams r2 ON r2.Id = m.RedTeam2Id
    JOIN Teams r3 ON r3.Id = m.RedTeam3Id
    JOIN Teams b1 ON b1.Id = m.BlueTeam1Id
    JOIN Teams b2 ON b2.Id = m.BlueTeam2Id
    JOIN Teams b3 ON b3.Id = m.BlueTeam3Id
    WHERE m.EventId = ?
    ORDER BY m.MatchNumber, m.SetNumber`, [eventId]);
  const rankings = await all<{ teamId: number; rank: number }>(db,
    "SELECT TeamId AS teamId, Rank AS rank FROM EventRankings WHERE EventId = ? ORDER BY Rank", [eventId]);

  return json({
    eventId,
    name: event.name,
    blueAllianceKey: event.blueAllianceKey,
    states,
    teams,
    matches: matches.map((match) => ({
      id: match.id,
      matchType: match.matchType,
      matchNumber: match.matchNumber,
      setNumber: match.setNumber,
      redScore: match.redScore,
      blueScore: match.blueScore,
      teamNumbers: [match.red1, match.red2, match.red3, match.blue1, match.blue2, match.blue3],
    })),
    rankings,
  });
}

export async function getEventRankings(db: D1Database, eventId: number): Promise<Response> {
  const event = await first<{ id: number }>(db, "SELECT Id AS id FROM Events WHERE Id = ?", [eventId]);
  if (!event) return new Response(null, { status: 404 });
  const rankings = await all<Row>(db, `SELECT
      r.Id AS id, r.EventId AS eventId, r.TeamId AS teamId,
      t.TeamNumber AS teamNumber, t.Name AS teamName, r.Rank AS rank,
      r.RankingPoints AS rankingPoints, r.TieBreaker1 AS tieBreaker1,
      r.TieBreaker2 AS tieBreaker2
    FROM EventRankings r JOIN Teams t ON t.Id = r.TeamId
    WHERE r.EventId = ? ORDER BY r.Rank`, [eventId]);
  if (rankings.length > 0) return json(rankings);

  const roster = await all<Row>(db, `SELECT
      0 AS id, et.EventId AS eventId, et.TeamId AS teamId,
      t.TeamNumber AS teamNumber, t.Name AS teamName
    FROM EventTeams et JOIN Teams t ON t.Id = et.TeamId
    WHERE et.EventId = ? ORDER BY t.TeamNumber`, [eventId]);
  return json(roster.map((team, index) => ({
    ...team,
    rank: index + 1,
    rankingPoints: 0,
    tieBreaker1: null,
    tieBreaker2: null,
  })));
}

function textResponse(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

async function readBody(request: Request): Promise<Row | null> {
  const length = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(length) && length > 32_768) return null;
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body as Row : null;
  } catch {
    return null;
  }
}

function property<T>(body: Row, camel: string, pascal: string): T | undefined {
  return (body[camel] ?? body[pascal]) as T | undefined;
}

function manualRevisionGuard(): string {
  return `EXISTS (
    SELECT 1 FROM EventSyncStates s
    WHERE s.EventId = ? AND s.Resource = ? AND s.Revision = ?
  )`;
}

function markManualStatement(
  db: D1Database,
  eventId: number,
  resource: EventSyncResource,
  revision: number,
  now: string,
): D1PreparedStatement {
  return db.prepare(`UPDATE EventSyncStates
      SET ManualMode = 1, Revision = Revision + 1, LastChangedAt = ?,
          Outcome = 'Manual',
          Message = 'Manual corrections saved. Automatic updates are paused for this category.'
    WHERE EventId = ? AND Resource = ? AND Revision = ?`)
    .bind(now, eventId, resource, revision);
}

async function eventExists(db: D1Database, eventId: number): Promise<boolean> {
  return (await first<{ id: number }>(db, "SELECT Id AS id FROM Events WHERE Id = ?", [eventId])) !== null;
}

export async function setEventSyncMode(
  request: Request,
  db: D1Database,
  eventId: number,
  resource: EventSyncResource,
): Promise<Response> {
  const body = await readBody(request);
  const revision = body && property<number>(body, "revision", "Revision");
  const manualMode = body && property<boolean>(body, "manualMode", "ManualMode");
  if (!Number.isSafeInteger(revision) || Number(revision) < 0 || typeof manualMode !== "boolean") {
    return textResponse("A valid revision and manual mode are required.", 400);
  }
  if (!await eventExists(db, eventId)) return new Response(null, { status: 404 });
  await ensureState(db, eventId, resource);
  const current = await getState(db, eventId, resource);
  if (current.revision !== revision) return textResponse("Data changed. Reload before changing sync mode.", 409);
  const message = manualMode
    ? "Automatic updates paused. Saved data is protected."
    : "Automatic updates resumed. The next successful sync may replace manual corrections.";
  const result = await db.prepare(`UPDATE EventSyncStates
      SET ManualMode = ?, Revision = Revision + 1,
          Outcome = ?, Message = ?
    WHERE EventId = ? AND Resource = ? AND Revision = ?`)
    .bind(manualMode ? 1 : 0, manualMode ? "Manual" : "Ready", message,
      eventId, resource, revision)
    .run();
  if (!didChange(result)) return textResponse("Data changed. Reload before changing sync mode.", 409);
  return json(normalizeState(await getState(db, eventId, resource)));
}

export async function addEventTeam(
  request: Request,
  db: D1Database,
  eventId: number,
): Promise<Response> {
  const body = await readBody(request);
  const revision = body && property<number>(body, "revision", "Revision");
  const teamNumber = body && property<number>(body, "teamNumber", "TeamNumber");
  const rawName = body && property<string>(body, "name", "Name");
  const name = typeof rawName === "string" ? rawName.trim() : "";
  if (!Number.isSafeInteger(revision) || Number(revision) < 0
      || !positiveInteger(teamNumber) || !name || name.length > 150) {
    return textResponse("Enter a positive team number and a name up to 150 characters.", 400);
  }
  if (!await eventExists(db, eventId)) return new Response(null, { status: 404 });
  await ensureState(db, eventId, "teams");
  const current = await getState(db, eventId, "teams");
  if (current.revision !== revision) return textResponse("Roster changed. Reload before saving.", 409);
  const team = await first<{ id: number; teamNumber: number; name: string }>(db,
    "SELECT Id AS id, TeamNumber AS teamNumber, Name AS name FROM Teams WHERE TeamNumber = ? LIMIT 1", [teamNumber]);
  if (team && await first(db, "SELECT Id AS id FROM EventTeams WHERE EventId = ? AND TeamId = ? LIMIT 1", [eventId, team.id])) {
    return textResponse("This team is already registered for the event.", 409);
  }

  const job: EventSyncJob = { eventId, resource: "teams", revision };
  const guard = manualRevisionGuard();
  const insertTeam = db.prepare(`INSERT INTO Teams (TeamNumber, Name, Location)
      SELECT ?, ?, ''
      WHERE NOT EXISTS (SELECT 1 FROM Teams WHERE TeamNumber = ?)
        AND ${guard}`)
    .bind(teamNumber, name, teamNumber, ...guardValues(job));
  const insertRoster = db.prepare(`INSERT INTO EventTeams (EventId, TeamId)
      SELECT ?, (SELECT Id FROM Teams WHERE TeamNumber = ? LIMIT 1)
      WHERE NOT EXISTS (
        SELECT 1 FROM EventTeams et JOIN Teams t ON t.Id = et.TeamId
        WHERE et.EventId = ? AND t.TeamNumber = ?
      ) AND ${guard}`)
    .bind(eventId, teamNumber, eventId, teamNumber, ...guardValues(job));
  const mark = markManualStatement(db, eventId, "teams", revision, new Date().toISOString());
  const results = await db.batch([insertTeam, insertRoster, mark]);
  if (!didChange(results[2])) return textResponse("Roster changed. Reload before saving.", 409);
  if (resultChanges(results[1]) === 0) return textResponse("This team is already registered for the event.", 409);
  const saved = await first<{ id: number; teamNumber: number; name: string }>(db,
    "SELECT Id AS id, TeamNumber AS teamNumber, Name AS name FROM Teams WHERE TeamNumber = ? LIMIT 1", [teamNumber]);
  return saved ? json(saved) : textResponse("The team could not be saved.", 500);
}

export async function addEventTeamRecord(request: Request, db: D1Database): Promise<Response> {
  const body = await readBody(request);
  const eventId = body && property<number>(body, "eventId", "EventId");
  const teamId = body && property<number>(body, "teamId", "TeamId");
  if (!positiveInteger(eventId) || !positiveInteger(teamId)) {
    return textResponse("A valid event and team are required.", 400);
  }
  if (!await eventExists(db, eventId)) return new Response(null, { status: 404 });
  const team = await first<{ id: number }>(db, "SELECT Id AS id FROM Teams WHERE Id = ?", [teamId]);
  if (!team) return textResponse("The selected team does not exist.", 400);
  if (await first(db, "SELECT Id AS id FROM EventTeams WHERE EventId = ? AND TeamId = ? LIMIT 1", [eventId, teamId])) {
    return textResponse("This team is already assigned to this event.", 409);
  }

  await ensureState(db, eventId, "teams");
  const current = await getState(db, eventId, "teams");
  const job: EventSyncJob = { eventId, resource: "teams", revision: current.revision };
  const insert = db.prepare(`INSERT INTO EventTeams (EventId, TeamId)
      SELECT ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM EventTeams WHERE EventId = ? AND TeamId = ?)
        AND ${manualRevisionGuard()}`)
    .bind(eventId, teamId, eventId, teamId, ...guardValues(job));
  const mark = markManualStatement(db, eventId, "teams", current.revision, new Date().toISOString());
  const results = await db.batch([insert, mark]);
  if (!didChange(results[1])) return textResponse("Roster changed. Reload before saving.", 409);
  if (resultChanges(results[0]) === 0) return textResponse("This team is already assigned to this event.", 409);
  const saved = await first<{ id: number }>(db,
    "SELECT Id AS id FROM EventTeams WHERE EventId = ? AND TeamId = ?", [eventId, teamId]);
  return saved ? json({ id: saved.id, eventId, teamId }) : textResponse("The team could not be assigned.", 500);
}

export async function deleteEventTeamRecord(db: D1Database, id: number): Promise<Response> {
  if (!positiveInteger(id)) return new Response(null, { status: 404 });
  const eventTeam = await first<{ eventId: number }>(db,
    "SELECT EventId AS eventId FROM EventTeams WHERE Id = ?", [id]);
  if (!eventTeam) return new Response(null, { status: 404 });
  await ensureState(db, eventTeam.eventId, "teams");
  const current = await getState(db, eventTeam.eventId, "teams");
  const job: EventSyncJob = { eventId: eventTeam.eventId, resource: "teams", revision: current.revision };
  const remove = db.prepare(`DELETE FROM EventTeams WHERE Id = ? AND ${manualRevisionGuard()}`)
    .bind(id, ...guardValues(job));
  const mark = markManualStatement(db, eventTeam.eventId, "teams", current.revision, new Date().toISOString());
  const results = await db.batch([remove, mark]);
  if (!didChange(results[1])) return textResponse("Roster changed. Reload before saving.", 409);
  if (resultChanges(results[0]) === 0) return new Response(null, { status: 404 });
  return new Response(null, { status: 204 });
}

export async function saveEventRankings(
  request: Request,
  db: D1Database,
  eventId: number,
): Promise<Response> {
  const body = await readBody(request);
  const revision = body && property<number>(body, "revision", "Revision");
  const teamIds = body && property<unknown>(body, "teamIds", "TeamIds");
  if (!Number.isSafeInteger(revision) || Number(revision) < 0 || !Array.isArray(teamIds)
      || teamIds.length === 0 || teamIds.some((id) => !Number.isSafeInteger(id) || Number(id) <= 0)
      || new Set(teamIds).size !== teamIds.length) {
    return textResponse("Enter each event team exactly once.", 400);
  }
  if (!await eventExists(db, eventId)) return new Response(null, { status: 404 });
  await ensureState(db, eventId, "rankings");
  const currentState = await getState(db, eventId, "rankings");
  if (currentState.revision !== revision) return textResponse("Rankings changed. Reload before saving.", 409);
  const currentRows = await all<Row>(db, `SELECT TeamId AS teamId, Rank AS rank,
      RankingPoints AS rankingPoints, TieBreaker1 AS tieBreaker1, TieBreaker2 AS tieBreaker2
    FROM EventRankings WHERE EventId = ?`, [eventId]);
  const roster = await all<{ teamId: number }>(db,
    "SELECT TeamId AS teamId FROM EventTeams WHERE EventId = ?", [eventId]);
  const expected = new Set([...roster.map((row) => row.teamId), ...currentRows.map((row) => Number(row.teamId))]);
  if (expected.size !== teamIds.length || teamIds.some((id) => !expected.has(Number(id)))) {
    return textResponse("The order must include all registered/ranked event teams, with no other teams.", 400);
  }

  const prior = new Map(currentRows.map((row) => [Number(row.teamId), row]));
  const rows = teamIds.map((id, index) => {
    const saved = prior.get(Number(id));
    return [eventId, Number(id), index + 1, Number(saved?.rankingPoints ?? 0),
      saved?.tieBreaker1 == null ? null : Number(saved.tieBreaker1),
      saved?.tieBreaker2 == null ? null : Number(saved.tieBreaker2)];
  });
  const job: EventSyncJob = { eventId, resource: "rankings", revision };
  const guard = manualRevisionGuard();
  const remove = db.prepare(`DELETE FROM EventRankings WHERE EventId = ? AND ${guard}`)
    .bind(eventId, ...guardValues(job));
  const insert = db.prepare(`WITH incoming(EventId, TeamId, Rank, RankingPoints, TieBreaker1, TieBreaker2) AS (
      VALUES ${placeholders(rows.length, 6)}
    )
    INSERT INTO EventRankings (EventId, TeamId, Rank, RankingPoints, TieBreaker1, TieBreaker2)
    SELECT i.EventId, i.TeamId, i.Rank, i.RankingPoints, i.TieBreaker1, i.TieBreaker2
      FROM incoming i WHERE ${guard}`)
    .bind(...rows.flat(), ...guardValues(job));
  const mark = markManualStatement(db, eventId, "rankings", revision, new Date().toISOString());
  const results = await db.batch([remove, insert, mark]);
  if (!didChange(results[2])) return textResponse("Rankings changed. Reload before saving.", 409);
  return json({ message: "Manual ranking order saved. Existing alliance drafts retain their saved order." });
}

export async function saveEventMatch(
  request: Request,
  db: D1Database,
  eventId: number,
): Promise<Response> {
  const body = await readBody(request);
  const revision = body && property<number>(body, "revision", "Revision");
  const id = body && property<number>(body, "id", "Id");
  const matchType = body && property<string>(body, "matchType", "MatchType");
  const matchNumber = body && property<number>(body, "matchNumber", "MatchNumber");
  const setNumber = body && property<number>(body, "setNumber", "SetNumber");
  const teamNumbers = body && property<unknown>(body, "teamNumbers", "TeamNumbers");
  const rawRedScore = body && property<number | null>(body, "redScore", "RedScore");
  const rawBlueScore = body && property<number | null>(body, "blueScore", "BlueScore");
  const redScore = rawRedScore ?? null;
  const blueScore = rawBlueScore ?? null;
  const matchTypes = ["Qualification", "EighthFinal", "Quarterfinal", "Semifinal", "Final"];
  if (!Number.isSafeInteger(revision) || Number(revision) < 0
      || !Number.isSafeInteger(id) || Number(id) < 0
      || typeof matchType !== "string" || !matchTypes.includes(matchType)
      || !positiveInteger(matchNumber) || !Number.isSafeInteger(setNumber) || Number(setNumber) < 0
      || !Array.isArray(teamNumbers) || teamNumbers.length !== 6
      || teamNumbers.some((number) => !positiveInteger(number))
      || new Set(teamNumbers).size !== 6
      || (redScore !== null && (!Number.isSafeInteger(redScore) || redScore < 0))
      || (blueScore !== null && (!Number.isSafeInteger(blueScore) || blueScore < 0))
      || (redScore === null) !== (blueScore === null)) {
    return textResponse("Enter a valid match type, number, set, six team numbers, and scores.", 400);
  }
  if (!await eventExists(db, eventId)) return textResponse("Event not found.", 400);
  await ensureState(db, eventId, "matches");
  const currentState = await getState(db, eventId, "matches");
  if (currentState.revision !== revision) return textResponse("Schedule changed. Reload before saving.", 409);

  const numbers = teamNumbers as number[];
  const teams = await all<{ id: number; teamNumber: number }>(db,
    `SELECT Id AS id, TeamNumber AS teamNumber FROM Teams
      WHERE TeamNumber IN (${numbers.map(() => "?").join(", ")})`, numbers);
  const idsByNumber = new Map(teams.map((team) => [team.teamNumber, team.id]));
  if (numbers.some((number) => !idsByNumber.has(number))) {
    return textResponse("Choose six different teams registered or ranked at this event.", 400);
  }
  const roster = new Set((await all<{ teamId: number }>(db, `SELECT TeamId AS teamId FROM EventTeams WHERE EventId = ?
    UNION SELECT TeamId AS teamId FROM EventRankings WHERE EventId = ?`, [eventId, eventId])).map((row) => row.teamId));
  const teamIds = numbers.map((number) => idsByNumber.get(number)!);
  if (teamIds.some((teamId) => !roster.has(teamId))) {
    return textResponse("Choose six different teams registered or ranked at this event.", 400);
  }

  const existing = id === 0 ? null : await first<Row>(db, `SELECT
      Id AS id, EventId AS eventId, MatchType AS matchType, MatchNumber AS matchNumber,
      SetNumber AS setNumber, RedTeam1Id AS red1, RedTeam2Id AS red2, RedTeam3Id AS red3,
      BlueTeam1Id AS blue1, BlueTeam2Id AS blue2, BlueTeam3Id AS blue3
    FROM Matches WHERE Id = ?`, [id]);
  if (id !== 0 && !existing) return new Response(null, { status: 404 });
  if (existing && Number(existing.eventId) !== eventId) return textResponse("A match cannot be moved to another event.", 400);

  const duplicate = await first<{ id: number }>(db, `SELECT Id AS id FROM Matches
      WHERE EventId = ? AND MatchType = ? AND MatchNumber = ? AND SetNumber = ? AND Id != ? LIMIT 1`,
    [eventId, matchType, matchNumber, setNumber, id]);
  if (duplicate) return textResponse(id === 0
    ? "This match already exists. Edit it instead."
    : "That match number/type/set already exists.", 409);

  if (existing) {
    const hasSubmissions = await first(db,
      "SELECT Id AS id FROM GameFormSubmissions WHERE MatchId = ? LIMIT 1", [id]);
    const previousIds = [existing.red1, existing.red2, existing.red3, existing.blue1, existing.blue2, existing.blue3].map(Number);
    const identityChanged = existing.matchType !== matchType || Number(existing.matchNumber) !== matchNumber
      || Number(existing.setNumber) !== setNumber || previousIds.some((teamId, index) => teamId !== teamIds[index]);
    if (hasSubmissions && identityChanged) {
      return textResponse("This match has scouting submissions. Only its scores can be edited.", 400);
    }
  }

  const job: EventSyncJob = { eventId, resource: "matches", revision };
  const guard = manualRevisionGuard();
  const winner = allianceWinner(redScore, blueScore);
  const savedId = Number(id);
  const write = existing
    ? db.prepare(`UPDATE Matches SET MatchType = ?, MatchNumber = ?, SetNumber = ?,
        RedTeam1Id = ?, RedTeam2Id = ?, RedTeam3Id = ?,
        BlueTeam1Id = ?, BlueTeam2Id = ?, BlueTeam3Id = ?,
        RedScore = ?, BlueScore = ?, WinningAlliance = ?
      WHERE Id = ? AND EventId = ? AND ${guard}`)
      .bind(matchType, matchNumber, setNumber, ...teamIds, redScore, blueScore, winner,
        savedId, eventId, ...guardValues(job))
    : db.prepare(`INSERT INTO Matches (EventId, MatchType, MatchNumber, SetNumber,
        RedTeam1Id, RedTeam2Id, RedTeam3Id, BlueTeam1Id, BlueTeam2Id, BlueTeam3Id,
        RedScore, BlueScore, WinningAlliance)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}`)
      .bind(eventId, matchType, matchNumber, setNumber, ...teamIds, redScore, blueScore, winner,
        ...guardValues(job));
  const mark = markManualStatement(db, eventId, "matches", revision, new Date().toISOString());
  const results = await db.batch([write, mark]);
  if (!didChange(results[1])) return textResponse("Schedule changed. Reload before saving.", 409);
  if (id !== 0) return json({ id });
  const created = await first<{ id: number }>(db, `SELECT Id AS id FROM Matches
      WHERE EventId = ? AND MatchType = ? AND MatchNumber = ? AND SetNumber = ?`,
    [eventId, matchType, matchNumber, setNumber]);
  return created ? json({ id: created.id }) : textResponse("The match could not be saved.", 500);
}

interface ApiMatchInput {
  eventId: number;
  matchType: string;
  matchNumber: number;
  setNumber: number;
  teamIds: number[];
  redScore: number | null;
  blueScore: number | null;
}

function apiMatchInput(body: Row): ApiMatchInput | null {
  const rawEventId = property<unknown>(body, "eventId", "EventId");
  const rawMatchType = property<unknown>(body, "matchType", "MatchType");
  const rawMatchNumber = property<unknown>(body, "matchNumber", "MatchNumber");
  const rawSetNumber = property<unknown>(body, "setNumber", "SetNumber");
  const eventId = rawEventId === undefined ? 0 : rawEventId;
  const matchType = rawMatchType === undefined ? "Qualification" : rawMatchType;
  const matchNumber = rawMatchNumber === undefined ? 0 : rawMatchNumber;
  const setNumber = rawSetNumber === undefined ? 0 : rawSetNumber;
  const teamIds = [
    property<unknown>(body, "redTeam1Id", "RedTeam1Id"),
    property<unknown>(body, "redTeam2Id", "RedTeam2Id"),
    property<unknown>(body, "redTeam3Id", "RedTeam3Id"),
    property<unknown>(body, "blueTeam1Id", "BlueTeam1Id"),
    property<unknown>(body, "blueTeam2Id", "BlueTeam2Id"),
    property<unknown>(body, "blueTeam3Id", "BlueTeam3Id"),
  ];
  const redScore = property<unknown>(body, "redScore", "RedScore");
  const blueScore = property<unknown>(body, "blueScore", "BlueScore");
  const winningAlliance = property<unknown>(body, "winningAlliance", "WinningAlliance");
  const normalizedTeamIds = teamIds.map((teamId) => teamId === undefined ? 0 : teamId);
  if (!positiveInteger(eventId) || typeof matchType !== "string"
      || !isInteger(matchNumber) || !isInteger(setNumber)
      || normalizedTeamIds.some((teamId) => !isInteger(teamId))
      || (redScore != null && !isInteger(redScore))
      || (blueScore != null && !isInteger(blueScore))
      || (winningAlliance != null && typeof winningAlliance !== "string")) {
    return null;
  }
  return {
    eventId,
    matchType,
    matchNumber,
    setNumber,
    teamIds: normalizedTeamIds as number[],
    redScore: redScore == null ? null : redScore,
    blueScore: blueScore == null ? null : blueScore,
  };
}

async function validateApiMatch(db: D1Database, input: ApiMatchInput): Promise<string | null> {
  if (!await eventExists(db, input.eventId)) return "Event not found.";
  if (!["Qualification", "EighthFinal", "Quarterfinal", "Semifinal", "Final"].includes(input.matchType)
      || !positiveInteger(input.matchNumber) || !isInteger(input.setNumber) || input.setNumber < 0) {
    return "Enter a valid match type, number, and set.";
  }
  const roster = new Set((await all<{ teamId: number }>(db, `SELECT TeamId AS teamId FROM EventTeams WHERE EventId = ?
    UNION SELECT TeamId AS teamId FROM EventRankings WHERE EventId = ?`, [input.eventId, input.eventId]))
    .map((row) => Number(row.teamId)));
  if (new Set(input.teamIds).size !== 6 || input.teamIds.some((teamId) => !positiveInteger(teamId) || !roster.has(teamId))) {
    return "Choose six different teams registered or ranked at this event.";
  }
  if ((input.redScore !== null && input.redScore < 0)
      || (input.blueScore !== null && input.blueScore < 0)
      || (input.redScore === null) !== (input.blueScore === null)) {
    return "Leave both scores blank for an unplayed match, or enter two nonnegative scores.";
  }
  return null;
}

async function saveApiMatch(
  request: Request,
  db: D1Database,
  matchId: number | null,
  expectedRevision?: number,
): Promise<Response> {
  const body = await readBody(request);
  const input = body && apiMatchInput(body);
  if (!input) return textResponse("A valid match request is required.", 400);

  let existing: Row | null = null;
  if (matchId !== null) {
    existing = await first<Row>(db, `SELECT Id AS id, EventId AS eventId, MatchType AS matchType,
        MatchNumber AS matchNumber, SetNumber AS setNumber,
        RedTeam1Id AS red1, RedTeam2Id AS red2, RedTeam3Id AS red3,
        BlueTeam1Id AS blue1, BlueTeam2Id AS blue2, BlueTeam3Id AS blue3
      FROM Matches WHERE Id = ?`, [matchId]);
    if (!existing) return new Response(null, { status: 404 });
    if (Number(existing.eventId) !== input.eventId) {
      return textResponse("A match cannot be moved to another event.", 400);
    }
  }

  const error = await validateApiMatch(db, input);
  if (error) return textResponse(error, 400);

  await ensureState(db, input.eventId, "matches");
  const currentState = await getState(db, input.eventId, "matches");
  if (expectedRevision !== undefined && expectedRevision !== currentState.revision) {
    return textResponse("Schedule changed. Reload before saving.", 409);
  }

  const duplicate = await first<{ id: number }>(db, `SELECT Id AS id FROM Matches
      WHERE EventId = ? AND MatchType = ? AND MatchNumber = ? AND SetNumber = ? AND Id != ? LIMIT 1`,
    [input.eventId, input.matchType, input.matchNumber, input.setNumber, matchId ?? 0]);
  if (duplicate) {
    return textResponse(matchId === null
      ? "This match already exists. Edit it instead."
      : "That match number/type/set already exists.", 409);
  }

  if (existing) {
    const hasSubmissions = await first(db,
      "SELECT Id AS id FROM GameFormSubmissions WHERE MatchId = ? LIMIT 1", [matchId]);
    const previousIds = [existing.red1, existing.red2, existing.red3, existing.blue1, existing.blue2, existing.blue3]
      .map(Number);
    const identityChanged = existing.matchType !== input.matchType
      || Number(existing.matchNumber) !== input.matchNumber
      || Number(existing.setNumber) !== input.setNumber
      || previousIds.some((teamId, index) => teamId !== input.teamIds[index]);
    if (hasSubmissions && identityChanged) {
      return textResponse("This match has scouting submissions. Only its scores can be edited.", 400);
    }
  }

  const revision = currentState.revision;
  const now = new Date().toISOString();
  const winner = allianceWinner(input.redScore, input.blueScore);
  const write = existing
    ? db.prepare(`UPDATE Matches SET MatchType = ?, MatchNumber = ?, SetNumber = ?,
        RedTeam1Id = ?, RedTeam2Id = ?, RedTeam3Id = ?,
        BlueTeam1Id = ?, BlueTeam2Id = ?, BlueTeam3Id = ?,
        RedScore = ?, BlueScore = ?, WinningAlliance = ?
      WHERE Id = ? AND EventId = ? AND EXISTS (
        SELECT 1 FROM EventSyncStates s
        WHERE s.EventId = ? AND s.Resource = 'matches' AND s.Revision = ?
      )`)
      .bind(input.matchType, input.matchNumber, input.setNumber, ...input.teamIds,
        input.redScore, input.blueScore, winner, matchId, input.eventId, input.eventId, revision)
    : db.prepare(`INSERT INTO Matches (EventId, MatchType, MatchNumber, SetNumber,
        RedTeam1Id, RedTeam2Id, RedTeam3Id, BlueTeam1Id, BlueTeam2Id, BlueTeam3Id,
        RedScore, BlueScore, WinningAlliance)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM EventSyncStates s
        WHERE s.EventId = ? AND s.Resource = 'matches' AND s.Revision = ?
      )`)
      .bind(input.eventId, input.matchType, input.matchNumber, input.setNumber, ...input.teamIds,
        input.redScore, input.blueScore, winner, input.eventId, revision);
  const mark = db.prepare(`UPDATE EventSyncStates
      SET ManualMode = 1, Revision = Revision + 1, LastChangedAt = ?, Outcome = 'Manual',
          Message = 'Manual corrections saved. Automatic updates are paused for this category.'
    WHERE EventId = ? AND Resource = 'matches' AND Revision = ? AND changes() > 0`)
    .bind(now, input.eventId, revision);
  const results = await db.batch([write, mark]);
  if (!didChange(results[0])) {
    if (matchId !== null && !await first(db, "SELECT Id AS id FROM Matches WHERE Id = ?", [matchId])) {
      return new Response(null, { status: 404 });
    }
    return textResponse("Schedule changed. Reload before saving.", 409);
  }
  if (!didChange(results[1])) return textResponse("Schedule changed. Reload before saving.", 409);

  if (matchId !== null) return json({ id: matchId });
  const created = await first<{ id: number }>(db, `SELECT Id AS id FROM Matches
      WHERE EventId = ? AND MatchType = ? AND MatchNumber = ? AND SetNumber = ?`,
    [input.eventId, input.matchType, input.matchNumber, input.setNumber]);
  return created
    ? new Response(JSON.stringify({ id: created.id }), {
      status: 201,
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8",
        Location: `/api/Matches/${created.id}` },
    })
    : textResponse("The match could not be saved.", 500);
}

export async function createMatch(
  request: Request,
  db: D1Database,
  revision?: number,
): Promise<Response> {
  return await saveApiMatch(request, db, null, revision);
}

export async function updateMatch(
  request: Request,
  db: D1Database,
  id: number,
  revision?: number,
): Promise<Response> {
  return await saveApiMatch(request, db, id, revision);
}

export async function deleteMatch(db: D1Database, id: number): Promise<Response> {
  if (!positiveInteger(id)) return new Response(null, { status: 404 });
  const match = await first<{ id: number; eventId: number }>(db,
    "SELECT Id AS id, EventId AS eventId FROM Matches WHERE Id = ?", [id]);
  if (!match) return new Response(null, { status: 404 });
  if (await first(db, "SELECT Id AS id FROM GameFormSubmissions WHERE MatchId = ? LIMIT 1", [id])) {
    return textResponse("A match with scouting submissions cannot be deleted.", 400);
  }

  const eventId = Number(match.eventId);
  await ensureState(db, eventId, "matches");
  const currentState = await getState(db, eventId, "matches");
  const revision = currentState.revision;
  const now = new Date().toISOString();
  const remove = db.prepare(`DELETE FROM Matches WHERE Id = ? AND EXISTS (
      SELECT 1 FROM EventSyncStates s
      WHERE s.EventId = ? AND s.Resource = 'matches' AND s.Revision = ?
    ) AND NOT EXISTS (SELECT 1 FROM GameFormSubmissions WHERE MatchId = ?)`)
    .bind(id, eventId, revision, id);
  const mark = db.prepare(`UPDATE EventSyncStates
      SET ManualMode = 1, Revision = Revision + 1, LastChangedAt = ?, Outcome = 'Manual',
          Message = 'Manual corrections saved. Automatic updates are paused for this category.'
    WHERE EventId = ? AND Resource = 'matches' AND Revision = ? AND changes() > 0`)
    .bind(now, eventId, revision);
  const results = await db.batch([remove, mark]);
  if (!didChange(results[0])) {
    if (await first(db, "SELECT Id AS id FROM GameFormSubmissions WHERE MatchId = ? LIMIT 1", [id])) {
      return textResponse("A match with scouting submissions cannot be deleted.", 400);
    }
    if (!await first(db, "SELECT Id AS id FROM Matches WHERE Id = ?", [id])) {
      return new Response(null, { status: 404 });
    }
    return textResponse("Schedule changed. Reload before saving.", 409);
  }
  if (!didChange(results[1])) return textResponse("Schedule changed. Reload before saving.", 409);
  return new Response(null, { status: 204 });
}

function parseArray(value: unknown, message: string): Row[] {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !item || typeof item !== "object" || Array.isArray(item))) {
    throw new InvalidSourceDataError(message);
  }
  return value as Row[];
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function teamNumberFromKey(value: unknown): number {
  if (typeof value !== "string" || !/^frc[1-9]\d*$/.test(value)) {
    throw new InvalidSourceDataError("The Blue Alliance returned an invalid team key.");
  }
  const number = Number(value.slice(3));
  if (!Number.isSafeInteger(number)) throw new InvalidSourceDataError("The Blue Alliance returned an invalid team key.");
  return number;
}

function parseTeams(value: unknown): TbaTeam[] {
  const source = parseArray(value, "The Blue Alliance returned no usable teams.");
  const teams = source.map((team) => {
    if (!positiveInteger(team.team_number)) throw new InvalidSourceDataError("The Blue Alliance returned an invalid team number.");
    const place = [team.city, team.state_prov, team.country]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .join(", ");
    return {
      number: team.team_number,
      name: typeof team.nickname === "string" && team.nickname.trim() ? team.nickname.trim() : `Team ${team.team_number}`,
      location: place,
    };
  });
  if (new Set(teams.map((team) => team.number)).size !== teams.length) {
    throw new InvalidSourceDataError("The Blue Alliance returned duplicate teams.");
  }
  return teams;
}

function parseScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < -1) {
    throw new InvalidSourceDataError("The Blue Alliance returned an invalid match score.");
  }
  return value === -1 ? null : value;
}

function parseMatches(value: unknown): TbaMatch[] {
  const source = parseArray(value, "The Blue Alliance returned no usable matches.");
  const typeNames: Record<string, string> = {
    qm: "Qualification",
    ef: "EighthFinal",
    qf: "Quarterfinal",
    sf: "Semifinal",
    f: "Final",
  };
  const matches = source.map((match) => {
    const compLevel = match.comp_level;
    const type = typeof compLevel === "string" ? typeNames[compLevel] : undefined;
    const number = match.match_number;
    const set = match.set_number;
    if (!type || !positiveInteger(number) || typeof set !== "number" || !Number.isSafeInteger(set) || set < 0) {
      throw new InvalidSourceDataError("The Blue Alliance returned an invalid match identity.");
    }
    const alliances = match.alliances;
    const red = alliances && typeof alliances === "object" ? (alliances as Row).red as Row | undefined : undefined;
    const blue = alliances && typeof alliances === "object" ? (alliances as Row).blue as Row | undefined : undefined;
    const redSource = red?.team_keys;
    const blueSource = blue?.team_keys;
    if (!Array.isArray(redSource) || !Array.isArray(blueSource) || redSource.length !== 3 || blueSource.length !== 3) {
      throw new InvalidSourceDataError("A match must contain three red teams and three blue teams.");
    }
    const teamNumbers = [...redSource, ...blueSource].map(teamNumberFromKey);
    if (new Set(teamNumbers).size !== 6) throw new InvalidSourceDataError("A match contains duplicate teams.");
    const redScore = parseScore(red?.score);
    const blueScore = parseScore(blue?.score);
    if ((redScore === null) !== (blueScore === null)) throw new InvalidSourceDataError("The Blue Alliance returned incomplete match scores.");
    return { type, number, set, teamNumbers, redScore, blueScore };
  });
  const identities = matches.map((match) => `${match.type}:${match.number}:${match.set}`);
  if (new Set(identities).size !== identities.length) throw new InvalidSourceDataError("The Blue Alliance returned duplicate matches.");
  return matches;
}

function parseRankings(value: unknown): TbaRanking[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new InvalidSourceDataError("The Blue Alliance returned invalid rankings.");
  }
  const root = value as Row;
  const source = parseArray(root.rankings, "The Blue Alliance returned no rankings.");
  const rankings = source.map((row) => {
    const rank = row.rank;
    if (!positiveInteger(rank)) throw new InvalidSourceDataError("The Blue Alliance returned an invalid ranking order.");
    let points = 0;
    if (Array.isArray(row.extra_stats) && row.extra_stats.length > 0 && Number.isInteger(row.extra_stats[0])) {
      points = row.extra_stats[0] as number;
    }
    const sortOrders = Array.isArray(row.sort_orders) ? row.sort_orders : [];
    const tie = (index: number): number | null => {
      const entry = sortOrders[index];
      return typeof entry === "number" && Number.isFinite(entry) ? entry : null;
    };
    return {
      teamNumber: teamNumberFromKey(row.team_key),
      rank,
      points,
      tie1: tie(1),
      tie2: tie(2),
    };
  });
  const ranks = rankings.map((row) => row.rank).sort((a, b) => a - b);
  if (new Set(rankings.map((row) => row.teamNumber)).size !== rankings.length
      || ranks.some((rank, index) => rank !== index + 1)) {
    throw new InvalidSourceDataError("The Blue Alliance returned an incomplete or duplicate ranking order.");
  }
  return rankings;
}

function placeholders(count: number, columns: number): string {
  return Array.from({ length: count }, () => `(${Array.from({ length: columns }, () => "?").join(", ")})`).join(", ");
}

async function makeTeamChanges(
  db: D1Database,
  job: EventSyncJob,
  rows: TbaTeam[],
): Promise<{ statements: D1PreparedStatement[]; changed: number }> {
  const existing = new Set((await all<{ teamNumber: number }>(db, `SELECT t.TeamNumber AS teamNumber
      FROM EventTeams et JOIN Teams t ON t.Id = et.TeamId
      WHERE et.EventId = ?`, [job.eventId])).map((row) => row.teamNumber));
  const changed = rows.filter((row) => !existing.has(row.number)).length;
  const guard = stateGuard();
  const teamInsert = db.prepare(`WITH incoming(TeamNumber, Name, Location) AS (
      VALUES ${placeholders(rows.length, 3)}
    )
    INSERT INTO Teams (TeamNumber, Name, Location)
    SELECT i.TeamNumber, i.Name, i.Location
      FROM incoming i
     WHERE NOT EXISTS (SELECT 1 FROM Teams t WHERE t.TeamNumber = i.TeamNumber)
       AND ${guard}`)
    .bind(...rows.flatMap((row) => [row.number, row.name, row.location]), ...guardValues(job));

  const rosterInsert = db.prepare(`WITH incoming(TeamNumber) AS (
      VALUES ${rows.map(() => "(?)").join(", ")}
    )
    INSERT INTO EventTeams (EventId, TeamId)
    SELECT ?, t.Id
      FROM incoming i JOIN Teams t ON t.TeamNumber = i.TeamNumber
     WHERE NOT EXISTS (
       SELECT 1 FROM EventTeams et WHERE et.EventId = ? AND et.TeamId = t.Id
     )
       AND ${guard}`)
    .bind(...rows.map((row) => row.number), job.eventId, job.eventId, ...guardValues(job));
  return { statements: [teamInsert, rosterInsert], changed };
}

function allianceWinner(redScore: number | null, blueScore: number | null): string {
  if (redScore === null || blueScore === null || redScore === blueScore) return "";
  return redScore > blueScore ? "red" : "blue";
}

async function prepareMatchStatements(
  db: D1Database,
  job: EventSyncJob,
  rows: TbaMatch[],
): Promise<{ statements: D1PreparedStatement[]; changed: number }> {
  const teamNumbers = [...new Set(rows.flatMap((row) => row.teamNumbers))];
  const teams = await all<{ id: number; teamNumber: number }>(db,
    `SELECT Id AS id, TeamNumber AS teamNumber FROM Teams
      WHERE TeamNumber IN (${teamNumbers.map(() => "?").join(", ")})`, teamNumbers);
  const teamIds = new Map(teams.map((team) => [team.teamNumber, team.id]));
  if (teamNumbers.some((number) => !teamIds.has(number))) {
    throw new InvalidSourceDataError("Some scheduled teams are missing locally. Sync teams first.");
  }

  const existing = await all<Row>(db, `SELECT
      Id AS id, MatchType AS matchType, MatchNumber AS matchNumber,
      SetNumber AS setNumber, RedScore AS redScore, BlueScore AS blueScore,
      RedTeam1Id AS red1, RedTeam2Id AS red2, RedTeam3Id AS red3,
      BlueTeam1Id AS blue1, BlueTeam2Id AS blue2, BlueTeam3Id AS blue3
    FROM Matches WHERE EventId = ?`, [job.eventId]);
  const identity = (type: string, number: number, set: number) => `${type}:${number}:${set}`;
  const existingByKey = new Map(existing.map((row) => [
    identity(String(row.matchType), Number(row.matchNumber), Number(row.setNumber)), row,
  ]));
  if (existing.some((row) => !rows.some((match) => identity(match.type, match.number, match.set)
      === identity(String(row.matchType), Number(row.matchNumber), Number(row.setNumber))))) {
    throw new InvalidSourceDataError("The schedule is missing previously saved matches. Saved data was kept.");
  }

  const ids = existing.map((row) => Number(row.id));
  const submittedIds = ids.length === 0 ? new Set<number>() : new Set((await all<{ matchId: number }>(db, `SELECT DISTINCT s.MatchId AS matchId
      FROM GameFormSubmissions s JOIN Matches m ON m.Id = s.MatchId
      WHERE m.EventId = ? AND s.MatchId IS NOT NULL`, [job.eventId])).map((row) => row.matchId));

  const changedRows: TbaMatch[] = [];
  for (const match of rows) {
    const old = existingByKey.get(identity(match.type, match.number, match.set));
    const mappedIds = match.teamNumbers.map((number) => teamIds.get(number)!);
    if (old) {
      const previousIds = [old.red1, old.red2, old.red3, old.blue1, old.blue2, old.blue3].map(Number);
      if (submittedIds.has(Number(old.id)) && previousIds.some((id, index) => id !== mappedIds[index])) {
        throw new InvalidSourceDataError("The source changed teams for a match with scouting submissions. Review the schedule manually.");
      }
      if (old.redScore !== null && old.redScore !== undefined && match.redScore === null) {
        throw new InvalidSourceDataError("The source returned unplayed scores for a completed match.");
      }
      if (previousIds.every((id, index) => id === mappedIds[index])
          && (old.redScore ?? null) === match.redScore && (old.blueScore ?? null) === match.blueScore) continue;
    }
    changedRows.push(match);
  }

  const statements: D1PreparedStatement[] = [];
  const guard = stateGuard();
  // Keep statements comfortably below SQLite's bind-variable limit while
  // still applying each chunk atomically with the final sync-state update.
  for (let start = 0; start < changedRows.length; start += 60) {
    const chunk = changedRows.slice(start, start + 60);
    const columns = ["EventId", "MatchType", "MatchNumber", "SetNumber", "RedScore", "BlueScore", "WinningAlliance",
      "RedTeam1Id", "RedTeam2Id", "RedTeam3Id", "BlueTeam1Id", "BlueTeam2Id", "BlueTeam3Id"];
    const sql = `WITH incoming(${columns.join(", ")}) AS (
        VALUES ${placeholders(chunk.length, columns.length)}
      )
      INSERT INTO Matches (${columns.join(", ")})
      SELECT ${columns.map((column) => `i.${column}`).join(", ")}
        FROM incoming i WHERE ${guard}
      ON CONFLICT (EventId, MatchType, MatchNumber, SetNumber) DO UPDATE SET
        RedScore = excluded.RedScore, BlueScore = excluded.BlueScore,
        WinningAlliance = excluded.WinningAlliance,
        RedTeam1Id = excluded.RedTeam1Id, RedTeam2Id = excluded.RedTeam2Id,
        RedTeam3Id = excluded.RedTeam3Id, BlueTeam1Id = excluded.BlueTeam1Id,
        BlueTeam2Id = excluded.BlueTeam2Id, BlueTeam3Id = excluded.BlueTeam3Id
      WHERE ${guard}`;
    const values: unknown[] = [];
    for (const match of chunk) {
      const idsForMatch = match.teamNumbers.map((number) => teamIds.get(number)!);
      values.push(job.eventId, match.type, match.number, match.set, match.redScore,
        match.blueScore, allianceWinner(match.redScore, match.blueScore), ...idsForMatch);
    }
    statements.push(db.prepare(sql).bind(...values, ...guardValues(job), ...guardValues(job)));
  }
  return { statements, changed: changedRows.length };
}

async function prepareRankingStatements(
  db: D1Database,
  job: EventSyncJob,
  rows: TbaRanking[],
): Promise<{ statements: D1PreparedStatement[]; changed: number }> {
  const numbers = [...new Set(rows.map((row) => row.teamNumber))];
  const teams = await all<{ id: number; teamNumber: number }>(db,
    `SELECT Id AS id, TeamNumber AS teamNumber FROM Teams
      WHERE TeamNumber IN (${numbers.map(() => "?").join(", ")})`, numbers);
  const teamIds = new Map(teams.map((team) => [team.teamNumber, team.id]));
  if (rows.some((row) => !teamIds.has(row.teamNumber))) {
    throw new InvalidSourceDataError("Ranked teams are missing locally. Sync teams first.");
  }

  const current = await all<Row>(db, `SELECT
      TeamId AS teamId, Rank AS rank, RankingPoints AS rankingPoints,
      TieBreaker1 AS tieBreaker1, TieBreaker2 AS tieBreaker2
    FROM EventRankings WHERE EventId = ?`, [job.eventId]);
  if (current.some((row) => !rows.some((ranking) => teamIds.get(ranking.teamNumber) === Number(row.teamId)))) {
    throw new InvalidSourceDataError("Previously saved rankings are missing from The Blue Alliance response.");
  }
  const same = current.length === rows.length && current.every((row) => rows.some((ranking) =>
    teamIds.get(ranking.teamNumber) === Number(row.teamId)
      && ranking.rank === Number(row.rank)
      && ranking.points === Number(row.rankingPoints)
      && ranking.tie1 === (row.tieBreaker1 == null ? null : Number(row.tieBreaker1))
      && ranking.tie2 === (row.tieBreaker2 == null ? null : Number(row.tieBreaker2))));
  if (same) return { statements: [], changed: 0 };

  const guard = stateGuard();
  const values = rows.flatMap((row) => [job.eventId, teamIds.get(row.teamNumber)!, row.rank, row.points, row.tie1, row.tie2]);
  const insert = db.prepare(`WITH incoming(EventId, TeamId, Rank, RankingPoints, TieBreaker1, TieBreaker2) AS (
      VALUES ${placeholders(rows.length, 6)}
    )
    INSERT INTO EventRankings (EventId, TeamId, Rank, RankingPoints, TieBreaker1, TieBreaker2)
    SELECT i.EventId, i.TeamId, i.Rank, i.RankingPoints, i.TieBreaker1, i.TieBreaker2
      FROM incoming i WHERE ${guard}`)
    .bind(...values, ...guardValues(job));
  const remove = db.prepare(`DELETE FROM EventRankings
    WHERE EventId = ? AND ${guard}`)
    .bind(job.eventId, ...guardValues(job));
  return { statements: [remove, insert], changed: rows.length };
}

async function buildChanges(
  db: D1Database,
  job: EventSyncJob,
  data: unknown,
): Promise<{ statements: D1PreparedStatement[]; changed: number }> {
  if (job.resource === "teams") {
    const rows = parseTeams(data);
    return makeTeamChanges(db, job, rows);
  }
  if (job.resource === "matches") return prepareMatchStatements(db, job, parseMatches(data));
  return prepareRankingStatements(db, job, parseRankings(data));
}

async function fetchTba(
  eventKey: string,
  resource: EventSyncResource,
  apiKey: string,
  etag: string | null,
): Promise<{ data?: unknown; etag: string | null; notModified: boolean }> {
  const url = `https://www.thebluealliance.com/api/v3/event/${encodeURIComponent(eventKey)}/${resource}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const headers = new Headers({ "X-TBA-Auth-Key": apiKey });
    if (etag) headers.set("If-None-Match", etag);
    let response: Response;
    try {
      response = await fetch(url, { headers, signal: controller.signal });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "AbortError";
      throw new SourceError(timedOut ? "The Blue Alliance request timed out." : "The Blue Alliance request failed.", true);
    }
    if (response.status === 304) return { etag, notModified: true };
    if (!response.ok) {
      const retryable = response.status === 429 || response.status >= 500;
      throw new SourceError(`The Blue Alliance returned HTTP ${response.status}.`, retryable);
    }
    const text = await response.text();
    if (text.length > 5_000_000) throw new InvalidSourceDataError("The Blue Alliance response is too large to process.");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new InvalidSourceDataError("The Blue Alliance returned invalid JSON.");
    }
    return { data, etag: response.headers.get("ETag"), notModified: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function updateSyncFailure(
  db: D1Database,
  job: EventSyncJob,
  outcome: "Failed" | "Preserved" | "Retrying",
  message: string,
): Promise<void> {
  await db.prepare(`UPDATE EventSyncStates
      SET Outcome = ?, Message = ?
    WHERE EventId = ? AND Resource = ? AND Revision = ? AND ManualMode = 0
      AND Outcome IN ('Queued', 'Checking', 'Retrying')`)
    .bind(outcome, message, job.eventId, job.resource, job.revision)
    .run();
}

async function processMessage(
  db: D1Database,
  env: EventSyncEnvironment,
  job: EventSyncJob,
  message: Message<EventSyncJob>,
): Promise<void> {
  const started = await db.prepare(`UPDATE EventSyncStates
      SET Outcome = 'Checking', Message = 'Checking The Blue Alliance...'
    WHERE EventId = ? AND Resource = ? AND Revision = ? AND ManualMode = 0
      AND Outcome IN ('Queued', 'Retrying', 'Checking')`)
    .bind(job.eventId, job.resource, job.revision)
    .run();
  if (!didChange(started)) {
    message.ack();
    return;
  }

  const event = await first<{ blueAllianceKey: string | null }>(db,
    "SELECT BlueAllianceKey AS blueAllianceKey FROM Events WHERE Id = ?", [job.eventId]);
  if (!event) {
    await updateSyncFailure(db, job, "Failed", "Event no longer exists. Saved data was kept.");
    message.ack();
    return;
  }
  if (!event.blueAllianceKey?.trim()) {
    await updateSyncFailure(db, job, "Failed", "This event has no The Blue Alliance key. Manual data is available.");
    message.ack();
    return;
  }
  if (!env.TBA_API_KEY?.trim()) {
    await updateSyncFailure(db, job, "Failed", "The Blue Alliance API key is not configured. Saved data was kept.");
    message.ack();
    return;
  }

  const state = await getState(db, job.eventId, job.resource);
  try {
    const source = await fetchTba(event.blueAllianceKey, job.resource, env.TBA_API_KEY, state.sourceEtag ?? null);
    const changes = source.notModified
      ? { statements: [], changed: 0 }
      : await buildChanges(db, job, source.data);
    const now = new Date().toISOString();
    const changed = changes.changed;
    const outcome = changed > 0 ? "Updated" : "Unchanged";
    const resultMessage = changed > 0 ? `Updated ${changed} records.` : "Connected successfully; no new data.";
    const complete = db.prepare(`UPDATE EventSyncStates
        SET LastSuccessAt = ?,
            LastChangedAt = CASE WHEN ? > 0 THEN ? ELSE LastChangedAt END,
            Revision = Revision + CASE WHEN ? > 0 THEN 1 ELSE 0 END,
            Outcome = ?, Message = ?, SourceEtag = ?
      WHERE EventId = ? AND Resource = ? AND Revision = ? AND ManualMode = 0
        AND Outcome = 'Checking'`)
      .bind(now, changed, now, changed, outcome, resultMessage, source.etag,
        job.eventId, job.resource, job.revision);
    const statements = [...changes.statements, complete];
    const results = statements.length === 1
      ? [await complete.run()]
      : await db.batch(statements);
    if (!didChange(results[results.length - 1])) {
      // A manual edit or newer sync changed the revision while TBA was in flight.
      // The guarded D1 batch keeps its saved data untouched.
    }
    message.ack();
  } catch (error) {
    if (error instanceof SourceError && error.retryable) {
      if (message.attempts < 4) {
        await updateSyncFailure(db, job, "Retrying", `${error.message} Saved data was kept; retrying.`);
        message.retry({ delaySeconds: Math.min(60, 10 * message.attempts) });
        return;
      }
      await updateSyncFailure(db, job, "Retrying", "The Blue Alliance is unavailable. Waiting for the final retry result; saved data was kept.");
      message.retry({ delaySeconds: 60 });
      return;
    }
    const outcome = error instanceof InvalidSourceDataError ? "Preserved" : "Failed";
    const messageText = error instanceof Error ? error.message : "The event sync failed.";
    await updateSyncFailure(db, job, outcome, `${messageText} Saved data was kept.`);
    message.ack();
  }
}

function parseJob(value: unknown): EventSyncJob | null {
  if (!value || typeof value !== "object") return null;
  const job = value as Partial<EventSyncJob>;
  if (!Number.isSafeInteger(job.eventId) || Number(job.eventId) <= 0
      || !RESOURCES.includes(job.resource as EventSyncResource)
      || !Number.isSafeInteger(job.revision) || Number(job.revision) < 0) return null;
  return { eventId: job.eventId!, resource: job.resource as EventSyncResource, revision: job.revision! };
}

export async function consumeEventSyncBatch(
  batch: MessageBatch<unknown>,
  rawEnvironment: Env,
): Promise<void> {
  const env = rawEnvironment as Env & EventSyncEnvironment;
  for (const message of batch.messages) {
    const job = parseJob(message.body);
    if (!job) {
      message.ack();
      continue;
    }
    try {
      if (batch.queue === "grizzly-event-sync-dlq") {
        await updateSyncFailure(env.DB, job, "Failed",
          "The Blue Alliance sync failed after several retries. Saved data was kept.");
        message.ack();
        continue;
      }
      await processMessage(env.DB, env, job, message as Message<EventSyncJob>);
    } catch (error) {
      console.error(JSON.stringify({
        message: "Event sync queue processing failed",
        eventId: job.eventId,
        resource: job.resource,
        error: error instanceof Error ? error.message : String(error),
      }));
      message.retry({ delaySeconds: 30 });
    }
  }
}
