const MAX_PLAN_BODY_BYTES = 256 * 1_024;
const MAX_SUGGESTION_BODY_BYTES = 8 * 1_024;
const MAX_REVIEW_BODY_BYTES = 8 * 1_024;
const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

interface EventRow extends Row {
  id: number;
  eventName: string;
  seasonId: number;
}

interface PlanRow extends Row {
  eventId: number;
  version: number;
  ourTeamId: number | null;
  firstPartnerId: number | null;
  secondPartnerId: number | null;
  notes: string;
  updatedAt: string | null;
}

interface WishlistRow extends Row {
  teamId: number;
  position: number;
  reason: string;
}

interface SuggestionRow extends Row {
  id: string;
  eventId: number;
  teamId: number;
  author: string;
  reason: string;
  status: string;
  hostResponse: string;
  createdAt: string;
  reviewedAt: string | null;
}

interface BodyReadResult {
  body?: Record<string, unknown>;
  response?: Response;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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

async function first<T extends Row>(db: D1Database, sql: string, values: unknown[] = []): Promise<T | null> {
  const statement = db.prepare(sql);
  return values.length > 0
    ? statement.bind(...values).first<T>()
    : statement.first<T>();
}

async function all<T extends Row>(db: D1Database, sql: string, values: unknown[] = []): Promise<T[]> {
  const statement = db.prepare(sql);
  const result = values.length > 0
    ? await statement.bind(...values).all<T>()
    : await statement.all<T>();
  return result.results ?? [];
}

function changedRows(result: unknown): number {
  const changes = (result as { meta?: { changes?: unknown } } | null)?.meta?.changes;
  return typeof changes === "number" ? changes : 0;
}

async function readBody(request: Request, maxBytes: number): Promise<BodyReadResult> {
  if (!request.body) return { response: apiText("A JSON request body is required.", 400) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return { response: apiText("The request body is too large.", 413) };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes));
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { response: apiText("The request body must be a JSON object.", 400) };
    }
    return { body: value as Record<string, unknown> };
  } catch {
    return { response: apiText("The request body contains invalid JSON.", 400) };
  }
}

function property(body: Record<string, unknown>, key: string): unknown {
  const wanted = key.toLowerCase();
  const found = Object.keys(body).find((candidate) => candidate.toLowerCase() === wanted);
  return found === undefined ? undefined : body[found];
}

function validPositiveId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function validNonnegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function stringValue(value: unknown, fallback = ""): string | null {
  if (value === undefined) return fallback;
  return typeof value === "string" ? value : null;
}

async function getEvent(db: D1Database, eventId: number): Promise<EventRow | null> {
  return await first<EventRow>(db, `SELECT Id AS id, Name AS eventName, SeasonId AS seasonId
    FROM Events WHERE Id = ?`, [eventId]);
}

async function getPlan(db: D1Database, eventId: number): Promise<PlanRow | null> {
  return await first<PlanRow>(db, `SELECT EventId AS eventId, Version AS version,
      OurTeamId AS ourTeamId, FirstPartnerId AS firstPartnerId,
      SecondPartnerId AS secondPartnerId, Notes AS notes, UpdatedAt AS updatedAt
    FROM AlliancePlans WHERE EventId = ?`, [eventId]);
}

async function getWishlist(db: D1Database, eventId: number): Promise<WishlistRow[]> {
  return await all<WishlistRow>(db, `SELECT TeamId AS teamId, Position AS position, Reason AS reason
    FROM AlliancePlanEntries WHERE EventId = ? ORDER BY Position`, [eventId]);
}

async function getSuggestions(db: D1Database, eventId: number): Promise<SuggestionRow[]> {
  return await all<SuggestionRow>(db, `SELECT Id AS id, EventId AS eventId, TeamId AS teamId,
      Author AS author, Reason AS reason, Status AS status, HostResponse AS hostResponse,
      CreatedAt AS createdAt, ReviewedAt AS reviewedAt
    FROM AlliancePlanSuggestions WHERE EventId = ? ORDER BY CreatedAt DESC`, [eventId]);
}

async function getSuggestion(db: D1Database, id: string, eventId: number): Promise<SuggestionRow | null> {
  return await first<SuggestionRow>(db, `SELECT Id AS id, EventId AS eventId, TeamId AS teamId,
      Author AS author, Reason AS reason, Status AS status, HostResponse AS hostResponse,
      CreatedAt AS createdAt, ReviewedAt AS reviewedAt
    FROM AlliancePlanSuggestions WHERE Id = ? AND EventId = ?`, [id, eventId]);
}

