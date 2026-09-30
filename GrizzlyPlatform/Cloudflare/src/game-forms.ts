type Row = Record<string, unknown>;

interface FormRow extends Row {
  id: number;
  seasonId: number;
  name: string;
  description: string;
  formType: number;
}

interface FieldRow extends Row {
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

interface OptionRow extends Row {
  id: number;
  gameFormFieldId: number;
  value: string;
  displayOrder: number;
}

interface FormInput {
  seasonId: number;
  name: string;
  description: string;
  formType: number;
}

interface OptionInput {
  id: number;
  value: string;
  displayOrder: number;
}

interface FieldInput {
  gameFormId?: number;
  question: string;
  description: string;
  fieldType: number;
  required: boolean;
  displayOrder: number;
  isAllianceSelectionFilter: boolean;
  options: OptionInput[];
}

const MAX_FORM_BODY_BYTES = 256 * 1024;
const SELECT_FIELD_TYPES = new Set([3, 5]);

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

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") return null;

  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_FORM_BODY_BYTES) return null;

  const reader = request.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      totalLength += result.value.byteLength;
      if (totalLength > MAX_FORM_BODY_BYTES) {
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
    return object(parsed) ? parsed : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function property(body: Record<string, unknown>, name: string): unknown {
  const key = Object.keys(body).find((candidate) => candidate.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : body[key];
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value);
}

function booleanValue(value: unknown, fallback = false): boolean | null {
  if (value === undefined) return fallback;
  return typeof value === "boolean" ? value : null;
}

function parseForm(body: Record<string, unknown>): FormInput | null {
  const seasonId = property(body, "seasonId");
  const name = property(body, "name");
  const description = property(body, "description");
  const formType = property(body, "formType");
  if (!integer(seasonId) || seasonId <= 0
      || typeof name !== "string" || !name.trim()
      || (description !== undefined && description !== null && typeof description !== "string")
      || !integer(formType) || (formType !== 0 && formType !== 1)) {
    return null;
  }
  return {
    seasonId,
    name,
    description: typeof description === "string" ? description : "",
    formType,
  };
}

function parseOptions(value: unknown): OptionInput[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 500) return null;
  const options: OptionInput[] = [];
  for (const option of value) {
    if (!object(option)) return null;
    const id = property(option, "id");
    const optionValue = property(option, "value");
    const displayOrder = property(option, "displayOrder");
    if ((id !== undefined && !integer(id))
        || typeof optionValue !== "string"
        || (displayOrder !== undefined && !integer(displayOrder))) {
      return null;
    }
    options.push({
      id: integer(id) ? id : 0,
      value: optionValue,
      displayOrder: integer(displayOrder) ? displayOrder : 0,
    });
  }
  return options;
}

function parseField(body: Record<string, unknown>, requireFormId: boolean): FieldInput | null {
  const gameFormId = property(body, "gameFormId");
  const question = property(body, "question");
  const description = property(body, "description");
  const fieldType = property(body, "fieldType");
  const required = booleanValue(property(body, "required"));
  const displayOrder = property(body, "displayOrder");
  const isAllianceSelectionFilter = booleanValue(property(body, "isAllianceSelectionFilter"));
  const options = parseOptions(property(body, "options"));
  if ((requireFormId && (!integer(gameFormId) || gameFormId <= 0))
      || (gameFormId !== undefined && !integer(gameFormId))
      || typeof question !== "string"
      || (description !== undefined && description !== null && typeof description !== "string")
      || !integer(fieldType) || fieldType < 0 || fieldType > 5
      || required === null
      || !integer(displayOrder)
      || isAllianceSelectionFilter === null
      || options === null) {
    return null;
  }
  return {
    gameFormId: integer(gameFormId) ? gameFormId : undefined,
    question,
    description: typeof description === "string" ? description : "",
    fieldType,
    required,
    displayOrder,
    isAllianceSelectionFilter,
    options: SELECT_FIELD_TYPES.has(fieldType) ? options : [],
  };
}

