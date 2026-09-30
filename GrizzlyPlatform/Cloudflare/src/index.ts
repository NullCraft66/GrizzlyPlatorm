import {
  clearedSessionCookie,
  createSessionToken,
  getSessionToken,
  hashSessionToken,
  isSameOrigin,
  sessionCookie,
  verifyAspNetIdentityPassword,
} from "./auth.ts";
import {
  getAlliancePlan,
  publishAlliancePlan,
  reviewAllianceSuggestion,
  suggestAllianceTeam,
} from "./alliance-plans.ts";
import {
  deleteAllianceSelection,
  declineAllianceTeam,
  getAllianceSelectionForEvent,
  pickAllianceTeam,
  startAllianceSelection,
  undoAllianceSelection,
} from "./alliance-selection.ts";
import {
  consumeEventSyncBatch,
  addEventTeam,
  addEventTeamRecord,
  createMatch,
  deleteMatch,
  getBlueAlliancePreview,
  getEventOperations,
  getEventRankings,
  queueEventSync,
  saveEventMatch,
  saveEventRankings,
  setEventSyncMode,
  deleteEventTeamRecord,
  updateMatch,
} from "./event-sync.ts";
import {
  createFieldOption,
  createGameField,
  createGameForm,
  deleteFieldOption,
  deleteGameField,
  deleteGameForm,
  restoreSystemFields,
  updateFieldOption,
  updateGameField,
  updateGameForm,
} from "./game-forms.ts";
import {
  getNexusEventData,
  getNexusEvents,
  getNexusSettings,
  getNexusSnapshot,
  getNexusStatus,
  saveNexusSettings,
} from "./nexus.ts";
import { getDiscoveryDiagnostics, getPairingInfo } from "./discovery.ts";

const implementedRoutes = [
  "GET /api/health",
  "POST /api/auth/login",
  "GET /api/auth/me",
  "POST /api/auth/logout",
  "GET /api/auth/users",
  "GET /api/seasons",
  "GET /api/seasons/{id}",
  "POST /api/seasons",
  "DELETE /api/seasons/{id}",
  "GET /api/events",
  "GET /api/events/{id}",
  "GET /api/events/{id}/bluealliance/teams",
  "GET /api/events/{id}/bluealliance/matches",
  "POST /api/events",
  "PUT /api/events/{id}",
  "PUT /api/events/{id}/nexus-key",
  "GET /api/nexus/status",
  "GET /api/nexus/settings (admin)",
  "GET /api/nexus/settings/events (admin)",
  "PUT /api/nexus/settings (admin)",
  "GET /api/nexus/event/{eventKey}",
  "GET /api/nexus/event/{eventKey}/pits",
  "GET /api/nexus/event/{eventKey}/map",
  "GET /api/nexus/snapshot",
  "GET /api/discovery/pairing",
  "GET /api/discovery/diagnostics",
  "DELETE /api/events/{id}",
  "GET /api/teams",
  "GET /api/teams/{id}",
  "GET /api/teams/number/{teamNumber}",
  "POST /api/teams",
  "PUT /api/teams/{id}",
  "DELETE /api/teams/{id}",
  "GET /api/eventteams",
  "GET /api/eventteams/event/{eventId}",
  "POST /api/eventteams",
  "DELETE /api/eventteams/{id}",
  "GET /api/matches",
  "GET /api/matches/{id}",
  "GET /api/matches/event/{eventId}",
  "GET /api/matches/team/{teamId}",
  "POST /api/matches",
  "PUT /api/matches/{id}",
  "DELETE /api/matches/{id}",
  "GET /api/gameforms",
  "GET /api/gameforms/{id}",
  "POST /api/gameforms",
  "PUT /api/gameforms/{id}",
  "DELETE /api/gameforms/{id}",
  "POST /api/gameforms/{id}/fields",
  "PUT /api/gameforms/fields/{fieldId}",
  "DELETE /api/gameforms/fields/{fieldId}",
  "POST /api/gameforms/fields/{fieldId}/options",
  "PUT /api/gameforms/fields/options/{optionId}",
  "DELETE /api/gameforms/fields/options/{optionId}",
  "POST /api/gameforms/restore-system-fields",
  "GET /api/activescoutingconfiguration",
  "PUT /api/activescoutingconfiguration",
  "PUT /api/activescoutingconfiguration/devices",
  "GET /api/gameformsubmissions",
  "GET /api/gameformsubmissions/{id}",
  "GET /api/gameformsubmissions/event/{eventId}",
  "POST /api/gameformsubmissions",
  "POST /api/gameformsubmissions/scout",
  "PUT /api/gameformsubmissions/{id}",
  "DELETE /api/gameformsubmissions/clear-all (admin)",
  "GET /api/EventOperations/{eventId}",
  "POST /api/EventOperations/{eventId}/sync/{resource}",
  "PUT /api/EventOperations/{eventId}/mode/{resource}",
  "POST /api/EventOperations/{eventId}/teams",
  "PUT /api/EventOperations/{eventId}/rankings",
  "PUT /api/EventOperations/{eventId}/matches",
  "GET /api/EventRankings/event/{eventId}",
  "POST /api/EventRankings/sync/{eventId}",
  "POST /api/events/{id}/sync-teams",
  "POST /api/events/{id}/sync-matches",
  "POST /api/events/{id}/sync-rankings",
  "GET /api/AlliancePlans/event/{eventId}",
  "PUT /api/AlliancePlans/event/{eventId}",
  "POST /api/AlliancePlans/event/{eventId}/suggestions",
  "POST /api/AlliancePlans/event/{eventId}/suggestions/{id}/review",
  "GET /api/AllianceSelection/event/{eventId}",
  "DELETE /api/AllianceSelection/{id}",
  "POST /api/AllianceSelection/start",
  "POST /api/AllianceSelection/pick",
  "POST /api/AllianceSelection/decline",
  "POST /api/AllianceSelection/undo",
] as const;

const SESSION_LIFETIME_SECONDS = 12 * 60 * 60;
const MAX_LOGIN_BODY_BYTES = 8_192;
const MAX_SCOUT_BODY_BYTES = 128 * 1_024;
const MAX_SUBMISSION_ANSWERS = 100;

interface LoginUserRow {
  id: number;
  username: string;
  displayName: string;
  passwordHash: string;
  role: string;
  isActive: number | boolean;
}

interface SessionUserRow {
  id: number;
  username: string;
  displayName: string;
  role: string;
  isActive?: number | boolean;
}

interface PublicUserRow {
  [key: string]: unknown;
  id: number;
  username: string;
  displayName: string;
  role: string;
  isActive: number | boolean;
}

type D1Row = Record<string, unknown>;

interface SeasonRow extends D1Row {
  id: number;
  year: number;
  name: string;
}

interface EventRow extends D1Row {
  id: number;
  seasonId: number;
  name: string;
  location: string;
  blueAllianceKey: string | null;
  eventType: string;
  allianceCount: number;
  startDate: string | null;
  endDate: string | null;
  nexusEventKey: string | null;
  joinedSeasonId: number | null;
  seasonYear: number | null;
  seasonName: string | null;
}

interface GameFormRow extends D1Row {
  id: number;
  seasonId: number;
  name: string;
  description: string;
  formType: number;
}

interface GameFormFieldRow extends D1Row {
  id: number;
  gameFormId: number;
  question: string;
  description: string;
  fieldType: number;
  required: number | boolean;
  displayOrder: number;
  isSystemField: number | boolean;
  isAllianceSelectionFilter: number | boolean;
}

interface GameFormFieldOptionRow extends D1Row {
  id: number;
  gameFormFieldId: number;
  value: string;
  displayOrder: number;
}

interface ActiveConfigurationRow extends D1Row {
  id: number;
  activePitFormId: number | null;
  activeMatchFormId: number | null;
  activeSeasonId: number | null;
  activeEventId: number | null;
}

interface TeamRow extends D1Row {
  id: number;
  teamNumber: number;
  name: string;
  location: string;
}

interface EventTeamRow extends D1Row {
  id: number;
  eventId: number;
  teamId: number;
  eventName: string;
  eventLocation: string;
  seasonId: number | null;
  seasonYear: number | null;
  seasonName: string | null;
  teamNumber: number;
  teamName: string;
  teamLocation: string;
}

interface MatchRow extends D1Row {
  id: number;
  eventId: number;
  matchType: string;
  matchNumber: number;
  setNumber: number;
  redScore: number | null;
  blueScore: number | null;
  winningAlliance: string | null;
  redTeam1Id: number;
  redTeam1Number: number;
  redTeam1Name: string;
  redTeam2Id: number;
  redTeam2Number: number;
  redTeam2Name: string;
  redTeam3Id: number;
  redTeam3Number: number;
  redTeam3Name: string;
  blueTeam1Id: number;
  blueTeam1Number: number;
  blueTeam1Name: string;
  blueTeam2Id: number;
  blueTeam2Number: number;
  blueTeam2Name: string;
  blueTeam3Id: number;
  blueTeam3Number: number;
  blueTeam3Name: string;
}

interface SubmissionRow extends D1Row {
  id: number;
  gameFormId: number;
  gameFormName: string;
  formType: number;
  seasonId: number | null;
  seasonYear: number | null;
  seasonName: string | null;
  eventId: number | null;
  matchId: number | null;
  matchNumber: number | null;
  matchType: string | null;
  setNumber: number | null;
  teamId: number;
  teamNumber: number;
  teamName: string;
  submittedAt: string;
  answerFieldId: number | null;
  answerQuestion: string | null;
  answerValue: string | null;
}

interface SubmissionFormRow extends D1Row {
  id: number;
  seasonId: number;
  name: string;
  formType: number;
}

interface SubmissionFieldRow extends D1Row {
  id: number;
  gameFormId: number;
  question: string;
  required: number | boolean;
}

interface SubmissionTeamRow extends D1Row {
  id: number;
  teamNumber: number;
  name: string;
}

interface SubmissionMatchRow extends D1Row {
  id: number;
  eventId: number;
  matchType: string;
  matchNumber: number;
  setNumber: number;
  redTeam1Id: number;
  redTeam2Id: number;
  redTeam3Id: number;
  blueTeam1Id: number;
  blueTeam2Id: number;
  blueTeam3Id: number;
}

function apiJson(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extraHeaders },
  });
}

function unavailable(): Response {
  return apiJson(
    {
      error: {
        code: "backend_migration_incomplete",
        message: "This API endpoint has not been migrated to Cloudflare yet.",
      },
    },
    503,
  );
}

function getDatabase(env: Env): D1Database | undefined {
  // The Env binding declaration is generated from wrangler.jsonc by Wrangler.
  const binding = env.DB;
  return binding && typeof binding.prepare === "function" ? binding : undefined;
}