async function getEventTeamIds(db: D1Database, eventId: number): Promise<number[]> {
  const rows = await all<{ teamId: number }>(db, `SELECT TeamId AS teamId FROM EventTeams WHERE EventId = ?
    UNION SELECT TeamId AS teamId FROM EventRankings WHERE EventId = ?`, [eventId, eventId]);
  return rows.map((row) => row.teamId);
}

function suggestionResponse(suggestion: SuggestionRow): Record<string, unknown> {
  return {
    id: suggestion.id,
    eventId: suggestion.eventId,
    teamId: suggestion.teamId,
    author: suggestion.author,
    reason: suggestion.reason,
    status: suggestion.status,
    hostResponse: suggestion.hostResponse,
    createdAt: suggestion.createdAt,
    reviewedAt: suggestion.reviewedAt,
  };
}

export async function getAlliancePlan(db: D1Database, eventId: number): Promise<Response> {
  const event = await getEvent(db, eventId);
  if (!event) return apiText("Event not found.", 404);

  const [plan, teams, wishlist, suggestions] = await Promise.all([
    getPlan(db, eventId),
    all<{ teamId: number; teamNumber: number; teamName: string }>(db, `SELECT
        t.Id AS teamId, t.TeamNumber AS teamNumber, t.Name AS teamName
      FROM Teams t
      WHERE t.Id IN (
        SELECT TeamId FROM EventTeams WHERE EventId = ?
        UNION SELECT TeamId FROM EventRankings WHERE EventId = ?
      )
      ORDER BY t.TeamNumber`, [eventId, eventId]),
    getWishlist(db, eventId),
    getSuggestions(db, eventId),
  ]);

  return json({
    eventId,
    eventName: event.eventName,
    seasonId: event.seasonId,
    version: plan?.version ?? 0,
    ourTeamId: plan?.ourTeamId ?? null,
    firstPartnerId: plan?.firstPartnerId ?? null,
    secondPartnerId: plan?.secondPartnerId ?? null,
    notes: plan?.notes ?? "",
    updatedAt: plan?.updatedAt ?? null,
    teams,
    wishlist,
    suggestions: suggestions.map(suggestionResponse),
  });
}

interface WishlistInput {
  teamId: number;
  reason: string;
}

interface PlanInput {
  version: number;
  ourTeamId: number | null;
  firstPartnerId: number | null;
  secondPartnerId: number | null;
  notes: string;
  wishlist: WishlistInput[];
}

function parsePlanInput(body: Record<string, unknown>): PlanInput | null {
  const versionValue = property(body, "version");
  const version = versionValue === undefined ? 0 : versionValue;
  if (!validNonnegativeInteger(version)) return null;

  const teamSlot = (key: string): number | null | undefined => {
    const value = property(body, key);
    if (value === undefined || value === null) return null;
    return validPositiveId(value) ? value : undefined;
  };
  const ourTeamId = teamSlot("ourTeamId");
  const firstPartnerId = teamSlot("firstPartnerId");
  const secondPartnerId = teamSlot("secondPartnerId");
  if (ourTeamId === undefined || firstPartnerId === undefined || secondPartnerId === undefined) return null;

  const notesValue = stringValue(property(body, "notes"));
  if (notesValue === null) return null;
  const rawWishlist = property(body, "wishlist");
  if (rawWishlist !== undefined && (rawWishlist === null || !Array.isArray(rawWishlist))) return null;
  const wishlistValue = (rawWishlist ?? []) as unknown[];
  if (wishlistValue.length > 100) return null;
  const wishlist: WishlistInput[] = [];
  for (const item of wishlistValue) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
    const entry = item as Record<string, unknown>;
    const teamId = property(entry, "teamId");
    const reason = stringValue(property(entry, "reason"));
    if (!validPositiveId(teamId) || reason === null || reason.length > 2_000) return null;
    wishlist.push({ teamId, reason });
  }
  if (notesValue.length > 4_000) return null;

  const slots = [ourTeamId, firstPartnerId, secondPartnerId].filter((id): id is number => id !== null);
  if (new Set(slots).size !== slots.length ||
      new Set(wishlist.map((entry) => entry.teamId)).size !== wishlist.length) return null;

  return { version, ourTeamId, firstPartnerId, secondPartnerId, notes: notesValue, wishlist };
}

