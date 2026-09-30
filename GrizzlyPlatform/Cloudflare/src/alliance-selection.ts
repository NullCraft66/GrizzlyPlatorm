const MAX_SELECTION_BODY_BYTES = 64 * 1_024;
const MAX_RANKED_TEAMS = 2_000;
const TEAM_QUERY_CHUNK_SIZE = 100;

type Row = Record<string, unknown>;
type Reader = Pick<D1Database, "prepare">;

interface SelectionRow extends Row {
  id: number;
  eventId: number;
  status: string;
  currentRound: number;
  currentAlliance: number;
  startedAt: string | null;
  completedAt: string | null;
  mutationId: string;
}

interface AllianceRow extends Row {
  id: number;
  allianceNumber: number;
  captainTeamId: number;
  captainTeamNumber: number | null;
  captainTeamName: string | null;
}

interface MemberRow extends Row {
  allianceId: number;
  allianceNumber: number;
  teamId: number;
  teamNumber: number | null;
  teamName: string | null;
  selectionRound: number;
  selectionOrder: number;
}

interface PickRow extends Row {
  id: number;
  allianceNumber: number;
  round: number;
  pickOrder: number;
  invitingTeamId: number | null;
  invitingTeamNumber: number | null;
  invitedTeamId: number;
  invitedTeamNumber: number | null;
  result: string;
  timestamp: string;
  previousStateJson: string | null;
}

interface RankedTeamRow extends Row {
  teamId: number;
  rank: number;
}

interface TeamRow extends Row {
  id: number;
  teamNumber: number;
}

interface SelectionState {
  selection: SelectionRow;
  alliances: Array<AllianceRow & { members: MemberRow[] }>;
  picks: PickRow[];
  rankedTeams: RankedTeamRow[];
}

interface SelectionSnapshot {
  status: string;
  currentRound: number;
  currentAlliance: number;
  alliances: Array<{
    allianceNumber: number;
    captainTeamId: number;
    memberTeamIds: number[];
  }>;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function text(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function property(body: Record<string, unknown>, key: string): unknown {
  const wanted = key.toLowerCase();
  const found = Object.keys(body).find((candidate) => candidate.toLowerCase() === wanted);
  return found === undefined ? undefined : body[found];
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function isPositiveInteger(value: unknown): value is number {
  return isInteger(value) && value > 0;
}

async function readBody(
  request: Request,
): Promise<{ body?: Record<string, unknown>; response?: Response }> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return { response: text("A valid Alliance Selection request is required.", 400) };
  }

  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_SELECTION_BODY_BYTES) {
    return { response: text("The request body is too large.", 413) };
  }

  const reader = request.body?.getReader();
  if (!reader) return { response: text("A JSON request body is required.", 400) };

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SELECTION_BODY_BYTES) {
        await reader.cancel();
        return { response: text("The request body is too large.", 413) };
      }
      chunks.push(value);
    }

    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
    if (!isObject(value)) return { response: text("A valid Alliance Selection request is required.", 400) };
    return { body: value };
  } catch {
    return { response: text("A valid Alliance Selection request is required.", 400) };
  } finally {
    reader.releaseLock();
  }
}

async function first<T extends Row>(db: Reader, sql: string, values: unknown[] = []): Promise<T | null> {
  const statement = db.prepare(sql);
  return values.length > 0
    ? statement.bind(...values).first<T>()
    : statement.first<T>();
}

async function all<T extends Row>(db: Reader, sql: string, values: unknown[] = []): Promise<T[]> {
  const statement = db.prepare(sql);
  const result = values.length > 0
    ? await statement.bind(...values).all<T>()
    : await statement.all<T>();
  return result.results ?? [];
}

function changedRows(result: { meta?: { changes?: unknown } } | undefined): number {
  const changes = result?.meta?.changes;
  return typeof changes === "number" ? changes : 0;
}