function hasLoginRateLimiter(env: Env): boolean {
  return typeof env.LOGIN_RATE_LIMITER?.limit === "function";
}


async function all<T extends D1Row>(
  db: D1Database,
  sql: string,
  values: unknown[] = [],
): Promise<T[]> {
  const statement = db.prepare(sql);
  const result = values.length > 0
    ? await statement.bind(...values).all<T>()
    : await statement.all<T>();
  return result.results ?? [];
}

async function getSeasons(db: D1Database): Promise<Response> {
  const seasons = await all<SeasonRow>(
    db,
    `SELECT Id AS id, Year AS year, Name AS name
       FROM Seasons
      ORDER BY Year DESC`,
  );
  return apiJson(seasons);
}

async function getSeason(db: D1Database, id: number): Promise<Response> {
  const season = await db
    .prepare("SELECT Id AS id, Year AS year, Name AS name FROM Seasons WHERE Id = ?")
    .bind(id)
    .first<SeasonRow>();
  return season ? apiJson(season) : new Response(null, { status: 404 });
}

function requestProperty(body: Record<string, unknown>, camel: string, pascal: string): unknown {
  return Object.prototype.hasOwnProperty.call(body, camel) ? body[camel] : body[pascal];
}

function createdApiJson(location: string, body: unknown): Response {
  return Response.json(body, {
    status: 201,
    headers: { "Cache-Control": "no-store", Location: location },
  });
}

async function createSeason(request: Request, db: D1Database): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return apiText("A valid season request is required.", 400);

  const year = requestProperty(body, "year", "Year");
  const name = requestProperty(body, "name", "Name");
  if (!isInteger(year) || typeof name !== "string" || !name.trim()) {
    return apiText("A season year and name are required.", 400);
  }

  const season = await db.prepare(`INSERT INTO Seasons (Year, Name)
      VALUES (?, ?) RETURNING Id AS id, Year AS year, Name AS name`)
    .bind(year, name)
    .first<SeasonRow>();
  return season
    ? createdApiJson(`/api/Seasons/${season.id}`, season)
    : apiJson({ error: { code: "season_create_failed" } }, 500);
}

async function deleteSeason(db: D1Database, id: number): Promise<Response> {
  const deleted = await db.prepare("DELETE FROM Seasons WHERE Id = ? RETURNING Id AS id")
    .bind(id)
    .first<{ id: number }>();
  return deleted ? new Response(null, { status: 204 }) : new Response(null, { status: 404 });
}

const eventSelect = `SELECT
    e.Id AS id,
    e.SeasonId AS seasonId,
    e.Name AS name,
    e.Location AS location,
    e.BlueAllianceKey AS blueAllianceKey,
    e.EventType AS eventType,
    e.AllianceCount AS allianceCount,
    e.StartDate AS startDate,
    e.EndDate AS endDate,
    e.NexusEventKey AS nexusEventKey,
    s.Id AS joinedSeasonId,
    s.Year AS seasonYear,
    s.Name AS seasonName
  FROM Events e
  JOIN Seasons s ON s.Id = e.SeasonId`;

function toEvent(row: EventRow): Record<string, unknown> {
  return {
    id: row.id,
    seasonId: row.seasonId,
    name: row.name,
    location: row.location,
    season: row.joinedSeasonId == null
      ? null
      : { id: row.joinedSeasonId, year: row.seasonYear, name: row.seasonName },
    eventTeams: [],
    blueAllianceKey: row.blueAllianceKey,
    eventType: row.eventType,
    allianceCount: row.allianceCount,
    startDate: row.startDate,
    endDate: row.endDate,
    nexusEventKey: row.nexusEventKey,
  };
}

async function getEvents(db: D1Database): Promise<Response> {
  const events = await all<EventRow>(
    db,
    `${eventSelect} ORDER BY e.Id DESC`,
  );
  return apiJson(events.map(toEvent));
}

async function getEvent(db: D1Database, id: number): Promise<Response> {
  const event = await getEventRow(db, id);
  return event ? apiJson(toEvent(event)) : new Response(null, { status: 404 });
}

async function getEventRow(db: D1Database, id: number): Promise<EventRow | null> {
  return await db
    .prepare(`${eventSelect} WHERE e.Id = ?`)
    .bind(id)
    .first<EventRow>();
}

function validOptionalText(value: unknown): value is string | null | undefined {
  return value == null || typeof value === "string";
}

function validOptionalDate(value: unknown): value is string | null | undefined {
  return value == null || (typeof value === "string" && Number.isFinite(Date.parse(value)));
}

function eventFields(body: Record<string, unknown>): {
  seasonId: number;
  name: string;
  location: string;
  blueAllianceKey: string | null;
  eventType: string;
  allianceCount: number;
  startDate: string | null;
  endDate: string | null;
  nexusEventKey: string | null;
} | null {
  const seasonId = requestProperty(body, "seasonId", "SeasonId");
  const name = requestProperty(body, "name", "Name");
  const location = requestProperty(body, "location", "Location");
  const blueAllianceKey = requestProperty(body, "blueAllianceKey", "BlueAllianceKey");
  const eventType = requestProperty(body, "eventType", "EventType");
  const allianceCount = requestProperty(body, "allianceCount", "AllianceCount");
  const startDate = requestProperty(body, "startDate", "StartDate");
  const endDate = requestProperty(body, "endDate", "EndDate");
  const nexusEventKey = requestProperty(body, "nexusEventKey", "NexusEventKey");

  if (!isInteger(seasonId) || typeof name !== "string" || typeof location !== "string"
      || !validOptionalText(blueAllianceKey) || (eventType != null && typeof eventType !== "string")
      || (allianceCount != null && !isInteger(allianceCount))
      || !validOptionalDate(startDate) || !validOptionalDate(endDate)
      || !validOptionalText(nexusEventKey)) return null;

  return {
    seasonId,
    name,
    location,
    blueAllianceKey: blueAllianceKey ?? null,
    eventType: typeof eventType === "string" ? eventType : "Competition",
    allianceCount: isInteger(allianceCount) ? allianceCount : 8,
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    nexusEventKey: nexusEventKey ?? null,
  };
}

async function createEvent(request: Request, db: D1Database): Promise<Response> {
  const body = await readJsonObject(request);
  const fields = body && eventFields(body);
  if (!fields) return apiText("A valid event with a season, name, and location is required.", 400);

  const season = await db.prepare("SELECT Id AS id FROM Seasons WHERE Id = ?")
    .bind(fields.seasonId)
    .first<{ id: number }>();
  if (!season) return apiText("The selected season does not exist.", 400);

  const inserted = await db.prepare(`INSERT INTO Events (
      SeasonId, Name, Location, BlueAllianceKey, EventType, AllianceCount,
      StartDate, EndDate, NexusEventKey
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING Id AS id`)
    .bind(fields.seasonId, fields.name, fields.location, fields.blueAllianceKey,
      fields.eventType, fields.allianceCount, fields.startDate, fields.endDate,
      fields.nexusEventKey)
    .first<{ id: number }>();
  if (!inserted) return apiJson({ error: { code: "event_create_failed" } }, 500);

  const event = await getEventRow(db, inserted.id);
  return event
    ? createdApiJson(`/api/Events/${inserted.id}`, toEvent(event))
    : apiJson({ error: { code: "event_create_failed" } }, 500);
}

async function updateEvent(request: Request, db: D1Database, id: number): Promise<Response> {
  const body = await readJsonObject(request);
  const fields = body && eventFields(body);
  if (!fields) return apiText("A valid event with a season, name, and location is required.", 400);
  if (!await getEventRow(db, id)) return new Response(null, { status: 404 });

  const season = await db.prepare("SELECT Id AS id FROM Seasons WHERE Id = ?")
    .bind(fields.seasonId)
    .first<{ id: number }>();
  if (!season) return apiText("The selected season does not exist.", 400);

  const allianceCount = fields.allianceCount >= 1 && fields.allianceCount <= 32
    ? fields.allianceCount
    : 8;
  await db.prepare(`UPDATE Events
      SET Name = ?, Location = ?, SeasonId = ?, BlueAllianceKey = ?, EventType = ?,
          AllianceCount = ?, StartDate = ?, EndDate = ?
      WHERE Id = ?`)
    .bind(fields.name, fields.location, fields.seasonId, fields.blueAllianceKey,
      fields.eventType, allianceCount, fields.startDate, fields.endDate, id)
    .run();

  const event = await getEventRow(db, id);
  return event ? apiJson(toEvent(event)) : new Response(null, { status: 404 });
}

async function updateEventNexusKey(request: Request, db: D1Database, id: number): Promise<Response> {
  const body = await readJsonObject(request);
  const nexusEventKey = body && requestProperty(body, "nexusEventKey", "NexusEventKey");
  if (!await getEventRow(db, id)) return new Response(null, { status: 404 });
  if (typeof nexusEventKey !== "string" || !nexusEventKey.trim()) {
    return apiText("Nexus event key is required.", 400);
  }

  await db.prepare("UPDATE Events SET NexusEventKey = ? WHERE Id = ?")
    .bind(nexusEventKey.trim(), id)
    .run();
  const event = await getEventRow(db, id);
  return event ? apiJson(toEvent(event)) : new Response(null, { status: 404 });
}

async function deleteEvent(db: D1Database, id: number): Promise<Response> {
  const deleted = await db.prepare("DELETE FROM Events WHERE Id = ? RETURNING Id AS id")
    .bind(id)
    .first<{ id: number }>();
  return deleted ? new Response(null, { status: 204 }) : new Response(null, { status: 404 });
}

function toTeam(team: TeamRow): Record<string, unknown> {
  return {
    id: team.id,
    teamNumber: team.teamNumber,
    name: team.name,
    location: team.location,
    eventTeams: [],
  };
}

async function getTeams(db: D1Database): Promise<Response> {
  const teams = await all<TeamRow>(
    db,
    `SELECT Id AS id, TeamNumber AS teamNumber, Name AS name, Location AS location
       FROM Teams`,
  );
  return apiJson(teams.map(toTeam));
}

async function getTeam(db: D1Database, id: number): Promise<Response> {
  const team = await db
    .prepare(`SELECT Id AS id, TeamNumber AS teamNumber, Name AS name, Location AS location
                FROM Teams WHERE Id = ?`)
    .bind(id)
    .first<TeamRow>();
  return team ? apiJson(toTeam(team)) : new Response(null, { status: 404 });
}

async function getTeamByNumber(db: D1Database, teamNumber: number): Promise<Response> {
  const team = await db
    .prepare(`SELECT Id AS id, TeamNumber AS teamNumber, Name AS name, Location AS location
                FROM Teams WHERE TeamNumber = ? LIMIT 1`)
    .bind(teamNumber)
    .first<TeamRow>();
  return team ? apiJson(toTeam(team)) : new Response(null, { status: 404 });
}