async function first<T extends Row>(db: D1Database, sql: string, values: unknown[] = []): Promise<T | null> {
  const statement = db.prepare(sql);
  return values.length > 0
    ? await statement.bind(...values).first<T>()
    : await statement.first<T>();
}

async function all<T extends Row>(db: D1Database, sql: string, values: unknown[] = []): Promise<T[]> {
  const statement = db.prepare(sql);
  const result = values.length > 0
    ? await statement.bind(...values).all<T>()
    : await statement.all<T>();
  return result.results ?? [];
}

function formSummary(form: FormRow): Record<string, unknown> {
  return {
    id: form.id,
    seasonId: form.seasonId,
    name: form.name,
    description: form.description,
    formType: form.formType,
  };
}

async function readField(db: D1Database, id: number): Promise<Record<string, unknown> | null> {
  const field = await first<FieldRow>(db, `SELECT Id AS id, GameFormId AS gameFormId,
      Question AS question, Description AS description, FieldType AS fieldType,
      Required AS required, DisplayOrder AS displayOrder,
      IsSystemField AS isSystemField,
      IsAllianceSelectionFilter AS isAllianceSelectionFilter
    FROM GameFormFields WHERE Id = ?`, [id]);
  if (!field) return null;
  const options = await all<OptionRow>(db, `SELECT Id AS id, GameFormFieldId AS gameFormFieldId,
      Value AS value, DisplayOrder AS displayOrder
    FROM GameFormFieldOptions WHERE GameFormFieldId = ? ORDER BY DisplayOrder`, [id]);
  return {
    id: field.id,
    gameFormId: field.gameFormId,
    question: field.question,
    description: field.description,
    fieldType: field.fieldType,
    required: Boolean(field.required),
    displayOrder: field.displayOrder,
    isSystemField: Boolean(field.isSystemField),
    isAllianceSelectionFilter: Boolean(field.isAllianceSelectionFilter),
    options: options.map((option) => ({
      id: option.id,
      gameFormFieldId: option.gameFormFieldId,
      value: option.value,
      displayOrder: option.displayOrder,
    })),
  };
}

export async function createGameForm(request: Request, db: D1Database): Promise<Response> {
  const body = await readJson(request);
  const form = body && parseForm(body);
  if (!form) return text("A valid game form request is required.", 400);

  const duplicate = await first<Row>(db, `SELECT Id AS id FROM GameForms
    WHERE SeasonId = ? AND FormType = ? AND LOWER(Name) = LOWER(?) LIMIT 1`,
  [form.seasonId, form.formType, form.name]);
  if (duplicate) return text("A form with this name and type already exists for the selected season.", 409);

  const season = await first<Row>(db, "SELECT Id AS id FROM Seasons WHERE Id = ?", [form.seasonId]);
  if (!season) return text("The specified season does not exist.", 400);

  const fieldDefinitions = form.formType === 0
    ? [
      ["Scout Name", "Name or initials of the person conducting the pit scouting.", 0, 1],
      ["Team Number", "FRC team number being scouted.", 1, 2],
      ["Team Name", "Name of the team being scouted.", 0, 3],
    ] as const
    : [
      ["Scout Name", "Name or initials of the person conducting the match scouting.", 0, 1],
      ["Match Number", "Match number being scouted.", 1, 2],
      ["Team Number", "FRC team number being scouted.", 1, 3],
    ] as const;
  const systemFieldsSql = `INSERT INTO GameFormFields
      (GameFormId, Question, Description, FieldType, Required, DisplayOrder,
       IsSystemField, IsAllianceSelectionFilter)
    ${fieldDefinitions.map(() => `SELECT Id, ?, ?, ?, 1, ?, 1, 0
       FROM GameForms WHERE Id = (SELECT MAX(Id) FROM GameForms)`).join("\nUNION ALL\n")}`;
  const results = await db.batch([
    db.prepare(`INSERT INTO GameForms (SeasonId, Name, Description, FormType)
      VALUES (?, ?, ?, ?)`)
      .bind(form.seasonId, form.name, form.description, form.formType),
    db.prepare(systemFieldsSql).bind(...fieldDefinitions.flat()),
  ]);
  const id = results[0]?.meta.last_row_id;
  if (!integer(id) || id <= 0) return json({ error: { code: "game_form_create_failed" } }, 500);

  const response = json(formSummary({ id, ...form }), 201);
  response.headers.set("Location", `/api/GameForms/${id}`);
  return response;
}