function planValidationError(): Response {
  return apiText(
    "Use a valid plan with distinct teams, at most 100 wishlist teams, 2,000 characters per reason, and 4,000 characters of notes.",
    400,
  );
}

function conditionalPlanWrite(
  db: D1Database,
  eventId: number,
  version: number,
  input: PlanInput,
  updatedAt: string,
  mutationId: string,
): D1PreparedStatement[] {
  const expectedVersion = version + 1;
  const statements = [db.prepare(`UPDATE AlliancePlans SET
      Version = Version + 1, OurTeamId = ?, FirstPartnerId = ?, SecondPartnerId = ?,
      Notes = ?, UpdatedAt = ?, MutationId = ?
    WHERE EventId = ? AND Version = ?`)
    .bind(input.ourTeamId, input.firstPartnerId, input.secondPartnerId,
      input.notes.trim(), updatedAt, mutationId, eventId, version)];

  if (version === 0) {
    statements.push(db.prepare(`INSERT INTO AlliancePlans
        (EventId, Version, OurTeamId, FirstPartnerId, SecondPartnerId, Notes, UpdatedAt, MutationId)
      SELECT ?, 1, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM AlliancePlans WHERE EventId = ?)`)
      .bind(eventId, input.ourTeamId, input.firstPartnerId, input.secondPartnerId,
        input.notes.trim(), updatedAt, mutationId, eventId));
  }

  statements.push(db.prepare(`DELETE FROM AlliancePlanEntries
    WHERE EventId = ? AND EXISTS (
      SELECT 1 FROM AlliancePlans WHERE EventId = ? AND Version = ? AND MutationId = ?
    )`).bind(eventId, eventId, expectedVersion, mutationId));

  for (let index = 0; index < input.wishlist.length; index++) {
    const entry = input.wishlist[index];
    statements.push(db.prepare(`INSERT INTO AlliancePlanEntries (EventId, TeamId, Position, Reason)
      SELECT ?, ?, ?, ? WHERE EXISTS (
        SELECT 1 FROM AlliancePlans WHERE EventId = ? AND Version = ? AND MutationId = ?
      )`).bind(eventId, entry.teamId, index + 1, entry.reason.trim(),
        eventId, expectedVersion, mutationId));
  }
  return statements;
}

export async function publishAlliancePlan(request: Request, db: D1Database, eventId: number): Promise<Response> {
  const { body, response } = await readBody(request, MAX_PLAN_BODY_BYTES);
  if (response) return response;
  const input = parsePlanInput(body!);
  if (!input) return planValidationError();

  const event = await getEvent(db, eventId);
  if (!event) return apiText("Event not found.", 404);
  const eventTeamIds = new Set(await getEventTeamIds(db, eventId));
  const chosenIds = [input.ourTeamId, input.firstPartnerId, input.secondPartnerId,
    ...input.wishlist.map((entry) => entry.teamId)].filter((id): id is number => id !== null);
  if (chosenIds.some((id) => !eventTeamIds.has(id))) {
    return apiText("Choose teams registered or ranked at this event.", 400);
  }

  const updatedAt = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  const statements = conditionalPlanWrite(db, eventId, input.version, input, updatedAt, mutationId);
  const results = await db.batch(statements);
  const planRowsChanged = changedRows(results[0]) + changedRows(results[1] ?? null);
  if (planRowsChanged === 0) {
    return apiText("Another host updated this plan. Reload the published plan before saving.", 409);
  }
  return json({ version: input.version + 1, updatedAt });
}

interface SuggestionInput {
  id: string;
  teamId: number;
  author: string;
  reason: string;
}

function parseSuggestionInput(body: Record<string, unknown>): SuggestionInput | null {
  const idValue = property(body, "id");
  const teamId = property(body, "teamId");
  const author = stringValue(property(body, "author"));
  const reason = stringValue(property(body, "reason"));
  if (typeof idValue !== "string" || !GUID_PATTERN.test(idValue) ||
      idValue.toLowerCase() === "00000000-0000-0000-0000-000000000000" ||
      !validPositiveId(teamId) || author === null || reason === null ||
      !author.trim() || author.length > 80 || !reason.trim() || reason.length > 2_000) return null;
  return { id: idValue.toLowerCase(), teamId, author: author.trim(), reason: reason.trim() };
}