interface TeamInput {
  teamNumber: number;
  name: string;
  location: string;
}

async function readTeamInput(request: Request): Promise<TeamInput | null> {
  const body = await readJsonObject(request);
  if (!body) return null;
  const teamNumber = requestProperty(body, "teamNumber", "TeamNumber");
  const name = requestProperty(body, "name", "Name");
  const location = requestProperty(body, "location", "Location");
  if (!isInteger(teamNumber) || teamNumber < 1
      || typeof name !== "string" || !name.trim()
      || typeof location !== "string" || !location.trim()) return null;
  return { teamNumber, name, location };
}

async function createTeam(request: Request, db: D1Database): Promise<Response> {
  const teamInput = await readTeamInput(request);
  if (!teamInput) return apiText("A positive team number, name, and location are required.", 400);
  const team = await db.prepare(`INSERT INTO Teams (TeamNumber, Name, Location)
      VALUES (?, ?, ?) RETURNING Id AS id, TeamNumber AS teamNumber, Name AS name, Location AS location`)
    .bind(teamInput.teamNumber, teamInput.name, teamInput.location)
    .first<TeamRow>();
  return team
    ? createdApiJson(`/api/Teams/${team.id}`, toTeam(team))
    : apiJson({ error: { code: "team_create_failed" } }, 500);
}

async function updateTeam(request: Request, db: D1Database, id: number): Promise<Response> {
  const teamInput = await readTeamInput(request);
  if (!teamInput) return apiText("A positive team number, name, and location are required.", 400);
  const team = await db.prepare(`UPDATE Teams
      SET TeamNumber = ?, Name = ?, Location = ?
      WHERE Id = ?
      RETURNING Id AS id, TeamNumber AS teamNumber, Name AS name, Location AS location`)
    .bind(teamInput.teamNumber, teamInput.name, teamInput.location, id)
    .first<TeamRow>();
  return team ? apiJson(toTeam(team)) : new Response(null, { status: 404 });
}

async function deleteTeam(db: D1Database, id: number): Promise<Response> {
  const team = await db.prepare("SELECT Id AS id FROM Teams WHERE Id = ?")
    .bind(id)
    .first<{ id: number }>();
  if (!team) return new Response(null, { status: 404 });
  await db.prepare("DELETE FROM Teams WHERE Id = ?").bind(id).run();
  return new Response(null, { status: 204 });
}

const eventTeamSelect = `SELECT
    et.Id AS id,
    et.EventId AS eventId,
    et.TeamId AS teamId,
    e.Name AS eventName,
    e.Location AS eventLocation,
    s.Id AS seasonId,
    s.Year AS seasonYear,
    s.Name AS seasonName,
    t.TeamNumber AS teamNumber,
    t.Name AS teamName,
    t.Location AS teamLocation
  FROM EventTeams et
  JOIN Events e ON e.Id = et.EventId
  LEFT JOIN Seasons s ON s.Id = e.SeasonId
  JOIN Teams t ON t.Id = et.TeamId`;

function toEventTeam(row: EventTeamRow, includeEvent: boolean): Record<string, unknown> {
  return {
    id: row.id,
    eventId: row.eventId,
    teamId: row.teamId,
    ...(includeEvent ? {
      eventInfo: {
        id: row.eventId,
        name: row.eventName,
        location: row.eventLocation,
        season: row.seasonId == null
          ? null
          : { id: row.seasonId, year: row.seasonYear, name: row.seasonName },
      },
    } : {}),
    team: {
      id: row.teamId,
      teamNumber: row.teamNumber,
      name: row.teamName,
      location: row.teamLocation,
    },
  };
}

async function getEventTeams(db: D1Database, eventId?: number): Promise<Response> {
  const suffix = eventId == null ? "" : " WHERE et.EventId = ?";
  const rows = await all<EventTeamRow>(db, `${eventTeamSelect}${suffix}`, eventId == null ? [] : [eventId]);
  return apiJson(rows.map((row) => toEventTeam(row, eventId == null)));
}

const matchSelect = `SELECT
    m.Id AS id,
    m.EventId AS eventId,
    m.MatchType AS matchType,
    m.MatchNumber AS matchNumber,
    m.SetNumber AS setNumber,
    m.RedScore AS redScore,
    m.BlueScore AS blueScore,
    m.WinningAlliance AS winningAlliance,
    red1.Id AS redTeam1Id, red1.TeamNumber AS redTeam1Number, red1.Name AS redTeam1Name,
    red2.Id AS redTeam2Id, red2.TeamNumber AS redTeam2Number, red2.Name AS redTeam2Name,
    red3.Id AS redTeam3Id, red3.TeamNumber AS redTeam3Number, red3.Name AS redTeam3Name,
    blue1.Id AS blueTeam1Id, blue1.TeamNumber AS blueTeam1Number, blue1.Name AS blueTeam1Name,
    blue2.Id AS blueTeam2Id, blue2.TeamNumber AS blueTeam2Number, blue2.Name AS blueTeam2Name,
    blue3.Id AS blueTeam3Id, blue3.TeamNumber AS blueTeam3Number, blue3.Name AS blueTeam3Name
  FROM Matches m
  JOIN Teams red1 ON red1.Id = m.RedTeam1Id
  JOIN Teams red2 ON red2.Id = m.RedTeam2Id
  JOIN Teams red3 ON red3.Id = m.RedTeam3Id
  JOIN Teams blue1 ON blue1.Id = m.BlueTeam1Id
  JOIN Teams blue2 ON blue2.Id = m.BlueTeam2Id
  JOIN Teams blue3 ON blue3.Id = m.BlueTeam3Id`;

const matchOrdering = `ORDER BY CASE m.MatchType
    WHEN 'Qualification' THEN 1
    WHEN 'EighthFinal' THEN 2
    WHEN 'Quarterfinal' THEN 3
    WHEN 'Semifinal' THEN 4
    WHEN 'Final' THEN 5
    ELSE 6
  END, m.MatchNumber, m.SetNumber`;

function toMatch(row: MatchRow): Record<string, unknown> {
  return {
    id: row.id,
    eventId: row.eventId,
    matchType: row.matchType,
    matchNumber: row.matchNumber,
    setNumber: row.setNumber,
    redScore: row.redScore,
    blueScore: row.blueScore,
    winningAlliance: row.winningAlliance,
    redTeam1: { id: row.redTeam1Id, teamNumber: row.redTeam1Number, name: row.redTeam1Name },
    redTeam2: { id: row.redTeam2Id, teamNumber: row.redTeam2Number, name: row.redTeam2Name },
    redTeam3: { id: row.redTeam3Id, teamNumber: row.redTeam3Number, name: row.redTeam3Name },
    blueTeam1: { id: row.blueTeam1Id, teamNumber: row.blueTeam1Number, name: row.blueTeam1Name },
    blueTeam2: { id: row.blueTeam2Id, teamNumber: row.blueTeam2Number, name: row.blueTeam2Name },
    blueTeam3: { id: row.blueTeam3Id, teamNumber: row.blueTeam3Number, name: row.blueTeam3Name },
  };
}

async function getMatches(
  db: D1Database,
  filter?: { kind: "event" | "team"; id: number },
): Promise<Response> {
  const where = filter?.kind === "event"
    ? " WHERE m.EventId = ?"
    : filter?.kind === "team"
      ? ` WHERE m.RedTeam1Id = ? OR m.RedTeam2Id = ? OR m.RedTeam3Id = ?
            OR m.BlueTeam1Id = ? OR m.BlueTeam2Id = ? OR m.BlueTeam3Id = ?`
      : "";
  const values = filter == null ? [] : Array(filter.kind === "event" ? 1 : 6).fill(filter.id);
  const matches = await all<MatchRow>(db, `${matchSelect}${where} ${matchOrdering}`, values);
  return apiJson(matches.map(toMatch));
}

async function getMatch(db: D1Database, id: number): Promise<Response> {
  const match = await db
    .prepare(`${matchSelect} WHERE m.Id = ?`)
    .bind(id)
    .first<MatchRow>();
  return match ? apiJson(toMatch(match)) : new Response(null, { status: 404 });
}

async function loadGameForms(db: D1Database): Promise<Array<Record<string, unknown>>> {
  const forms = await all<GameFormRow>(
    db,
    `SELECT Id AS id, SeasonId AS seasonId, Name AS name,
            Description AS description, FormType AS formType
       FROM GameForms
      ORDER BY Id`,
  );
  if (forms.length === 0) return [];

  const formIds = forms.map((form) => form.id);
  const formPlaceholders = formIds.map(() => "?").join(", ");
  const fields = await all<GameFormFieldRow>(
    db,
    `SELECT Id AS id, GameFormId AS gameFormId, Question AS question,
            Description AS description, FieldType AS fieldType,
            Required AS required, DisplayOrder AS displayOrder,
            IsSystemField AS isSystemField,
            IsAllianceSelectionFilter AS isAllianceSelectionFilter
       FROM GameFormFields
      WHERE GameFormId IN (${formPlaceholders})
      ORDER BY DisplayOrder`,
    formIds,
  );

  const fieldIds = fields.map((field) => field.id);
  const options = fieldIds.length === 0
    ? []
    : await all<GameFormFieldOptionRow>(
      db,
      `SELECT Id AS id, GameFormFieldId AS gameFormFieldId,
              Value AS value, DisplayOrder AS displayOrder
         FROM GameFormFieldOptions
        WHERE GameFormFieldId IN (${fieldIds.map(() => "?").join(", ")})
        ORDER BY DisplayOrder`,
      fieldIds,
    );

  const optionsByField = new Map<number, GameFormFieldOptionRow[]>();
  for (const option of options) {
    const list = optionsByField.get(option.gameFormFieldId) ?? [];
    list.push(option);
    optionsByField.set(option.gameFormFieldId, list);
  }

  const fieldsByForm = new Map<number, GameFormFieldRow[]>();
  for (const field of fields) {
    const list = fieldsByForm.get(field.gameFormId) ?? [];
    list.push(field);
    fieldsByForm.set(field.gameFormId, list);
  }

  return forms.map((form) => ({
    id: form.id,
    seasonId: form.seasonId,
    name: form.name,
    description: form.description,
    formType: form.formType,
    fields: (fieldsByForm.get(form.id) ?? []).map((field) => ({
      id: field.id,
      question: field.question,
      description: field.description,
      fieldType: field.fieldType,
      required: Boolean(field.required),
      displayOrder: field.displayOrder,
      isSystemField: Boolean(field.isSystemField),
      isAllianceSelectionFilter: Boolean(field.isAllianceSelectionFilter),
      options: (optionsByField.get(field.id) ?? []).map((option) => ({
        id: option.id,
        value: option.value,
        displayOrder: option.displayOrder,
      })),
    })),
  }));
}