async function loadSelection(db: Reader, selectionId: number): Promise<SelectionState | null> {
  const selection = await first<SelectionRow>(db, `SELECT Id AS id, EventId AS eventId,
      Status AS status, CurrentRound AS currentRound, CurrentAlliance AS currentAlliance,
      StartedAt AS startedAt, CompletedAt AS completedAt, MutationId AS mutationId
    FROM AllianceSelections WHERE Id = ?`, [selectionId]);
  if (!selection) return null;

  const alliances = await all<AllianceRow>(db, `SELECT a.Id AS id,
      a.AllianceNumber AS allianceNumber, a.CaptainTeamId AS captainTeamId,
      captain.TeamNumber AS captainTeamNumber, captain.Name AS captainTeamName
    FROM Alliances a
    LEFT JOIN Teams captain ON captain.Id = a.CaptainTeamId
    WHERE a.AllianceSelectionId = ?
    ORDER BY a.AllianceNumber`, [selectionId]);
  const members = await all<MemberRow>(db, `SELECT m.AllianceId AS allianceId,
      a.AllianceNumber AS allianceNumber, m.TeamId AS teamId,
      team.TeamNumber AS teamNumber, team.Name AS teamName,
      m.SelectionRound AS selectionRound, m.SelectionOrder AS selectionOrder
    FROM AllianceMembers m
    JOIN Alliances a ON a.Id = m.AllianceId
    LEFT JOIN Teams team ON team.Id = m.TeamId
    WHERE a.AllianceSelectionId = ?
    ORDER BY a.AllianceNumber, m.SelectionOrder`, [selectionId]);
  const picks = await all<PickRow>(db, `SELECT p.Id AS id,
      p.AllianceNumber AS allianceNumber, p.Round AS round, p.PickOrder AS pickOrder,
      p.InvitingTeamId AS invitingTeamId, inviting.TeamNumber AS invitingTeamNumber,
      p.InvitedTeamId AS invitedTeamId, invited.TeamNumber AS invitedTeamNumber,
      p.Result AS result, p.Timestamp AS timestamp,
      p.PreviousStateJson AS previousStateJson
    FROM AlliancePicks p
    LEFT JOIN Teams invited ON invited.Id = p.InvitedTeamId
    LEFT JOIN Teams inviting ON inviting.Id = p.InvitingTeamId
    WHERE p.AllianceSelectionId = ?
    ORDER BY p.Round, p.PickOrder`, [selectionId]);
  const rankedTeams = await all<RankedTeamRow>(db, `SELECT TeamId AS teamId, Rank AS rank
    FROM AllianceRankedTeam WHERE AllianceSelectionId = ? ORDER BY Rank`, [selectionId]);

  return {
    selection,
    alliances: alliances.map((alliance) => ({
      ...alliance,
      members: members.filter((member) => member.allianceId === alliance.id),
    })),
    picks,
    rankedTeams,
  };
}

function selectionResponse(state: SelectionState): Record<string, unknown> {
  const selection = state.selection;
  return {
    id: selection.id,
    eventId: selection.eventId,
    status: selection.status,
    currentRound: selection.currentRound,
    currentAlliance: selection.currentAlliance,
    startedAt: selection.startedAt,
    completedAt: selection.completedAt,
    alliances: state.alliances.map((alliance) => ({
      id: alliance.id,
      allianceNumber: alliance.allianceNumber,
      captainTeamId: alliance.captainTeamId,
      captainTeamNumber: alliance.captainTeamNumber,
      captainTeamName: alliance.captainTeamName,
      members: alliance.members.map((member) => ({
        teamId: member.teamId,
        teamNumber: member.teamNumber,
        teamName: member.teamName,
        selectionRound: member.selectionRound,
        selectionOrder: member.selectionOrder,
      })),
    })),
    picks: state.picks.map((pick) => ({
      id: pick.id,
      allianceNumber: pick.allianceNumber,
      round: pick.round,
      pickOrder: pick.pickOrder,
      invitingTeamId: pick.invitingTeamId,
      invitingTeamNumber: pick.invitingTeamNumber,
      invitedTeamId: pick.invitedTeamId,
      invitedTeamNumber: pick.invitedTeamNumber,
      result: pick.result,
      timestamp: pick.timestamp,
    })),
  };
}

export async function getAllianceSelectionForEvent(db: D1Database, eventId: number): Promise<Response> {
  const session = db.withSession("first-primary");
  const event = await first<{ id: number }>(session, "SELECT Id AS id FROM Events WHERE Id = ?", [eventId]);
  if (!event) return text("The specified event does not exist.", 404);

  const selection = await first<{ id: number }>(session,
    "SELECT Id AS id FROM AllianceSelections WHERE EventId = ?", [eventId]);
  if (!selection) return json({ exists: false, eventId });

  const state = await loadSelection(session, selection.id);
  return state
    ? json({ exists: true, selection: selectionResponse(state) })
    : text("The specified Alliance Selection does not exist.", 404);
}