export async function updateGameForm(request: Request, db: D1Database, id: number): Promise<Response> {
  const existing = await first<FormRow>(db, `SELECT Id AS id, SeasonId AS seasonId,
      Name AS name, Description AS description, FormType AS formType
    FROM GameForms WHERE Id = ?`, [id]);
  if (!existing) return new Response(null, { status: 404 });

  const body = await readJson(request);
  const form = body && parseForm(body);
  if (!form) return text("A valid game form request is required.", 400);

  const duplicate = await first<Row>(db, `SELECT Id AS id FROM GameForms
    WHERE Id <> ? AND SeasonId = ? AND FormType = ? AND LOWER(Name) = LOWER(?) LIMIT 1`,
  [id, form.seasonId, form.formType, form.name]);
  if (duplicate) return text("A form with this name and type already exists for the selected season.", 409);

  const season = await first<Row>(db, "SELECT Id AS id FROM Seasons WHERE Id = ?", [form.seasonId]);
  if (!season) return text("The specified season does not exist.", 400);

  const updated = await db.prepare(`UPDATE GameForms
      SET Name = ?, Description = ?, SeasonId = ?, FormType = ?
      WHERE Id = ? RETURNING Id AS id, SeasonId AS seasonId,
        Name AS name, Description AS description, FormType AS formType`)
    .bind(form.name, form.description, form.seasonId, form.formType, id)
    .first<FormRow>();
  return updated ? json(formSummary(updated)) : new Response(null, { status: 404 });
}

export async function deleteGameForm(db: D1Database, id: number): Promise<Response> {
  const deleted = await db.prepare("DELETE FROM GameForms WHERE Id = ? RETURNING Id AS id")
    .bind(id)
    .first<{ id: number }>();
  return deleted ? new Response(null, { status: 204 }) : new Response(null, { status: 404 });
}