async function getGameForms(db: D1Database): Promise<Response> {
  return apiJson(await loadGameForms(db));
}

async function getGameForm(db: D1Database, id: number): Promise<Response> {
  const forms = await loadGameForms(db);
  const form = forms.find((candidate) => candidate.id === id);
  return form ? apiJson(form) : new Response(null, { status: 404 });
}

async function getActiveConfiguration(db: D1Database): Promise<Response> {
  const configuration = await db
    .prepare(`SELECT Id AS id,
                     ActivePitFormId AS activePitFormId,
                     ActiveMatchFormId AS activeMatchFormId,
                     ActiveSeasonId AS activeSeasonId,
                     ActiveEventId AS activeEventId
                FROM ActiveScoutingConfigurations
               ORDER BY Id
               LIMIT 1`)
    .first<ActiveConfigurationRow>();
  return apiJson(configuration ?? {
    id: 0,
    activePitFormId: null,
    activeMatchFormId: null,
    activeSeasonId: null,
    activeEventId: null,
  });
}

function nullableIntegerProperty(
  body: Record<string, unknown>,
  camel: string,
  pascal: string,
): { valid: true; value: number | null } | { valid: false; value: null } {
  const value = requestProperty(body, camel, pascal);
  if (value == null) return { valid: true, value: null };
  return isInteger(value)
    ? { valid: true, value }
    : { valid: false, value: null };
}

async function saveActiveConfiguration(
  request: Request,
  db: D1Database,
  updateDeviceDefaults: boolean,
): Promise<Response> {
  const body = await readJsonObject(request);
  if (!body) return apiText("A valid active scouting configuration is required.", 400);

  const activePitFormId = nullableIntegerProperty(body, "activePitFormId", "ActivePitFormId");
  const activeMatchFormId = nullableIntegerProperty(body, "activeMatchFormId", "ActiveMatchFormId");
  const requestedSeasonId = nullableIntegerProperty(body, "activeSeasonId", "ActiveSeasonId");
  const requestedEventId = nullableIntegerProperty(body, "activeEventId", "ActiveEventId");
  if (!activePitFormId.valid || !activeMatchFormId.valid
      || !requestedSeasonId.valid || !requestedEventId.valid) {
    return apiText("A valid active scouting configuration is required.", 400);
  }

  const current = await db.prepare(`SELECT Id AS id,
                     ActivePitFormId AS activePitFormId,
                     ActiveMatchFormId AS activeMatchFormId,
                     ActiveSeasonId AS activeSeasonId,
                     ActiveEventId AS activeEventId
                FROM ActiveScoutingConfigurations
               ORDER BY Id
               LIMIT 1`)
    .first<ActiveConfigurationRow>();

  const activeSeasonId = updateDeviceDefaults
    ? requestedSeasonId.value
    : current?.activeSeasonId ?? null;
  const activeEventId = updateDeviceDefaults
    ? requestedEventId.value
    : current?.activeEventId ?? null;

  if (activeEventId !== null && activeSeasonId === null) {
    return apiText("Select a season for the active event.", 400);
  }

  if (activeSeasonId !== null) {
    const season = await db.prepare("SELECT Id AS id FROM Seasons WHERE Id = ?")
      .bind(activeSeasonId)
      .first<{ id: number }>();
    if (!season) return apiText("The selected season does not exist.", 400);
  }

  if (activeEventId !== null) {
    const event = await db.prepare("SELECT Id AS id FROM Events WHERE Id = ? AND SeasonId = ?")
      .bind(activeEventId, activeSeasonId)
      .first<{ id: number }>();
    if (!event) return apiText("The selected event does not belong to the selected season.", 400);
  }

  for (const selectedForm of [
    { id: activePitFormId.value, formType: 0, name: "Pit" },
    { id: activeMatchFormId.value, formType: 1, name: "Match" },
  ]) {
    if (selectedForm.id === null) continue;
    const form = await db.prepare(`SELECT Id AS id, SeasonId AS seasonId, FormType AS formType
                                     FROM GameForms
                                    WHERE Id = ?`)
      .bind(selectedForm.id)
      .first<{ id: number; seasonId: number; formType: number }>();
    if (!form || form.formType !== selectedForm.formType) {
      return apiText(`Select a valid ${selectedForm.name} form.`, 400);
    }
    if (activeSeasonId !== null && form.seasonId !== activeSeasonId) {
      return apiText(
        `The ${selectedForm.name} form must belong to the active season. Update Device Configuration first.`,
        400,
      );
    }
  }

  const saved = current
    ? await db.prepare(`UPDATE ActiveScoutingConfigurations
                           SET ActivePitFormId = ?, ActiveMatchFormId = ?,
                               ActiveSeasonId = ?, ActiveEventId = ?
                         WHERE Id = ?
                         RETURNING Id AS id,
                                   ActivePitFormId AS activePitFormId,
                                   ActiveMatchFormId AS activeMatchFormId,
                                   ActiveSeasonId AS activeSeasonId,
                                   ActiveEventId AS activeEventId`)
      .bind(activePitFormId.value, activeMatchFormId.value, activeSeasonId, activeEventId, current.id)
      .first<ActiveConfigurationRow>()
    : await db.prepare(`INSERT INTO ActiveScoutingConfigurations (
                            ActivePitFormId, ActiveMatchFormId, ActiveSeasonId, ActiveEventId
                          ) VALUES (?, ?, ?, ?)
                          RETURNING Id AS id,
                                    ActivePitFormId AS activePitFormId,
                                    ActiveMatchFormId AS activeMatchFormId,
                                    ActiveSeasonId AS activeSeasonId,
                                    ActiveEventId AS activeEventId`)
      .bind(activePitFormId.value, activeMatchFormId.value, activeSeasonId, activeEventId)
      .first<ActiveConfigurationRow>();

  return saved
    ? apiJson(saved)
    : apiJson({ error: { code: "active_configuration_save_failed" } }, 500);
}

const submissionSelect = `SELECT
    s.Id AS id,
    s.GameFormId AS gameFormId,
    gf.Name AS gameFormName,
    gf.FormType AS formType,
    gf.SeasonId AS seasonId,
    season.Year AS seasonYear,
    season.Name AS seasonName,
    COALESCE(s.EventId, m.EventId) AS eventId,
    s.MatchId AS matchId,
    m.MatchNumber AS matchNumber,
    m.MatchType AS matchType,
    m.SetNumber AS setNumber,
    s.TeamId AS teamId,
    team.TeamNumber AS teamNumber,
    team.Name AS teamName,
    s.SubmittedAt AS submittedAt,
    answer.GameFormFieldId AS answerFieldId,
    field.Question AS answerQuestion,
    answer.Value AS answerValue
  FROM GameFormSubmissions s
  JOIN GameForms gf ON gf.Id = s.GameFormId
  LEFT JOIN Seasons season ON season.Id = gf.SeasonId
  LEFT JOIN Matches m ON m.Id = s.MatchId
  JOIN Teams team ON team.Id = s.TeamId
  LEFT JOIN GameFormAnswers answer ON answer.GameFormSubmissionId = s.Id
  LEFT JOIN GameFormFields field ON field.Id = answer.GameFormFieldId`;

function formTypeName(formType: number): string {
  if (formType === 0) return "Pit";
  if (formType === 1) return "Match";
  return String(formType);
}

function normalizeDateTime(value: string): string {
  const candidate = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
    ? value
    : `${value.replace(" ", "T")}Z`;
  const timestamp = Date.parse(candidate);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
}

function mapSubmissionRows(rows: SubmissionRow[]): Array<Record<string, unknown>> {
  const submissions = new Map<number, Record<string, unknown> & {
    answers: Array<Record<string, unknown>>;
    createdAt: string;
    scoutName: string;
  }>();
  for (const row of rows) {
    let submission = submissions.get(row.id);
    if (!submission) {
      submission = {
        id: row.id,
        gameFormId: row.gameFormId,
        gameFormName: row.gameFormName,
        formType: formTypeName(row.formType),
        seasonId: row.seasonId,
        seasonYear: row.seasonYear,
        seasonName: row.seasonName,
        eventId: row.eventId,
        matchId: row.matchId,
        matchNumber: row.matchNumber,
        matchType: row.matchType,
        setNumber: row.setNumber,
        teamId: row.teamId,
        teamNumber: row.teamNumber,
        teamName: row.teamName,
        submittedAt: normalizeDateTime(row.submittedAt),
        createdAt: normalizeDateTime(row.submittedAt),
        scoutName: "",
        answers: [],
      };
      submissions.set(row.id, submission);
    }

    if (row.answerFieldId !== null && row.answerFieldId !== undefined) {
      submission.answers.push({
        fieldId: row.answerFieldId,
        question: row.answerQuestion,
        value: row.answerValue,
      });
      if (row.answerQuestion?.toLowerCase() === "scout name") {
        submission.scoutName = row.answerValue ?? "";
      }
    }
  }
  return [...submissions.values()];
}

async function getSubmissionRows(
  db: D1Database,
  where = "",
  values: unknown[] = [],
): Promise<Array<Record<string, unknown>>> {
  const rows = await all<SubmissionRow>(
    db,
    `${submissionSelect}${where} ORDER BY s.SubmittedAt DESC, s.Id DESC, answer.Id ASC`,
    values,
  );
  return mapSubmissionRows(rows);
}

async function getSubmissions(db: D1Database, url: URL): Promise<Response> {
  const filters: string[] = [];
  const values: unknown[] = [];
  const seasonId = url.searchParams.get("seasonId");
  const year = url.searchParams.get("year");
  const formType = url.searchParams.get("formType");

  if (seasonId !== null && /^-?\d+$/.test(seasonId)) {
    filters.push("gf.SeasonId = ?");
    values.push(Number(seasonId));
  }
  if (year !== null && /^-?\d+$/.test(year)) {
    filters.push("season.Year = ?");
    values.push(Number(year));
  }
  if (formType !== null && formType.trim() !== "") {
    const normalized = formType.trim().toLowerCase();
    const typeValue = normalized === "pit" || normalized === "0"
      ? 0
      : normalized === "match" || normalized === "1"
        ? 1
        : null;
    if (typeValue === null) return apiText("Form type must be Pit or Match.", 400);
    filters.push("gf.FormType = ?");
    values.push(typeValue);
  }

  const rows = await getSubmissionRows(
    db,
    filters.length > 0 ? ` WHERE ${filters.join(" AND ")}` : "",
    values,
  );
  return apiJson(rows.map(({ matchType: _matchType, setNumber: _setNumber, ...row }) => row));
}

async function getSubmissionForEvent(db: D1Database, eventId: number): Promise<Response> {
  const rows = await getSubmissionRows(
    db,
    " WHERE s.EventId = ? OR m.EventId = ?",
    [eventId, eventId],
  );
  return apiJson(rows.map(({ seasonId: _seasonId, seasonYear: _seasonYear, seasonName: _seasonName, setNumber: _setNumber, ...row }) => row));
}