async function existingTeamIds(db: Reader, teamIds: number[]): Promise<Set<number>> {
  const found = new Set<number>();
  for (let start = 0; start < teamIds.length; start += TEAM_QUERY_CHUNK_SIZE) {
    const chunk = teamIds.slice(start, start + TEAM_QUERY_CHUNK_SIZE);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await all<{ id: number }>(db,
      `SELECT Id AS id FROM Teams WHERE Id IN (${placeholders})`, chunk);
    for (const row of rows) found.add(row.id);
  }
  return found;
}

export async function startAllianceSelection(
  request: Request,
  db: D1Database,
): Promise<Response> {
  const { body, response } = await readBody(request);
  if (response) return response;

  const eventId = property(body!, "eventId");
  const rawTeamIds = property(body!, "teamIds");
  const rawRankedTeamIds = property(body!, "rankedTeamIds");
  if (!isPositiveInteger(eventId)) return text("The specified event does not exist.", 400);

  const teamIds = Array.isArray(rawTeamIds) ? rawTeamIds : null;
  const rankedTeamIds = Array.isArray(rawRankedTeamIds) ? rawRankedTeamIds : null;
  if (!teamIds || teamIds.length !== 8 || !teamIds.every(isPositiveInteger)) {
    return text("Exactly 8 alliance captain teams are required.", 400);
  }
  if (!rankedTeamIds || rankedTeamIds.length < 8 || rankedTeamIds.length > MAX_RANKED_TEAMS
      || !rankedTeamIds.every(isPositiveInteger)) {
    return text("A complete ranked team list is required.", 400);
  }
  if (new Set(rankedTeamIds).size !== rankedTeamIds.length) {
    return text("The ranked team list cannot contain duplicate teams.", 400);
  }

  const session = db.withSession("first-primary");
  const event = await first<{ id: number }>(session, "SELECT Id AS id FROM Events WHERE Id = ?", [eventId]);
  if (!event) return text("The specified event does not exist.", 400);

  const existing = await first<{ id: number }>(session,
    "SELECT Id AS id FROM AllianceSelections WHERE EventId = ?", [eventId]);
  if (existing) return text("Alliance Selection has already been created for this event.", 409);

  const teams = await existingTeamIds(session, rankedTeamIds);
  if (teams.size !== rankedTeamIds.length) {
    return text("One or more ranked teams do not exist.", 400);
  }
  if (!teamIds.every((teamId, index) => teamId === rankedTeamIds[index])) {
    return text("The first 8 ranked teams must be the alliance captains.", 400);
  }

  const eventRankings = await all<{ teamId: number }>(session, `SELECT TeamId AS teamId
    FROM EventRankings WHERE EventId = ? ORDER BY Rank`, [eventId]);
  if (!rankedTeamIds.every((teamId, index) => teamId === eventRankings[index]?.teamId)
      || rankedTeamIds.length !== eventRankings.length) {
    return text("Rankings changed or contain teams from another event. Refresh before starting.", 400);
  }

  const startedAt = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [db.prepare(`INSERT INTO AllianceSelections
      (EventId, Status, CurrentRound, CurrentAlliance, StartedAt, MutationId)
    SELECT ?, 'InProgress', 1, 1, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM AllianceSelections WHERE EventId = ?)
      AND EXISTS (SELECT 1 FROM Events WHERE Id = ?)
    RETURNING Id AS id`).bind(eventId, startedAt, mutationId, eventId, eventId)];

  statements.push(db.prepare(`INSERT INTO AllianceRankedTeam (AllianceSelectionId, TeamId, Rank)
    SELECT selection.Id, CAST(ranked.value AS INTEGER), CAST(ranked.key AS INTEGER) + 1
    FROM AllianceSelections selection
    CROSS JOIN json_each(?) AS ranked
    WHERE selection.EventId = ? AND selection.MutationId = ?`)
    .bind(JSON.stringify(rankedTeamIds), eventId, mutationId));
  statements.push(db.prepare(`INSERT INTO Alliances (AllianceSelectionId, AllianceNumber, CaptainTeamId)
    SELECT selection.Id, CAST(captains.key AS INTEGER) + 1, CAST(captains.value AS INTEGER)
    FROM AllianceSelections selection
    CROSS JOIN json_each(?) AS captains
    WHERE selection.EventId = ? AND selection.MutationId = ?`)
    .bind(JSON.stringify(teamIds), eventId, mutationId));

  const results = await db.batch(statements);
  if (changedRows(results[0]) === 0) {
    const eventStillExists = await first<{ id: number }>(session,
      "SELECT Id AS id FROM Events WHERE Id = ?", [eventId]);
    return eventStillExists
      ? text("Alliance Selection has already been created for this event.", 409)
      : text("The specified event does not exist.", 400);
  }

  const firstResult = results[0]?.results?.[0];
  const selectionId = isObject(firstResult) && isPositiveInteger(firstResult.id) ? firstResult.id : null;
  if (selectionId === null) return json({ error: { code: "alliance_selection_start_failed" } }, 500);

  return Response.json({
    id: selectionId,
    eventId,
    status: "InProgress",
    currentRound: 1,
    currentAlliance: 1,
  }, {
    status: 201,
    headers: {
      "Cache-Control": "no-store",
      Location: `/api/AllianceSelection/event/${eventId}`,
    },
  });
}