export async function suggestAllianceTeam(request: Request, db: D1Database, eventId: number): Promise<Response> {
  const { body, response } = await readBody(request, MAX_SUGGESTION_BODY_BYTES);
  if (response) return response;
  const input = parseSuggestionInput(body!);
  if (!input) {
    return apiText("Include a valid suggestion ID, your name/team (up to 80 characters), and a reason (up to 2,000 characters).", 400);
  }

  if (!await getEvent(db, eventId)) return apiText("Event not found.", 404);
  const previous = await first<SuggestionRow>(db, `SELECT Id AS id, EventId AS eventId, TeamId AS teamId,
      Author AS author, Reason AS reason, Status AS status, HostResponse AS hostResponse,
      CreatedAt AS createdAt, ReviewedAt AS reviewedAt
    FROM AlliancePlanSuggestions WHERE Id = ?`, [input.id]);
  if (previous) {
    if (previous.eventId !== eventId || previous.teamId !== input.teamId ||
        previous.author !== input.author || previous.reason !== input.reason) {
      return apiText("This suggestion identifier was already used for different content.", 409);
    }
    return json(suggestionResponse(previous));
  }

  if (!(await getEventTeamIds(db, eventId)).includes(input.teamId)) {
    return apiText("Choose a team registered or ranked at this event.", 400);
  }

  const createdAt = new Date().toISOString();
  await db.prepare(`INSERT INTO AlliancePlanSuggestions
      (Id, EventId, TeamId, Author, Reason, Status, HostResponse, CreatedAt, ReviewedAt)
    VALUES (?, ?, ?, ?, ?, 'Pending', '', ?, NULL)
    ON CONFLICT(Id) DO NOTHING`)
    .bind(input.id, eventId, input.teamId, input.author, input.reason, createdAt)
    .run();

  const saved = await first<SuggestionRow>(db, `SELECT Id AS id, EventId AS eventId, TeamId AS teamId,
      Author AS author, Reason AS reason, Status AS status, HostResponse AS hostResponse,
      CreatedAt AS createdAt, ReviewedAt AS reviewedAt
    FROM AlliancePlanSuggestions WHERE Id = ?`, [input.id]);
  if (!saved) return apiText("Could not save the suggestion.", 500);
  if (saved.eventId !== eventId || saved.teamId !== input.teamId ||
      saved.author !== input.author || saved.reason !== input.reason) {
    return apiText("This suggestion identifier was already used for different content.", 409);
  }
  return json(suggestionResponse(saved));
}

interface ReviewInput {
  version: number;
  accept: boolean;
  hostResponse: string;
}

function parseReviewInput(body: Record<string, unknown>): ReviewInput | null {
  const versionValue = property(body, "version");
  const version = versionValue === undefined ? 0 : versionValue;
  const acceptValue = property(body, "accept");
  const accept = acceptValue === undefined ? false : acceptValue;
  const hostResponse = stringValue(property(body, "hostResponse"));
  if (!validNonnegativeInteger(version) || typeof accept !== "boolean" ||
      hostResponse === null || hostResponse.length > 2_000) return null;
  return { version, accept, hostResponse };
}

async function updateReviewedSuggestion(
  db: D1Database,
  eventId: number,
  suggestion: SuggestionRow,
  input: ReviewInput,
): Promise<Response> {
  const reviewedAt = new Date().toISOString();
  const status = input.accept ? "Accepted" : "Dismissed";
  const result = await db.prepare(`UPDATE AlliancePlanSuggestions SET
      Status = ?, HostResponse = ?, ReviewedAt = ?
    WHERE Id = ? AND EventId = ? AND Status = 'Pending'
      AND COALESCE((SELECT Version FROM AlliancePlans WHERE EventId = ?), 0) = ?`)
    .bind(status, input.hostResponse.trim(), reviewedAt, suggestion.id, eventId, eventId, input.version)
    .run();
  if (changedRows(result) === 0) {
    return apiText("The plan or suggestion changed. Reload before reviewing.", 409);
  }
  const saved = await getSuggestion(db, suggestion.id, eventId);
  return saved ? json(suggestionResponse(saved)) : new Response(null, { status: 404 });
}