async function getSubmission(db: D1Database, id: number): Promise<Response> {
  const rows = await getSubmissionRows(db, " WHERE s.Id = ?", [id]);
  const row = rows[0];
  if (!row) return new Response(null, { status: 404 });

  const {
    formType: _formType,
    seasonId: _seasonId,
    seasonYear: _seasonYear,
    seasonName: _seasonName,
    matchType: _matchType,
    setNumber: _setNumber,
    ...submission
  } = row;
  return apiJson(submission);
}

async function readJsonObject(
  request: Request,
  maxBytes = MAX_LOGIN_BODY_BYTES,
): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return null;

  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return null;

  const reader = request.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalLength += result.value.byteLength;
      if (totalLength > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(result.value);
    }

    const bytes = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function apiText(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function requestedRevision(url: URL): { revision?: number; invalid: boolean } {
  const values = [...url.searchParams.entries()]
    .filter(([name]) => name.toLowerCase() === "revision")
    .map(([, value]) => value);
  if (values.length === 0) return { invalid: false };
  if (values.length !== 1 || !/^-?\d+$/.test(values[0])) return { invalid: true };
  const revision = Number(values[0]);
  return Number.isSafeInteger(revision) ? { revision, invalid: false } : { invalid: true };
}

interface SubmittedAnswer {
  gameFormFieldId: number;
  value: string;
}

function parseAnswers(value: unknown): SubmittedAnswer[] | null {
  if (!Array.isArray(value) || value.length > MAX_SUBMISSION_ANSWERS) return null;
  const answers: SubmittedAnswer[] = [];
  for (const item of value) {
    if (!isObject(item) || !isInteger(item.gameFormFieldId) || typeof item.value !== "string") {
      return null;
    }
    if (item.value.length > 8_192) return null;
    answers.push({ gameFormFieldId: item.gameFormFieldId, value: item.value });
  }
  return answers;
}

function addSystemAnswerIfMissing(
  answers: SubmittedAnswer[],
  fields: SubmissionFieldRow[],
  question: string,
  value: string,
): void {
  const field = fields.find((candidate) => candidate.question.toLowerCase() === question.toLowerCase());
  if (!field) return;
  const answer = answers.find((candidate) => candidate.gameFormFieldId === field.id);
  if (!answer) {
    answers.push({ gameFormFieldId: field.id, value });
  } else if (answer.value.trim() === "") {
    answer.value = value;
  }
}

async function createScoutSubmission(request: Request, db: D1Database): Promise<Response> {
  const body = await readJsonObject(request, MAX_SCOUT_BODY_BYTES);
  if (
    !body
    || !isInteger(body.gameFormId)
    || !isInteger(body.teamNumber)
    || typeof body.scoutName !== "string"
    || body.scoutName.length > 256
  ) {
    return apiText("The scouting submission is invalid.", 400);
  }

  const eventId = body.eventId === null || body.eventId === undefined ? null : body.eventId;
  const matchNumber = body.matchNumber === null || body.matchNumber === undefined ? null : body.matchNumber;
  const setNumber = body.setNumber === null || body.setNumber === undefined ? null : body.setNumber;
  if (
    (eventId !== null && !isInteger(eventId))
    || (matchNumber !== null && !isInteger(matchNumber))
    || (setNumber !== null && !isInteger(setNumber))
    || (body.matchType !== undefined && body.matchType !== null && typeof body.matchType !== "string")
  ) {
    return apiText("The scouting submission is invalid.", 400);
  }
  const answers = parseAnswers(body.answers);
  if (!answers) return apiText("The scouting submission contains invalid answers.", 400);

  const form = await db.prepare(
    `SELECT Id AS id, SeasonId AS seasonId, Name AS name, FormType AS formType
       FROM GameForms WHERE Id = ? LIMIT 1`,
  ).bind(body.gameFormId).first<SubmissionFormRow>();
  if (!form) return apiText("The specified game form does not exist.", 400);

  const fields = await all<SubmissionFieldRow>(
    db,
    `SELECT Id AS id, GameFormId AS gameFormId, Question AS question, Required AS required
       FROM GameFormFields WHERE GameFormId = ? ORDER BY Id`,
    [form.id],
  );

  const team = await db.prepare(
    `SELECT Id AS id, TeamNumber AS teamNumber, Name AS name
       FROM Teams WHERE TeamNumber = ? LIMIT 1`,
  ).bind(body.teamNumber).first<SubmissionTeamRow>();
  if (!team) return apiText("The specified team number does not exist.", 400);

  if (eventId !== null) {
    const selectedEvent = await db.prepare(
      "SELECT Id AS id, SeasonId AS seasonId FROM Events WHERE Id = ? LIMIT 1",
    ).bind(eventId).first<{ id: number; seasonId: number }>();
    if (!selectedEvent || selectedEvent.seasonId !== form.seasonId) {
      return apiText("The selected event must belong to the form's season.", 400);
    }
  }

  let match: SubmissionMatchRow | null = null;
  if (form.formType === 1) {
    if (eventId === null || matchNumber === null) {
      return apiText("Match scouting requires an event and match number.", 400);
    }

    const matchFilters = ["EventId = ?", "MatchNumber = ?"];
    const matchValues: unknown[] = [eventId, matchNumber];
    if (typeof body.matchType === "string" && body.matchType.trim() !== "") {
      matchFilters.push("MatchType = ?");
      matchValues.push(body.matchType);
    }
    if (setNumber !== null && setNumber > 0) {
      matchFilters.push("SetNumber = ?");
      matchValues.push(setNumber);
    }
    match = await db.prepare(
      `SELECT Id AS id, EventId AS eventId, MatchType AS matchType,
              MatchNumber AS matchNumber, SetNumber AS setNumber,
              RedTeam1Id AS redTeam1Id, RedTeam2Id AS redTeam2Id,
              RedTeam3Id AS redTeam3Id, BlueTeam1Id AS blueTeam1Id,
              BlueTeam2Id AS blueTeam2Id, BlueTeam3Id AS blueTeam3Id
         FROM Matches WHERE ${matchFilters.join(" AND ")} LIMIT 1`,
    ).bind(...matchValues).first<SubmissionMatchRow>();
    if (!match) return apiText("The specified match does not exist.", 400);

    const participatingTeamIds = [
      match.redTeam1Id,
      match.redTeam2Id,
      match.redTeam3Id,
      match.blueTeam1Id,
      match.blueTeam2Id,
      match.blueTeam3Id,
    ];
    if (!participatingTeamIds.includes(team.id)) {
      return apiText("The specified team did not participate in the selected match.", 400);
    }
  }

  addSystemAnswerIfMissing(answers, fields, "Team Number", String(body.teamNumber));
  if (form.formType === 1 && matchNumber !== null) {
    addSystemAnswerIfMissing(answers, fields, "Match Number", String(matchNumber));
  }
  addSystemAnswerIfMissing(answers, fields, "Scout Name", body.scoutName);

  for (const answer of answers) {
    if (!fields.some((field) => field.id === answer.gameFormFieldId)) {
      return apiText(`Field ${answer.gameFormFieldId} does not belong to this game form.`, 400);
    }
  }
  for (const field of fields.filter((candidate) => Boolean(candidate.required))) {
    const answer = answers.find((candidate) => candidate.gameFormFieldId === field.id);
    if (!answer || answer.value.trim() === "") {
      return apiText(`Required field '${field.question}' is missing an answer.`, 400);
    }
  }

  const duplicate = match
    ? await db.prepare(
      `SELECT Id AS id FROM GameFormSubmissions
        WHERE GameFormId = ? AND TeamId = ? AND MatchId = ? LIMIT 1`,
    ).bind(form.id, team.id, match.id).first<{ id: number }>()
    : await db.prepare(
      `SELECT Id AS id FROM GameFormSubmissions
        WHERE GameFormId = ? AND TeamId = ? AND MatchId IS NULL AND EventId IS ? LIMIT 1`,
    ).bind(form.id, team.id, eventId).first<{ id: number }>();
  if (duplicate) return apiText("A submission for this team already exists.", 409);

  const submissionKey = crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  const parentSql = match
    ? `INSERT INTO GameFormSubmissions
         (SubmissionKey, GameFormId, MatchId, EventId, TeamId, SubmittedAt)
       SELECT ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM GameFormSubmissions
           WHERE GameFormId = ? AND TeamId = ? AND MatchId = ?
        )`
    : `INSERT INTO GameFormSubmissions
         (SubmissionKey, GameFormId, MatchId, EventId, TeamId, SubmittedAt)
       SELECT ?, ?, NULL, ?, ?, ?
        WHERE NOT EXISTS (
          SELECT 1 FROM GameFormSubmissions
           WHERE GameFormId = ? AND TeamId = ? AND MatchId IS NULL AND EventId IS ?
        )`;
  const parentValues = match
    ? [submissionKey, form.id, match.id, eventId, team.id, submittedAt, form.id, team.id, match.id]
    : [submissionKey, form.id, eventId, team.id, submittedAt, form.id, team.id, eventId];
  const statements = [db.prepare(parentSql).bind(...parentValues)];
  for (const answer of answers) {
    statements.push(db.prepare(
      `INSERT INTO GameFormAnswers (GameFormSubmissionId, GameFormFieldId, Value)
       SELECT Id, ?, ? FROM GameFormSubmissions WHERE SubmissionKey = ?`,
    ).bind(answer.gameFormFieldId, answer.value, submissionKey));
  }
  await db.batch(statements);

  const saved = (await getSubmissionRows(db, " WHERE s.SubmissionKey = ?", [submissionKey]))[0];
  if (!saved) return apiText("A submission for this team already exists.", 409);

  const responseBody = {
    id: saved.id,
    gameFormId: saved.gameFormId,
    gameFormName: saved.gameFormName,
    formType: saved.formType,
    eventId: saved.eventId,
    matchId: saved.matchId,
    matchNumber: saved.matchNumber,
    matchType: saved.matchType,
    setNumber: saved.setNumber,
    teamId: saved.teamId,
    teamNumber: saved.teamNumber,
    teamName: saved.teamName,
    submittedAt: saved.submittedAt,
    answers: saved.answers,
  };
  const response = apiJson(responseBody, 201);
  response.headers.set("Location", `/api/GameFormSubmissions/${saved.id}`);
  return response;
}

function parseLegacySubmissionAnswers(value: unknown): SubmittedAnswer[] | null {
  if (!Array.isArray(value) || value.length > MAX_SUBMISSION_ANSWERS) return null;
  const answers: SubmittedAnswer[] = [];
  for (const item of value) {
    if (!isObject(item)) return null;
    const gameFormFieldId = requestProperty(item, "gameFormFieldId", "GameFormFieldId");
    const rawValue = requestProperty(item, "value", "Value");
    const answerValue = rawValue === undefined ? "" : rawValue;
    if (!isInteger(gameFormFieldId) || typeof answerValue !== "string" || answerValue.length > 8_192) {
      return null;
    }
    answers.push({ gameFormFieldId, value: answerValue });
  }
  return answers;
}

async function createLegacySubmission(request: Request, db: D1Database): Promise<Response> {
  const body = await readJsonObject(request, MAX_SCOUT_BODY_BYTES);
  if (!body) return apiText("The scouting submission is invalid.", 400);

  const gameFormId = requestProperty(body, "gameFormId", "GameFormId");
  const matchId = requestProperty(body, "matchId", "MatchId");
  const eventIdValue = requestProperty(body, "eventId", "EventId");
  const teamId = requestProperty(body, "teamId", "TeamId");
  const rawAnswers = requestProperty(body, "answers", "Answers");
  const eventId = eventIdValue === undefined ? null : eventIdValue;
  const answers = rawAnswers === undefined ? [] : parseLegacySubmissionAnswers(rawAnswers);
  if (!isInteger(gameFormId) || !isInteger(matchId) || !isInteger(teamId)
      || (eventId !== null && !isInteger(eventId)) || !answers) {
    return apiText("The scouting submission is invalid.", 400);
  }

  const form = await db.prepare(`SELECT Id AS id, Name AS name
      FROM GameForms WHERE Id = ? LIMIT 1`)
    .bind(gameFormId)
    .first<{ id: number; name: string }>();
  if (!form) return apiText("The specified game form does not exist.", 400);

  const match = await db.prepare(`SELECT Id AS id, EventId AS eventId,
      RedTeam1Id AS redTeam1Id, RedTeam2Id AS redTeam2Id,
      RedTeam3Id AS redTeam3Id, BlueTeam1Id AS blueTeam1Id,
      BlueTeam2Id AS blueTeam2Id, BlueTeam3Id AS blueTeam3Id,
      MatchNumber AS matchNumber
    FROM Matches WHERE Id = ? LIMIT 1`)
    .bind(matchId)
    .first<SubmissionMatchRow & { matchNumber: number }>();
  if (!match) return apiText("The specified match does not exist.", 400);

  const team = await db.prepare(`SELECT Id AS id, TeamNumber AS teamNumber, Name AS name
      FROM Teams WHERE Id = ? LIMIT 1`)
    .bind(teamId)
    .first<SubmissionTeamRow>();
  if (!team) return apiText("The specified team does not exist.", 400);

  const participatingTeamIds = [
    match.redTeam1Id,
    match.redTeam2Id,
    match.redTeam3Id,
    match.blueTeam1Id,
    match.blueTeam2Id,
    match.blueTeam3Id,
  ];
  if (!participatingTeamIds.includes(team.id)) {
    return apiText("The specified team did not participate in the selected match.", 400);
  }

  const fields = await all<SubmissionFieldRow>(db, `SELECT
      Id AS id, GameFormId AS gameFormId, Question AS question, Required AS required
    FROM GameFormFields WHERE GameFormId = ? ORDER BY Id`, [form.id]);
  for (const answer of answers) {
    if (!fields.some((field) => field.id === answer.gameFormFieldId)) {
      return apiText(`Field ${answer.gameFormFieldId} does not belong to this game form.`, 400);
    }
  }
  for (const field of fields.filter((candidate) => Boolean(candidate.required))) {
    const answer = answers.find((candidate) => candidate.gameFormFieldId === field.id);
    if (!answer || answer.value.trim() === "") {
      return apiText(`Required field '${field.question}' is missing an answer.`, 400);
    }
  }

  const submissionKey = crypto.randomUUID();
  const submittedAt = new Date().toISOString();
  const statements = [db.prepare(`INSERT INTO GameFormSubmissions
      (SubmissionKey, GameFormId, MatchId, EventId, TeamId, SubmittedAt)
    VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(submissionKey, form.id, match.id, eventId, team.id, submittedAt)];
  for (const answer of answers) {
    statements.push(db.prepare(`INSERT INTO GameFormAnswers
        (GameFormSubmissionId, GameFormFieldId, Value)
      SELECT Id, ?, ? FROM GameFormSubmissions WHERE SubmissionKey = ?`)
      .bind(answer.gameFormFieldId, answer.value, submissionKey));
  }
  await db.batch(statements);

  const saved = await db.prepare(`SELECT Id AS id FROM GameFormSubmissions
      WHERE SubmissionKey = ? LIMIT 1`)
    .bind(submissionKey)
    .first<{ id: number }>();
  if (!saved) return apiJson({ error: { code: "submission_create_failed" } }, 500);

  const eventTeamId = eventId ?? match.eventId;
  const response = apiJson({
    id: saved.id,
    gameFormId: form.id,
    gameFormName: form.name,
    eventId: eventTeamId,
    matchId: match.id,
    matchNumber: match.matchNumber,
    teamId: team.id,
    teamNumber: team.teamNumber,
    teamName: team.name,
    submittedAt,
    answers: answers.map((answer) => ({
      fieldId: answer.gameFormFieldId,
      question: fields.find((field) => field.id === answer.gameFormFieldId)?.question,
      value: answer.value,
    })),
  }, 201);
  response.headers.set("Location", `/api/GameFormSubmissions/${saved.id}`);
  return response;
}

async function updateSubmission(request: Request, db: D1Database, id: number): Promise<Response> {
  const body = await readJsonObject(request, MAX_SCOUT_BODY_BYTES);
  if (!body || !Array.isArray(body.answers)) return apiText("The submission update is invalid.", 400);
  const answers = parseAnswers(body.answers);
  if (!answers) return apiText("The submission contains invalid answers.", 400);

  const submission = await db.prepare(
    `SELECT s.Id AS id, s.GameFormId AS gameFormId, s.TeamId AS teamId,
            s.MatchId AS matchId, s.SubmittedAt AS submittedAt,
            gf.Name AS gameFormName
       FROM GameFormSubmissions s
       JOIN GameForms gf ON gf.Id = s.GameFormId
      WHERE s.Id = ? LIMIT 1`,
  ).bind(id).first<{
    id: number;
    gameFormId: number;
    teamId: number;
    matchId: number | null;
    submittedAt: string;
    gameFormName: string;
  }>();
  if (!submission) return new Response(null, { status: 404 });

  const fields = await all<SubmissionFieldRow>(
    db,
    `SELECT Id AS id, GameFormId AS gameFormId, Question AS question, Required AS required
       FROM GameFormFields WHERE GameFormId = ? ORDER BY Id`,
    [submission.gameFormId],
  );
  for (const answer of answers) {
    if (!fields.some((field) => field.id === answer.gameFormFieldId)) {
      return apiText(`Field ${answer.gameFormFieldId} does not belong to this game form.`, 400);
    }
  }
  for (const field of fields.filter((candidate) => Boolean(candidate.required))) {
    const answer = answers.find((candidate) => candidate.gameFormFieldId === field.id);
    if (!answer || answer.value.trim() === "") {
      return apiText(`Required field '${field.question}' is missing an answer.`, 400);
    }
  }

  const statements = [db.prepare("DELETE FROM GameFormAnswers WHERE GameFormSubmissionId = ?").bind(id)];
  for (const answer of answers) {
    statements.push(db.prepare(
      `INSERT INTO GameFormAnswers (GameFormSubmissionId, GameFormFieldId, Value)
       SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM GameFormSubmissions WHERE Id = ?)`,
    ).bind(id, answer.gameFormFieldId, answer.value, id));
  }
  await db.batch(statements);

  const saved = (await getSubmissionRows(db, " WHERE s.Id = ?", [id]))[0];
  if (!saved) return new Response(null, { status: 404 });
  return apiJson({
    id: saved.id,
    gameFormId: saved.gameFormId,
    gameFormName: saved.gameFormName,
    teamId: saved.teamId,
    matchId: saved.matchId,
    submittedAt: saved.submittedAt,
    answers: saved.answers,
  });
}

async function clearAllSubmissions(db: D1Database): Promise<Response> {
  const [answerCount, submissionCount] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM GameFormAnswers").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM GameFormSubmissions").first<{ count: number }>(),
  ]);
  await db.batch([
    db.prepare("DELETE FROM GameFormAnswers"),
    db.prepare("DELETE FROM GameFormSubmissions"),
  ]);
  return apiJson({
    message: "All submissions cleared.",
    removedSubmissions: submissionCount?.count ?? 0,
    removedAnswers: answerCount?.count ?? 0,
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isActiveUser(value: number | boolean): boolean {
  return value === true || value === 1;
}

function authUserResponse(user: SessionUserRow): Record<string, unknown> {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
  };
}

function unauthorized(): Response {
  return apiJson({ message: "Authentication is required." }, 401);
}

function isAdministrator(user: SessionUserRow): boolean {
  const username = user.username.toLowerCase();
  return user.role.trim().toLowerCase() === "admin"
    || username === "awoodman"
    || username === "jkim";
}

async function login(request: Request, db: D1Database, env: Env): Promise<Response> {
  if (!hasLoginRateLimiter(env)) {
    return apiJson({ error: { code: "login_rate_limiter_unavailable" } }, 503);
  }

  const body = await readJsonObject(request);
  if (!body || typeof body.username !== "string" || typeof body.password !== "string") {
    return apiJson({ message: "Username and password are required." }, 400);
  }

  const username = body.username.trim();
  const password = body.password;
  if (
    username.length === 0
    || username.length > 128
    || password.length === 0
    || password.length > 1_024
    || new TextEncoder().encode(password).byteLength > 4_096
  ) {
    return apiJson({ message: "Username and password are required." }, 400);
  }

  const accountDigest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(username.normalize("NFKC").toLowerCase()),
  );
  const accountKey = `account:${Array.from(new Uint8Array(accountDigest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  let rateLimit: RateLimitOutcome;
  try {
    rateLimit = await env.LOGIN_RATE_LIMITER.limit({ key: accountKey });
  } catch {
    return apiJson({ error: { code: "login_rate_limiter_unavailable" } }, 503);
  }
  if (!rateLimit.success) {
    return apiJson({ error: { code: "login_rate_limited" } }, 429, { "Retry-After": "60" });
  }

  const user = await db
    .prepare(`SELECT Id AS id, Username AS username, DisplayName AS displayName,
                     PasswordHash AS passwordHash, Role AS role, IsActive AS isActive
                FROM Users
               WHERE Username = ?
               LIMIT 1`)
    .bind(username)
    .first<LoginUserRow>();

  if (!user || !isActiveUser(user.isActive) || !await verifyAspNetIdentityPassword(password, user.passwordHash)) {
    return apiJson({ message: "Invalid username or password." }, 401);
  }

  const now = Math.floor(Date.now() / 1_000);
  const expiresAt = now + SESSION_LIFETIME_SECONDS;
  const token = createSessionToken();
  const tokenHash = await hashSessionToken(token);

  await db.prepare("DELETE FROM AuthSessions WHERE ExpiresAt <= ?").bind(now).run();
  await db
    .prepare("INSERT INTO AuthSessions (TokenHash, UserId, CreatedAt, ExpiresAt) VALUES (?, ?, ?, ?)")
    .bind(tokenHash, user.id, now, expiresAt)
    .run();

  const response = apiJson(authUserResponse(user));
  response.headers.append("Set-Cookie", sessionCookie(token, SESSION_LIFETIME_SECONDS));
  return response;
}

async function getSessionUser(request: Request, db: D1Database): Promise<SessionUserRow | null> {
  const token = getSessionToken(request);
  if (!token) return null;

  const tokenHash = await hashSessionToken(token);
  const now = Math.floor(Date.now() / 1_000);
  const consistentRead = db.withSession("first-primary");
  const user = await consistentRead
    .prepare(`SELECT u.Id AS id, u.Username AS username, u.DisplayName AS displayName,
                     u.Role AS role, u.IsActive AS isActive
                FROM AuthSessions s
                JOIN Users u ON u.Id = s.UserId
               WHERE s.TokenHash = ?
                 AND s.ExpiresAt > ?
                 AND u.IsActive = 1
               LIMIT 1`)
    .bind(tokenHash, now)
    .first<SessionUserRow>();

  return user && user.isActive !== undefined && isActiveUser(user.isActive) ? user : null;
}

async function logout(request: Request, db: D1Database): Promise<Response> {
  const token = getSessionToken(request);
  if (token) {
    const tokenHash = await hashSessionToken(token);
    await db.prepare("DELETE FROM AuthSessions WHERE TokenHash = ?").bind(tokenHash).run();
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": clearedSessionCookie(),
    },
  });
}

async function getUsers(db: D1Database): Promise<Response> {
  const users = await all<PublicUserRow>(
    db,
    `SELECT Id AS id, Username AS username, DisplayName AS displayName,
            Role AS role, IsActive AS isActive
       FROM Users
      ORDER BY Username`,
  );
  return apiJson(users.map((user) => ({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    isActive: isActiveUser(user.isActive),
  })));
}

function isPublicRead(method: string, path: string): boolean {
  return method === "GET" && /^\/api\/(seasons|events)(\/\-?\d+)?$/.test(path);
}

async function routeApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const rawPath = url.pathname.replace(/\/+$/, "") || "/";
  const path = rawPath.toLowerCase();
  const method = request.method.toUpperCase();

  if (path === "/api/health" && method === "GET") {
    const db = getDatabase(env);
    if (!db) {
      return apiJson({
        status: "degraded",
        databaseStatus: "unavailable",
        loginRateLimitConfigured: hasLoginRateLimiter(env),
        apiRoutesReady: false,
        implementedRoutes,
      }, 503);
    }

    try {
      const result = await db.prepare("SELECT 1 AS ok").first<{ ok: number }>();
      const connected = result?.ok === 1;
      return apiJson({
        status: "degraded",
        databaseStatus: connected ? "connected" : "unavailable",
        loginRateLimitConfigured: hasLoginRateLimiter(env),
        apiRoutesReady: false,
        implementedRoutes,
      }, 503);
    } catch {
      return apiJson({
        status: "degraded",
        databaseStatus: "unavailable",
        loginRateLimitConfigured: hasLoginRateLimiter(env),
        apiRoutesReady: false,
        implementedRoutes,
      }, 503);
    }
  }

  if (!path.startsWith("/api/")) return unavailable();
  if (method !== "GET" && method !== "HEAD" && method !== "OPTIONS" && !isSameOrigin(request)) {
    return apiJson({ error: { code: "cross_origin_request_rejected" } }, 403);
  }

  const db = getDatabase(env);
  if (!db) return apiJson({ error: { code: "database_unavailable" } }, 503);

  try {
    if (method === "POST" && path === "/api/auth/login") return await login(request, db, env);
    if (method === "POST" && path === "/api/auth/logout") return await logout(request, db);

    if (method === "GET" && path === "/api/auth/me") {
      const user = await getSessionUser(request, db);
      return user ? apiJson(authUserResponse(user)) : unauthorized();
    }

    if (method === "GET" && path === "/api/auth/users") {
      const user = await getSessionUser(request, db);
      if (!user) return unauthorized();
      return isAdministrator(user)
        ? await getUsers(db)
        : apiJson({ error: { code: "forbidden" } }, 403);
    }

    let sessionUser: SessionUserRow | null = null;
    if (!isPublicRead(method, path) && !(method === "GET" && path === "/api/health")) {
      sessionUser = await getSessionUser(request, db);
      if (!sessionUser) return unauthorized();
    }

    if (method === "GET" && path === "/api/nexus/status") return await getNexusStatus(db);
    if (path === "/api/nexus/settings") {
      if (!sessionUser || !isAdministrator(sessionUser)) return apiJson({ error: { code: "forbidden" } }, 403);
      if (method === "GET") return await getNexusSettings(db);
      if (method === "PUT") return await saveNexusSettings(request, db, env);
    }
    if (method === "GET" && path === "/api/nexus/settings/events") {
      if (!sessionUser || !isAdministrator(sessionUser)) return apiJson({ error: { code: "forbidden" } }, 403);
      return await getNexusEvents(db, env);
    }
    if (method === "GET" && path === "/api/nexus/snapshot") return await getNexusSnapshot(db, env);
    if (method === "GET" && path === "/api/discovery/pairing") return await getPairingInfo(request, env);
    if (method === "GET" && path === "/api/discovery/diagnostics") return getDiscoveryDiagnostics(env);
    const nexusDataMatch = rawPath.match(/^\/api\/nexus\/event\/([^/]+)(?:\/(pits|map))?$/i);
    if (method === "GET" && nexusDataMatch) {
      let eventKey: string;
      try {
        eventKey = decodeURIComponent(nexusDataMatch[1]);
      } catch {
        return new Response(null, { status: 400 });
      }
      return await getNexusEventData(
        db,
        env,
        eventKey,
        (nexusDataMatch[2] ?? "event") as "event" | "pits" | "map",
      );
    }

    const alliancePlanMatch = path.match(/^\/api\/allianceplans\/event\/(\d+)$/);
    if (alliancePlanMatch) {
      const eventId = Number(alliancePlanMatch[1]);
      if (!Number.isSafeInteger(eventId) || eventId <= 0) return new Response(null, { status: 404 });
      if (method === "GET") return await getAlliancePlan(db, eventId);
      if (method === "PUT") return await publishAlliancePlan(request, db, eventId);
    }

    const allianceSelectionEventMatch = path.match(/^\/api\/allianceselection\/event\/(\d+)$/);
    if (allianceSelectionEventMatch && method === "GET") {
      const eventId = Number(allianceSelectionEventMatch[1]);
      return Number.isSafeInteger(eventId) && eventId > 0
        ? await getAllianceSelectionForEvent(db, eventId)
        : new Response(null, { status: 404 });
    }

    const allianceSelectionActionMatch = path.match(/^\/api\/allianceselection\/(start|pick|decline|undo)$/);
    if (allianceSelectionActionMatch && method === "POST") {
      switch (allianceSelectionActionMatch[1]) {
        case "start": return await startAllianceSelection(request, db);
        case "pick": return await pickAllianceTeam(request, db);
        case "decline": return await declineAllianceTeam(request, db);
        case "undo": return await undoAllianceSelection(request, db);
      }
    }

    const allianceSelectionIdMatch = path.match(/^\/api\/allianceselection\/(\d+)$/);
    if (allianceSelectionIdMatch && method === "DELETE") {
      const selectionId = Number(allianceSelectionIdMatch[1]);
      return Number.isSafeInteger(selectionId) && selectionId > 0
        ? await deleteAllianceSelection(db, selectionId)
        : new Response(null, { status: 404 });
    }

    const allianceSuggestionMatch = path.match(/^\/api\/allianceplans\/event\/(\d+)\/suggestions$/);
    if (allianceSuggestionMatch && method === "POST") {
      const eventId = Number(allianceSuggestionMatch[1]);
      return Number.isSafeInteger(eventId) && eventId > 0
        ? await suggestAllianceTeam(request, db, eventId)
        : new Response(null, { status: 404 });
    }

    const allianceReviewMatch = path.match(
      /^\/api\/allianceplans\/event\/(\d+)\/suggestions\/([0-9a-f-]{36})\/review$/,
    );
    if (allianceReviewMatch && method === "POST") {
      const eventId = Number(allianceReviewMatch[1]);
      return Number.isSafeInteger(eventId) && eventId > 0
        ? await reviewAllianceSuggestion(request, db, eventId, allianceReviewMatch[2])
        : new Response(null, { status: 404 });
    }

    const eventOperationsMatch = path.match(/^\/api\/eventoperations\/(\d+)$/);
    if (eventOperationsMatch) {
      const eventId = Number(eventOperationsMatch[1]);
      if (!Number.isSafeInteger(eventId) || eventId <= 0) return new Response(null, { status: 404 });
      if (method === "GET") return await getEventOperations(db, eventId);
    }

    const eventOperationMatch = path.match(/^\/api\/eventoperations\/(\d+)\/(sync|mode)\/(teams|matches|rankings)$/);
    if (eventOperationMatch) {
      const eventId = Number(eventOperationMatch[1]);
      const resource = eventOperationMatch[3] as "teams" | "matches" | "rankings";
      if (!Number.isSafeInteger(eventId) || eventId <= 0) return new Response(null, { status: 404 });
      if (eventOperationMatch[2] === "sync" && method === "POST") {
        return await queueEventSync(db, env.EVENT_SYNC_QUEUE, eventId, resource);
      }
      if (eventOperationMatch[2] === "mode" && method === "PUT") {
        return await setEventSyncMode(request, db, eventId, resource);
      }
    }

    const eventOperationWrite = path.match(/^\/api\/eventoperations\/(\d+)\/(teams|rankings|matches)$/);
    if (eventOperationWrite) {
      const eventId = Number(eventOperationWrite[1]);
      if (!Number.isSafeInteger(eventId) || eventId <= 0) return new Response(null, { status: 404 });
      if (eventOperationWrite[2] === "teams" && method === "POST") return await addEventTeam(request, db, eventId);
      if (eventOperationWrite[2] === "rankings" && method === "PUT") return await saveEventRankings(request, db, eventId);
      if (eventOperationWrite[2] === "matches" && method === "PUT") return await saveEventMatch(request, db, eventId);
    }

    const eventSyncMatch = path.match(/^\/api\/events\/(\d+)\/sync-(teams|matches|rankings)$/);
    if (method === "POST" && eventSyncMatch) {
      const eventId = Number(eventSyncMatch[1]);
      if (!Number.isSafeInteger(eventId) || eventId <= 0) return new Response(null, { status: 404 });
      return await queueEventSync(db, env.EVENT_SYNC_QUEUE, eventId, eventSyncMatch[2] as "teams" | "matches" | "rankings");
    }

    const blueAlliancePreviewMatch = path.match(/^\/api\/events\/(\d+)\/bluealliance\/(teams|matches)$/);
    if (method === "GET" && blueAlliancePreviewMatch) {
      const eventId = Number(blueAlliancePreviewMatch[1]);
      if (!Number.isSafeInteger(eventId) || eventId <= 0) return new Response(null, { status: 404 });
      return await getBlueAlliancePreview(
        db,
        eventId,
        blueAlliancePreviewMatch[2] as "teams" | "matches",
        env.TBA_API_KEY,
      );
    }

    const rankingsMatch = path.match(/^\/api\/eventrankings\/(event|sync)\/(\d+)$/);
    if (rankingsMatch) {
      const eventId = Number(rankingsMatch[2]);
      if (!Number.isSafeInteger(eventId) || eventId <= 0) return new Response(null, { status: 404 });
      if (method === "GET" && rankingsMatch[1] === "event") return await getEventRankings(db, eventId);
      if (method === "POST" && rankingsMatch[1] === "sync") {
        return await queueEventSync(db, env.EVENT_SYNC_QUEUE, eventId, "rankings");
      }
    }

    if (method === "GET" && path === "/api/seasons") return await getSeasons(db);
    if (method === "POST" && path === "/api/seasons") return await createSeason(request, db);
    if (method === "GET" && path === "/api/events") return await getEvents(db);
    if (method === "POST" && path === "/api/events") return await createEvent(request, db);
    if (method === "GET" && path === "/api/teams") return await getTeams(db);
    if (method === "POST" && path === "/api/teams") return await createTeam(request, db);
    if (method === "GET" && path === "/api/eventteams") return await getEventTeams(db);
    if (method === "POST" && path === "/api/eventteams") return await addEventTeamRecord(request, db);
    if (path === "/api/matches" && method === "POST") {
      const revision = requestedRevision(url);
      if (revision.invalid) return apiText("The revision must be a valid integer.", 400);
      return await createMatch(request, db, revision.revision);
    }
    if (method === "GET" && path === "/api/matches") return await getMatches(db);
    if (method === "GET" && path === "/api/gameforms") return await getGameForms(db);
    if (method === "POST" && path === "/api/gameforms") return await createGameForm(request, db);
    if (method === "POST" && path === "/api/gameforms/restore-system-fields") {
      return await restoreSystemFields(db);
    }
    const formFieldsMatch = path.match(/^\/api\/gameforms\/(\d+)\/fields$/);
    if (formFieldsMatch && method === "POST") {
      const formId = Number(formFieldsMatch[1]);
      return Number.isSafeInteger(formId) && formId > 0
        ? await createGameField(request, db, formId)
        : new Response(null, { status: 404 });
    }
    const fieldOptionsMatch = path.match(/^\/api\/gameforms\/fields\/(\d+)\/options$/);
    if (fieldOptionsMatch && method === "POST") {
      const fieldId = Number(fieldOptionsMatch[1]);
      return Number.isSafeInteger(fieldId) && fieldId > 0
        ? await createFieldOption(request, db, fieldId)
        : new Response(null, { status: 404 });
    }
    const fieldOptionMatch = path.match(/^\/api\/gameforms\/fields\/options\/(\d+)$/);
    if (fieldOptionMatch) {
      const optionId = Number(fieldOptionMatch[1]);
      if (!Number.isSafeInteger(optionId) || optionId <= 0) return new Response(null, { status: 404 });
      if (method === "PUT") return await updateFieldOption(request, db, optionId);
      if (method === "DELETE") return await deleteFieldOption(db, optionId);
    }
    const gameFieldMatch = path.match(/^\/api\/gameforms\/fields\/(\d+)$/);
    if (gameFieldMatch) {
      const fieldId = Number(gameFieldMatch[1]);
      if (!Number.isSafeInteger(fieldId) || fieldId <= 0) return new Response(null, { status: 404 });
      if (method === "PUT") return await updateGameField(request, db, fieldId);
      if (method === "DELETE") return await deleteGameField(db, fieldId);
    }
    if (method === "GET" && path === "/api/activescoutingconfiguration") {
      return await getActiveConfiguration(db);
    }
    if (method === "PUT" && path === "/api/activescoutingconfiguration") {
      return await saveActiveConfiguration(request, db, false);
    }
    if (method === "PUT" && path === "/api/activescoutingconfiguration/devices") {
      return await saveActiveConfiguration(request, db, true);
    }

    if (method === "GET" && path === "/api/gameformsubmissions") {
      return await getSubmissions(db, url);
    }
    if (method === "POST" && path === "/api/gameformsubmissions") {
      return await createLegacySubmission(request, db);
    }
    if (method === "POST" && path === "/api/gameformsubmissions/scout") {
      return await createScoutSubmission(request, db);
    }
    if (method === "DELETE" && path === "/api/gameformsubmissions/clear-all") {
      if (!sessionUser || !isAdministrator(sessionUser)) {
        return apiJson({ error: { code: "forbidden" } }, 403);
      }
      return await clearAllSubmissions(db);
    }

    const submissionsForEventMatch = path.match(/^\/api\/gameformsubmissions\/event\/(\-?\d+)$/);
    if (method === "GET" && submissionsForEventMatch) {
      const eventId = Number(submissionsForEventMatch[1]);
      return Number.isSafeInteger(eventId)
        ? await getSubmissionForEvent(db, eventId)
        : new Response(null, { status: 404 });
    }

    const submissionIdMatch = path.match(/^\/api\/gameformsubmissions\/(\-?\d+)$/);
    if (submissionIdMatch) {
      const id = Number(submissionIdMatch[1]);
      if (!Number.isSafeInteger(id)) return new Response(null, { status: 404 });
      if (method === "GET") return await getSubmission(db, id);
      if (method === "PUT") return await updateSubmission(request, db, id);
    }

    const teamNumberMatch = path.match(/^\/api\/teams\/number\/(\-?\d+)$/);
    if (method === "GET" && teamNumberMatch) {
      const teamNumber = Number(teamNumberMatch[1]);
      return Number.isSafeInteger(teamNumber)
        ? await getTeamByNumber(db, teamNumber)
        : new Response(null, { status: 404 });
    }

    const eventTeamsMatch = path.match(/^\/api\/eventteams\/event\/(\-?\d+)$/);
    if (method === "GET" && eventTeamsMatch) {
      const eventId = Number(eventTeamsMatch[1]);
      return Number.isSafeInteger(eventId)
        ? await getEventTeams(db, eventId)
        : new Response(null, { status: 404 });
    }

    const eventTeamIdMatch = path.match(/^\/api\/eventteams\/(\-?\d+)$/);
    if (method === "DELETE" && eventTeamIdMatch) {
      const id = Number(eventTeamIdMatch[1]);
      return Number.isSafeInteger(id)
        ? await deleteEventTeamRecord(db, id)
        : new Response(null, { status: 404 });
    }

    const matchCollectionMatch = path.match(/^\/api\/matches\/(event|team)\/(\-?\d+)$/);
    if (method === "GET" && matchCollectionMatch) {
      const id = Number(matchCollectionMatch[2]);
      if (!Number.isSafeInteger(id)) return new Response(null, { status: 404 });
      return await getMatches(db, { kind: matchCollectionMatch[1] as "event" | "team", id });
    }

    const matchIdMatch = path.match(/^\/api\/matches\/(\-?\d+)$/);
    if (matchIdMatch && (method === "PUT" || method === "DELETE")) {
      const id = Number(matchIdMatch[1]);
      if (!Number.isSafeInteger(id)) return new Response(null, { status: 404 });
      if (method === "DELETE") return await deleteMatch(db, id);
      const revision = requestedRevision(url);
      if (revision.invalid) return apiText("The revision must be a valid integer.", 400);
      return await updateMatch(request, db, id, revision.revision);
    }
    if (method === "GET" && matchIdMatch) {
      const id = Number(matchIdMatch[1]);
      return Number.isSafeInteger(id) ? await getMatch(db, id) : new Response(null, { status: 404 });
    }

    const itemMatch = path.match(/^\/api\/(seasons|events|teams|gameforms)\/(\-?\d+)$/);
    if (method === "GET" && itemMatch) {
      const id = Number(itemMatch[2]);
      if (!Number.isSafeInteger(id)) return new Response(null, { status: 404 });
      if (itemMatch[1] === "seasons") return await getSeason(db, id);
      if (itemMatch[1] === "events") return await getEvent(db, id);
      if (itemMatch[1] === "teams") return await getTeam(db, id);
      return await getGameForm(db, id);
    }

    if (itemMatch) {
      const id = Number(itemMatch[2]);
      if (!Number.isSafeInteger(id)) return new Response(null, { status: 404 });
      if (itemMatch[1] === "seasons" && method === "DELETE") return await deleteSeason(db, id);
      if (itemMatch[1] === "events" && method === "PUT") return await updateEvent(request, db, id);
      if (itemMatch[1] === "events" && method === "DELETE") return await deleteEvent(db, id);
      if (itemMatch[1] === "teams" && method === "PUT") return await updateTeam(request, db, id);
      if (itemMatch[1] === "teams" && method === "DELETE") return await deleteTeam(db, id);
      if (itemMatch[1] === "gameforms" && method === "PUT") return await updateGameForm(request, db, id);
      if (itemMatch[1] === "gameforms" && method === "DELETE") return await deleteGameForm(db, id);
    }

    const eventNexusKeyMatch = path.match(/^\/api\/events\/(\-?\d+)\/nexus-key$/);
    if (method === "PUT" && eventNexusKeyMatch) {
      if (!sessionUser || !isAdministrator(sessionUser)) return apiJson({ error: { code: "forbidden" } }, 403);
      const id = Number(eventNexusKeyMatch[1]);
      return Number.isSafeInteger(id)
        ? await updateEventNexusKey(request, db, id)
        : new Response(null, { status: 404 });
    }

    return unavailable();
  } catch (error) {
    console.error(JSON.stringify({
      message: "Cloudflare API request failed",
      path,
      error: error instanceof Error ? error.message : String(error),
    }));
    return apiJson({ error: { code: "internal_server_error" } }, 500);
  }
}

export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    await consumeEventSyncBatch(batch, env);
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    const normalizedPath = pathname.toLowerCase();

    if (normalizedPath === "/api" || normalizedPath.startsWith("/api/")) {
      return routeApi(request, env);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