function snapshotFor(state: SelectionState): SelectionSnapshot {
  return {
    status: state.selection.status,
    currentRound: state.selection.currentRound,
    currentAlliance: state.selection.currentAlliance,
    alliances: state.alliances.map((alliance) => ({
      allianceNumber: alliance.allianceNumber,
      captainTeamId: alliance.captainTeamId,
      memberTeamIds: alliance.members.map((member) => member.teamId),
    })),
  };
}

function parseSnapshot(value: string | null): SelectionSnapshot | null {
  if (value === null || value.length > MAX_SELECTION_BODY_BYTES) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isObject(parsed) || typeof parsed.status !== "string"
        || !isInteger(parsed.currentRound) || !isInteger(parsed.currentAlliance)
        || !Array.isArray(parsed.alliances)) return null;

    const alliances: SelectionSnapshot["alliances"] = [];
    for (const item of parsed.alliances) {
      if (!isObject(item) || !isPositiveInteger(item.allianceNumber)
          || !isPositiveInteger(item.captainTeamId) || !Array.isArray(item.memberTeamIds)
          || !item.memberTeamIds.every(isPositiveInteger)) return null;
      alliances.push({
        allianceNumber: item.allianceNumber,
        captainTeamId: item.captainTeamId,
        memberTeamIds: item.memberTeamIds,
      });
    }
    if (new Set(alliances.map((alliance) => alliance.allianceNumber)).size !== alliances.length) return null;
    return {
      status: parsed.status,
      currentRound: parsed.currentRound,
      currentAlliance: parsed.currentAlliance,
      alliances,
    };
  } catch {
    return null;
  }
}

function claimSelection(
  db: D1Database,
  state: SelectionState,
  mutationId: string,
): D1PreparedStatement {
  const { selection, picks } = state;
  return db.prepare(`UPDATE AllianceSelections SET MutationId = ?
    WHERE Id = ? AND MutationId = ? AND Status = ? AND CurrentRound = ? AND CurrentAlliance = ?
      AND (SELECT COUNT(*) FROM AlliancePicks WHERE AllianceSelectionId = ?) = ?
    RETURNING Id AS id`)
    .bind(mutationId, selection.id, selection.mutationId, selection.status,
      selection.currentRound, selection.currentAlliance, selection.id, picks.length);
}

function validDraftPosition(selection: SelectionRow): string | null {
  if (selection.status !== "InProgress") return "Alliance Selection is not currently in progress.";
  if (selection.currentRound < 1 || selection.currentRound > 2) {
    return "The Alliance Selection is in an invalid round.";
  }
  if (selection.currentAlliance < 1 || selection.currentAlliance > 8) {
    return "The Alliance Selection is at an invalid alliance.";
  }
  return null;
}