async function acceptSuggestionAndUpdatePlan(
  db: D1Database,
  eventId: number,
  suggestion: SuggestionRow,
  input: ReviewInput,
  currentWishlist: WishlistRow[],
): Promise<Response> {
  const updatedAt = new Date().toISOString();
  const mutationId = crypto.randomUUID();
  const expectedVersion = input.version + 1;
  const statements: D1PreparedStatement[] = [db.prepare(`UPDATE AlliancePlans SET
      Version = Version + 1, UpdatedAt = ?, MutationId = ?
    WHERE EventId = ? AND Version = ? AND EXISTS (
      SELECT 1 FROM AlliancePlanSuggestions WHERE Id = ? AND EventId = ? AND Status = 'Pending'
    )`)
    .bind(updatedAt, mutationId, eventId, input.version, suggestion.id, eventId)];

  if (input.version === 0) {
    statements.push(db.prepare(`INSERT INTO AlliancePlans
        (EventId, Version, OurTeamId, FirstPartnerId, SecondPartnerId, Notes, UpdatedAt, MutationId)
      SELECT ?, 1, NULL, NULL, NULL, '', ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM AlliancePlans WHERE EventId = ?)
        AND EXISTS (
          SELECT 1 FROM AlliancePlanSuggestions WHERE Id = ? AND EventId = ? AND Status = 'Pending'
        )`)
      .bind(eventId, updatedAt, mutationId, eventId, suggestion.id, eventId));
  }

  statements.push(db.prepare(`INSERT INTO AlliancePlanEntries (EventId, TeamId, Position, Reason)
    SELECT ?, ?, ?, ? WHERE EXISTS (
      SELECT 1 FROM AlliancePlans WHERE EventId = ? AND Version = ? AND MutationId = ?
    ) AND EXISTS (
      SELECT 1 FROM AlliancePlanSuggestions WHERE Id = ? AND EventId = ? AND Status = 'Pending'
    )`)
    .bind(eventId, suggestion.teamId, currentWishlist.length + 1, suggestion.reason,
      eventId, expectedVersion, mutationId, suggestion.id, eventId));

  statements.push(db.prepare(`UPDATE AlliancePlanSuggestions SET
      Status = 'Accepted', HostResponse = ?, ReviewedAt = ?
    WHERE Id = ? AND EventId = ? AND Status = 'Pending'
      AND EXISTS (
        SELECT 1 FROM AlliancePlans WHERE EventId = ? AND Version = ? AND MutationId = ?
      )`)
    .bind(input.hostResponse.trim(), updatedAt, suggestion.id, eventId,
      eventId, expectedVersion, mutationId));

  const results = await db.batch(statements);
  const planRowsChanged = changedRows(results[0]) + changedRows(results[1] ?? null);
  if (planRowsChanged === 0 || changedRows(results[results.length - 1]) === 0) {
    return apiText("The plan or suggestion changed. Reload before reviewing.", 409);
  }
  const saved = await getSuggestion(db, suggestion.id, eventId);
  return saved ? json(suggestionResponse(saved)) : new Response(null, { status: 404 });
}

export async function reviewAllianceSuggestion(
  request: Request,
  db: D1Database,
  eventId: number,
  suggestionId: string,
): Promise<Response> {
  if (!GUID_PATTERN.test(suggestionId)) return new Response(null, { status: 404 });
  const { body, response } = await readBody(request, MAX_REVIEW_BODY_BYTES);
  if (response) return response;
  const input = parseReviewInput(body!);
  if (!input) return apiText("Keep the host response under 2,000 characters and provide a valid plan version.", 400);

  const normalizedId = suggestionId.toLowerCase();
  const suggestion = await getSuggestion(db, normalizedId, eventId);
  if (!suggestion) return apiText("Suggestion not found for this event.", 404);
  if (suggestion.status !== "Pending") return apiText("This suggestion was already reviewed.", 409);

  const [plan, currentWishlist] = await Promise.all([getPlan(db, eventId), getWishlist(db, eventId)]);
  if ((plan?.version ?? 0) !== input.version) return apiText("The plan changed. Reload before reviewing.", 409);

  if (!input.accept) return await updateReviewedSuggestion(db, eventId, suggestion, input);

  if (!(await getEventTeamIds(db, eventId)).includes(suggestion.teamId)) {
    return apiText("This team is no longer registered or ranked at this event.", 400);
  }
  if (currentWishlist.some((entry) => entry.teamId === suggestion.teamId)) {
    return await updateReviewedSuggestion(db, eventId, suggestion, input);
  }
  if (currentWishlist.length >= 100) return apiText("The wishlist already has 100 teams.", 400);
  return await acceptSuggestionAndUpdatePlan(db, eventId, suggestion, input, currentWishlist);
}