export async function createGameField(request: Request, db: D1Database, gameFormId: number): Promise<Response> {
  const form = await first<Row>(db, "SELECT Id AS id FROM GameForms WHERE Id = ?", [gameFormId]);
  if (!form) return text("The specified game form does not exist.", 404);

  const body = await readJson(request);
  const field = body && parseField(body, true);
  if (!field) return text("A valid game form field request is required.", 400);
  if (field.gameFormId !== gameFormId) {
    return text("The field does not belong to the specified game form.", 400);
  }

  const statements = [db.prepare(`INSERT INTO GameFormFields
      (GameFormId, Question, Description, FieldType, Required, DisplayOrder,
       IsSystemField, IsAllianceSelectionFilter)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
    .bind(gameFormId, field.question, field.description, field.fieldType,
      Number(field.required), field.displayOrder, Number(field.isAllianceSelectionFilter))];
  for (const option of field.options) {
    statements.push(db.prepare(`INSERT INTO GameFormFieldOptions
        (GameFormFieldId, Value, DisplayOrder)
      SELECT Id, ?, ? FROM GameFormFields
       WHERE GameFormId = ? ORDER BY Id DESC LIMIT 1`)
      .bind(option.value, option.displayOrder, gameFormId));
  }
  const results = await db.batch(statements);
  const id = results[0]?.meta.last_row_id;
  const created = integer(id) && id > 0 ? await readField(db, id) : null;
  return created ? json(created) : json({ error: { code: "game_form_field_create_failed" } }, 500);
}

export async function updateGameField(request: Request, db: D1Database, id: number): Promise<Response> {
  const existing = await first<FieldRow>(db, `SELECT Id AS id, GameFormId AS gameFormId,
      Question AS question, Description AS description, FieldType AS fieldType,
      Required AS required, DisplayOrder AS displayOrder,
      IsSystemField AS isSystemField,
      IsAllianceSelectionFilter AS isAllianceSelectionFilter
    FROM GameFormFields WHERE Id = ?`, [id]);
  if (!existing) return new Response(null, { status: 404 });
  if (Boolean(existing.isSystemField)) return text("System fields cannot be modified.", 400);

  const body = await readJson(request);
  const field = body && parseField(body, false);
  if (!field) return text("A valid game form field request is required.", 400);

  const statements = [db.prepare(`UPDATE GameFormFields
      SET Question = ?, Description = ?, FieldType = ?, Required = ?,
          DisplayOrder = ?, IsAllianceSelectionFilter = ?
      WHERE Id = ?`)
    .bind(field.question, field.description, field.fieldType, Number(field.required),
      field.displayOrder, Number(field.isAllianceSelectionFilter), id)];

  if (!SELECT_FIELD_TYPES.has(field.fieldType)) {
    statements.push(db.prepare("DELETE FROM GameFormFieldOptions WHERE GameFormFieldId = ?").bind(id));
  } else {
    const retainedIds = field.options.filter((option) => option.id > 0).map((option) => option.id);
    if (retainedIds.length === 0) {
      statements.push(db.prepare("DELETE FROM GameFormFieldOptions WHERE GameFormFieldId = ?").bind(id));
    } else {
      statements.push(db.prepare(`DELETE FROM GameFormFieldOptions
        WHERE GameFormFieldId = ? AND Id NOT IN (${retainedIds.map(() => "?").join(", ")})`)
        .bind(id, ...retainedIds));
    }

    for (const option of field.options) {
      if (option.id > 0) {
        statements.push(db.prepare(`UPDATE GameFormFieldOptions
            SET Value = ?, DisplayOrder = ?
          WHERE Id = ? AND GameFormFieldId = ?`)
          .bind(option.value, option.displayOrder, option.id, id));
      } else {
        statements.push(db.prepare(`INSERT INTO GameFormFieldOptions
            (GameFormFieldId, Value, DisplayOrder) VALUES (?, ?, ?)`)
          .bind(id, option.value, option.displayOrder));
      }
    }
  }

  await db.batch(statements);
  const updated = await readField(db, id);
  return updated ? json(updated) : new Response(null, { status: 404 });
}

export async function createFieldOption(request: Request, db: D1Database, fieldId: number): Promise<Response> {
  const field = await first<FieldRow>(db, `SELECT Id AS id, GameFormId AS gameFormId,
      Question AS question, Description AS description, FieldType AS fieldType,
      Required AS required, DisplayOrder AS displayOrder,
      IsSystemField AS isSystemField,
      IsAllianceSelectionFilter AS isAllianceSelectionFilter
    FROM GameFormFields WHERE Id = ?`, [fieldId]);
  if (!field) return text("The specified field does not exist.", 404);
  if (!SELECT_FIELD_TYPES.has(field.fieldType)) {
    return text("Options can only be added to Dropdown or MultiSelect fields.", 400);
  }

  const body = await readJson(request);
  const gameFormFieldId = body && property(body, "gameFormFieldId");
  const value = body && property(body, "value");
  const displayOrder = body && property(body, "displayOrder");
  if (!integer(gameFormFieldId) || typeof value !== "string"
      || (displayOrder !== undefined && !integer(displayOrder))) {
    return text("A valid game form option request is required.", 400);
  }
  if (gameFormFieldId !== fieldId) {
    return text("The option does not belong to the specified field.", 400);
  }

  const option = await db.prepare(`INSERT INTO GameFormFieldOptions
      (GameFormFieldId, Value, DisplayOrder) VALUES (?, ?, ?)
      RETURNING Id AS id, GameFormFieldId AS gameFormFieldId,
        Value AS value, DisplayOrder AS displayOrder`)
    .bind(fieldId, value, integer(displayOrder) ? displayOrder : 0)
    .first<OptionRow>();
  return option ? json(option) : json({ error: { code: "game_form_option_create_failed" } }, 500);
}

export async function updateFieldOption(request: Request, db: D1Database, id: number): Promise<Response> {
  const existing = await first<Row>(db, `SELECT o.Id AS id,
      o.GameFormFieldId AS gameFormFieldId, f.FieldType AS fieldType
    FROM GameFormFieldOptions o
    JOIN GameFormFields f ON f.Id = o.GameFormFieldId
    WHERE o.Id = ?`, [id]);
  if (!existing) return new Response(null, { status: 404 });
  if (!SELECT_FIELD_TYPES.has(Number(existing.fieldType))) {
    return text("Options can only belong to Dropdown or MultiSelect fields.", 400);
  }

  const body = await readJson(request);
  const value = body && property(body, "value");
  const displayOrder = body && property(body, "displayOrder");
  if (typeof value !== "string" || (displayOrder !== undefined && !integer(displayOrder))) {
    return text("A valid game form option request is required.", 400);
  }
  const updated = await db.prepare(`UPDATE GameFormFieldOptions
      SET Value = ?, DisplayOrder = ? WHERE Id = ?
      RETURNING Id AS id, GameFormFieldId AS gameFormFieldId,
        Value AS value, DisplayOrder AS displayOrder`)
    .bind(value, integer(displayOrder) ? displayOrder : 0, id)
    .first<OptionRow>();
  return updated ? json(updated) : new Response(null, { status: 404 });
}

export async function deleteGameField(db: D1Database, id: number): Promise<Response> {
  const field = await first<FieldRow>(db, `SELECT Id AS id, GameFormId AS gameFormId,
      Question AS question, Description AS description, FieldType AS fieldType,
      Required AS required, DisplayOrder AS displayOrder,
      IsSystemField AS isSystemField,
      IsAllianceSelectionFilter AS isAllianceSelectionFilter
    FROM GameFormFields WHERE Id = ?`, [id]);
  if (!field) return new Response(null, { status: 404 });
  if (Boolean(field.isSystemField)) return text("System fields cannot be deleted.", 400);
  await db.prepare("DELETE FROM GameFormFields WHERE Id = ?").bind(id).run();
  return new Response(null, { status: 204 });
}

export async function deleteFieldOption(db: D1Database, id: number): Promise<Response> {
  const deleted = await db.prepare("DELETE FROM GameFormFieldOptions WHERE Id = ? RETURNING Id AS id")
    .bind(id)
    .first<{ id: number }>();
  return deleted ? new Response(null, { status: 204 }) : new Response(null, { status: 404 });
}

export async function restoreSystemFields(db: D1Database): Promise<Response> {
  await db.batch([
    db.prepare(`UPDATE GameFormFields SET Question = ?, Description = ?, FieldType = ?,
        Required = 1, DisplayOrder = 2, IsSystemField = 1 WHERE Id = 7`)
      .bind("Team Number", "FRC team number being scouted.", 1),
    db.prepare(`UPDATE GameFormFields SET Question = ?, Description = ?, FieldType = ?,
        Required = 1, DisplayOrder = 3, IsSystemField = 1 WHERE Id = 8`)
      .bind("Team Name", "Name of the team being scouted.", 0),
    db.prepare(`UPDATE GameFormFields SET Question = ?, Description = ?, FieldType = ?,
        Required = 1, DisplayOrder = 1, IsSystemField = 1 WHERE Id = 10`)
      .bind("Scout Name", "Name or initials of the person conducting the pit scouting.", 0),
  ]);
  return json({ message: "System fields restored." });
}