function parsePickInput(body: Record<string, unknown>): {
  selectionId: number;
  allianceNumber: number;
  teamId: number;
  expectedRound?: number;
  expectedPickCount?: number;
} | null {
  const selectionId = property(body, "allianceSelectionId");
  const allianceNumber = property(body, "allianceNumber");
  const teamId = property(body, "teamId");
  const expectedRound = property(body, "expectedRound");
  const expectedPickCount = property(body, "expectedPickCount");
  if (!isPositiveInteger(selectionId) || !isPositiveInteger(allianceNumber)
      || !isPositiveInteger(teamId)
      || (expectedRound != null && !isPositiveInteger(expectedRound))
      || (expectedPickCount != null && (!isInteger(expectedPickCount) || expectedPickCount < 0))) {
    return null;
  }
  return {
    selectionId,
    allianceNumber,
    teamId,
    ...(expectedRound == null ? {} : { expectedRound }),
    ...(expectedPickCount == null ? {} : { expectedPickCount }),
  };
}

function nextDraftPosition(selection: SelectionRow): {
  status: string;
  round: number;
  alliance: number;
  completedAt: string | null;
} {
  let status = selection.status;
  let round = selection.currentRound;
  let alliance = selection.currentAlliance;
  let completedAt: string | null = null;
  if (round === 1) {
    if (alliance < 8) alliance++;
    else {
      round = 2;
      alliance = 8;
    }
  } else if (alliance > 1) {
    alliance--;
  } else {
    status = "Completed";
    completedAt = new Date().toISOString();
  }
  return { status, round, alliance, completedAt };
}

async function recordInvitation(
  request: Request,
  db: D1Database,
  result: "Accepted" | "Declined",
): Promise<Response> {
  const { body, response } = await readBody(request);
  if (response) return response;
  const input = parsePickInput(body!);
  if (!input) return text("The alliance invitation is invalid.", 400);

  const session = db.withSession("first-primary");
  const state = await loadSelection(session, input.selectionId);
  if (!state) return text("The specified Alliance Selection does not exist.", 404);

  const invalidPosition = validDraftPosition(state.selection);
  if (invalidPosition) return text(invalidPosition, 400);
  if (input.allianceNumber !== state.selection.currentAlliance) {
    return text(`It is currently Alliance ${state.selection.currentAlliance}'s turn.`, 400);
  }
  if ((input.expectedRound !== undefined && input.expectedRound !== state.selection.currentRound)
      || (input.expectedPickCount !== undefined && input.expectedPickCount !== state.picks.length)) {
    return text("The draft has changed. Refresh before recording another invitation.", 409);
  }

  const alliance = state.alliances.find((item) => item.allianceNumber === state.selection.currentAlliance);
  if (!alliance) return text("The current alliance does not exist.", 400);
  if (!state.rankedTeams.some((ranked) => ranked.teamId === input.teamId)) {
    return text("This team is not in the event's saved ranked team list.", 400);
  }

  const invitedCaptain = state.alliances.find((item) => item.captainTeamId === input.teamId);
  if (invitedCaptain && (state.selection.currentRound !== 1
      || invitedCaptain.allianceNumber <= state.selection.currentAlliance
      || invitedCaptain.members.length > 0)) {
    return text("Only a later captain without selected members can be invited in round one.", 400);
  }

  const team = await first<TeamRow>(session,
    "SELECT Id AS id, TeamNumber AS teamNumber FROM Teams WHERE Id = ?", [input.teamId]);
  if (!team) return text("The specified team does not exist.", 400);
  if (alliance.captainTeamId === team.id) {
    return text(result === "Accepted"
      ? "An alliance captain cannot select itself."
      : "An alliance captain cannot decline its own invitation.", 400);
  }
  if (state.alliances.some((item) => item.members.some((member) => member.teamId === team.id))) {
    return text("This team has already been selected.", 409);
  }
  if (state.picks.some((pick) => pick.invitedTeamId === team.id && pick.result === "Declined")) {
    return text("This team has already declined an alliance invitation.", 409);
  }
  if (result === "Accepted" && alliance.members.length >= 2) {
    return text("This alliance already has two selected members.", 400);
  }
  if (result === "Declined" && alliance.members.length >= 2) {
    return text("This alliance already has two selected members.", 400);
  }

  const selectionOrder = alliance.members.length + 1;
  let replacementCaptain: RankedTeamRow | null = null;
  if (result === "Accepted" && invitedCaptain) {
    const unavailable = new Set(state.alliances.flatMap((item) => [
      item.captainTeamId,
      ...item.members.map((member) => member.teamId),
    ]));
    unavailable.add(team.id);
    replacementCaptain = state.rankedTeams.find((ranked) => !unavailable.has(ranked.teamId)) ?? null;
    if (!replacementCaptain) {
      return text("No eligible team is available to become the new Alliance 8 captain.", 400);
    }
    if (!state.alliances.some((item) => item.allianceNumber === 8)) {
      return text("Alliance 8 does not exist.", 400);
    }
  }

  const mutationId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const pickOrder = state.picks.length + 1;
  const statements: D1PreparedStatement[] = [claimSelection(db, state, mutationId)];
  const guard = "EXISTS (SELECT 1 FROM AllianceSelections WHERE Id = ? AND MutationId = ?)";
  statements.push(db.prepare(`INSERT INTO AlliancePicks
      (AllianceSelectionId, AllianceNumber, Round, PickOrder, InvitingTeamId,
       InvitedTeamId, Result, Timestamp, PreviousStateJson)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}`)
    .bind(state.selection.id, state.selection.currentAlliance, state.selection.currentRound,
      pickOrder, alliance.captainTeamId, team.id, result, timestamp,
      JSON.stringify(snapshotFor(state)), state.selection.id, mutationId));

  if (result === "Accepted") {
    statements.splice(1, 0, db.prepare(`INSERT INTO AllianceMembers
        (AllianceId, TeamId, SelectionRound, SelectionOrder)
      SELECT ?, ?, ?, ? WHERE ${guard}`)
      .bind(alliance.id, team.id, state.selection.currentRound, selectionOrder,
        state.selection.id, mutationId));

    if (replacementCaptain) {
      for (let number = invitedCaptain!.allianceNumber; number < 8; number++) {
        statements.push(db.prepare(`UPDATE Alliances
          SET CaptainTeamId = (SELECT CaptainTeamId FROM Alliances
            WHERE AllianceSelectionId = ? AND AllianceNumber = ?)
          WHERE AllianceSelectionId = ? AND AllianceNumber = ? AND ${guard}`)
          .bind(state.selection.id, number + 1, state.selection.id, number,
            state.selection.id, mutationId));
      }
      statements.push(db.prepare(`UPDATE Alliances SET CaptainTeamId = ?
        WHERE AllianceSelectionId = ? AND AllianceNumber = 8 AND ${guard}`)
        .bind(replacementCaptain.teamId, state.selection.id, state.selection.id, mutationId));
    }

    const next = nextDraftPosition(state.selection);
    statements.push(db.prepare(`UPDATE AllianceSelections
      SET Status = ?, CurrentRound = ?, CurrentAlliance = ?, CompletedAt = ?
      WHERE Id = ? AND MutationId = ?`)
      .bind(next.status, next.round, next.alliance, next.completedAt,
        state.selection.id, mutationId));
  }

  const batchResults = await db.batch(statements);
  if (changedRows(batchResults[0]) === 0) {
    return text("The draft has changed. Refresh before recording another invitation.", 409);
  }

  const next = result === "Accepted"
    ? nextDraftPosition(state.selection)
    : {
      status: state.selection.status,
      round: state.selection.currentRound,
      alliance: state.selection.currentAlliance,
    };
  return json(result === "Accepted" ? {
    success: true,
    allianceNumber: alliance.allianceNumber,
    teamId: team.id,
    teamNumber: team.teamNumber,
    selectionRound: state.selection.currentRound,
    selectionOrder,
    status: next.status,
    nextRound: next.round,
    nextAlliance: next.alliance,
  } : {
    success: true,
    allianceNumber: alliance.allianceNumber,
    teamId: team.id,
    teamNumber: team.teamNumber,
    result: "Declined",
    selectionRound: state.selection.currentRound,
    selectionOrder,
    status: next.status,
    nextRound: next.round,
    nextAlliance: next.alliance,
  });
}

export async function pickAllianceTeam(request: Request, db: D1Database): Promise<Response> {
  return await recordInvitation(request, db, "Accepted");
}

export async function declineAllianceTeam(request: Request, db: D1Database): Promise<Response> {
  return await recordInvitation(request, db, "Declined");
}

function claimUndo(
  db: D1Database,
  state: SelectionState,
  latestPickId: number,
  mutationId: string,
): D1PreparedStatement {
  return db.prepare(`UPDATE AllianceSelections SET MutationId = ?
    WHERE Id = ? AND MutationId = ? AND Status = ? AND CurrentRound = ? AND CurrentAlliance = ?
      AND (SELECT COUNT(*) FROM AlliancePicks WHERE AllianceSelectionId = ?) = ?
      AND EXISTS (SELECT 1 FROM AlliancePicks WHERE Id = ? AND AllianceSelectionId = ?)
      AND (SELECT MAX(Id) FROM AlliancePicks WHERE AllianceSelectionId = ?) = ?
    RETURNING Id AS id`)
    .bind(mutationId, state.selection.id, state.selection.mutationId, state.selection.status,
      state.selection.currentRound, state.selection.currentAlliance, state.selection.id,
      state.picks.length, latestPickId, state.selection.id, state.selection.id, latestPickId);
}

export async function undoAllianceSelection(request: Request, db: D1Database): Promise<Response> {
  const { body, response } = await readBody(request);
  if (response) return response;
  const selectionId = property(body!, "allianceSelectionId");
  if (!isPositiveInteger(selectionId)) return text("The undo request is invalid.", 400);

  const session = db.withSession("first-primary");
  const state = await loadSelection(session, selectionId);
  if (!state) return text("Alliance Selection not found.", 404);

  const latestPick = await first<PickRow>(session, `SELECT Id AS id,
      PreviousStateJson AS previousStateJson FROM AlliancePicks
    WHERE AllianceSelectionId = ? ORDER BY Id DESC LIMIT 1`, [selectionId]);
  if (!latestPick || !latestPick.previousStateJson) return text("There is no undoable action.", 400);
  const snapshot = parseSnapshot(latestPick.previousStateJson);
  if (!snapshot) return text("The saved snapshot is invalid.", 400);

  const mutationId = crypto.randomUUID();
  const guard = "EXISTS (SELECT 1 FROM AllianceSelections WHERE Id = ? AND MutationId = ?)";
  const statements: D1PreparedStatement[] = [claimUndo(db, state, latestPick.id, mutationId)];
  statements.push(db.prepare(`DELETE FROM AllianceMembers
    WHERE AllianceId IN (SELECT Id FROM Alliances WHERE AllianceSelectionId = ?)
      AND ${guard}`)
    .bind(selectionId, selectionId, mutationId));

  for (const alliance of snapshot.alliances) {
    statements.push(db.prepare(`UPDATE Alliances SET CaptainTeamId = ?
      WHERE AllianceSelectionId = ? AND AllianceNumber = ? AND ${guard}`)
      .bind(alliance.captainTeamId, selectionId, alliance.allianceNumber, selectionId, mutationId));
    for (let index = 0; index < alliance.memberTeamIds.length; index++) {
      statements.push(db.prepare(`INSERT INTO AllianceMembers
          (AllianceId, TeamId, SelectionRound, SelectionOrder)
        SELECT Id, ?, ?, ? FROM Alliances
        WHERE AllianceSelectionId = ? AND AllianceNumber = ? AND ${guard}`)
        .bind(alliance.memberTeamIds[index], snapshot.currentRound, index + 1,
          selectionId, alliance.allianceNumber, selectionId, mutationId));
    }
  }

  statements.push(db.prepare(`UPDATE AllianceSelections
    SET Status = ?, CurrentRound = ?, CurrentAlliance = ?, CompletedAt = NULL
    WHERE Id = ? AND MutationId = ?`)
    .bind(snapshot.status, snapshot.currentRound, snapshot.currentAlliance, selectionId, mutationId));
  statements.push(db.prepare(`DELETE FROM AlliancePicks WHERE Id = ? AND AllianceSelectionId = ?
    AND ${guard}`)
    .bind(latestPick.id, selectionId, selectionId, mutationId));

  const results = await db.batch(statements);
  if (changedRows(results[0]) === 0 || changedRows(results[results.length - 1]) === 0) {
    return text("The draft changed. Refresh before undoing the last action.", 409);
  }
  return json({ success: true });
}

export async function deleteAllianceSelection(db: D1Database, selectionId: number): Promise<Response> {
  const deleted = await db.prepare(`DELETE FROM AllianceSelections WHERE Id = ? RETURNING Id AS id`)
    .bind(selectionId)
    .first<{ id: number }>();
  return deleted
    ? json({ success: true, message: "Alliance Selection deleted successfully." })
    : text("The specified Alliance Selection does not exist.", 404);
}
