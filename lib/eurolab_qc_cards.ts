import { query } from "@/lib/db_eurolab";

type JsonRecord = Record<string, unknown>;

export type QcCardListRow = {
  id: number;
  code: string;
  card_type: string;
  validation_id: number;
  validation_code: string;
  method_name: string;
  component_count: number;
  component_names: string[];
  created_at: string;
  updated_at: string;
};

export type QcCardComponent = {
  id: number;
  code: string;
  card_type: string;
  validation_id: number;
  validation_code: string;
  method_name: string;
  component_name: string;
  lower_limit: number;
  center_line: number;
  upper_limit: number;
  unit: string | null;
  created_at: string;
  updated_at: string;
  points: QcCardPoint[];
  audit_logs: QcCardAuditLog[];
};

export type QcCardPoint = {
  id: number;
  sequence_no: number;
  label: string;
  analyst: string | null;
  value: number | null;
  recovery: number;
  source: string;
  locked: boolean;
  measured_at: string | null;
  created_at: string;
};

export type QcCardAuditLog = {
  id: number;
  action: string;
  point_id: number | null;
  before_data: JsonRecord | null;
  after_data: JsonRecord | null;
  created_at: string;
};

export type QcCardDetail = QcCardListRow & {
  components: QcCardComponent[];
};

type ValidationForQc = {
  id: number;
  code: string;
  method_name: string;
  config: JsonRecord;
};

type ComponentConfig = {
  name?: string;
};

type TruenessComponentData = {
  unit?: string;
  target?: string;
  analysts?: string[];
  rows?: string[][];
};

const parseNumber = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== "string") return Number.NaN;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const sampleMean = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;

const sampleStandardDeviation = (values: number[]) => {
  if (values.length < 2) return 0;
  const mean = sampleMean(values);
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
};

const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};

const asStringArray = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim() !== "") : [];

const normalizeRows = (value: unknown) =>
  Array.isArray(value)
    ? value
        .filter((row): row is unknown[] => Array.isArray(row))
        .map(row => row.map(cell => String(cell ?? "")))
    : [];

export async function ensureQcCardSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS eurolab_qc_cards (
      id SERIAL PRIMARY KEY,
      code VARCHAR(60) UNIQUE,
      validation_id INTEGER REFERENCES eurolab_validations(id) ON DELETE CASCADE,
      validation_code VARCHAR(60),
      method_name VARCHAR(255),
      component_name VARCHAR(255) NOT NULL,
      card_type VARCHAR(30) NOT NULL DEFAULT 'RANGE',
      lower_limit NUMERIC NOT NULL,
      center_line NUMERIC NOT NULL,
      upper_limit NUMERIC NOT NULL,
      unit VARCHAR(50),
      source_data JSONB DEFAULT '{}'::jsonb,
      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(validation_id, component_name, card_type)
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS eurolab_qc_card_points (
      id SERIAL PRIMARY KEY,
      card_id INTEGER REFERENCES eurolab_qc_cards(id) ON DELETE CASCADE,
      sequence_no INTEGER NOT NULL,
      label VARCHAR(120),
      analyst VARCHAR(160),
      value NUMERIC,
      recovery NUMERIC NOT NULL,
      source VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
      locked BOOLEAN NOT NULL DEFAULT false,
      measured_at DATE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS eurolab_qc_card_audit_logs (
      id SERIAL PRIMARY KEY,
      card_id INTEGER REFERENCES eurolab_qc_cards(id) ON DELETE CASCADE,
      point_id INTEGER,
      action VARCHAR(30) NOT NULL,
      before_data JSONB,
      after_data JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

export async function listQcCards(search = "", validationId?: number): Promise<QcCardListRow[]> {
  await ensureQcCardSchema();
  const params: unknown[] = [];
  let where = "1=1";

  if (search.trim()) {
    params.push(`%${search.trim()}%`);
    where += ` AND (
      code ILIKE $1 OR validation_code ILIKE $1 OR method_name ILIKE $1 OR component_name ILIKE $1
    )`;
  }

  if (validationId) {
    params.push(validationId);
    where += ` AND validation_id = $${params.length}`;
  }

  const res = await query(`
    SELECT
      MIN(id)::int AS id,
      'QC-' || validation_code AS code,
      card_type,
      validation_id,
      validation_code,
      MAX(method_name) AS method_name,
      COUNT(*)::int AS component_count,
      ARRAY_AGG(component_name ORDER BY component_name) AS component_names,
      MIN(created_at) AS created_at,
      MAX(updated_at) AS updated_at
    FROM eurolab_qc_cards
    WHERE ${where}
    GROUP BY validation_id, validation_code, card_type
    ORDER BY MAX(updated_at) DESC, MIN(id) DESC
  `, params);

  return res.rows as QcCardListRow[];
}

export async function findQcCardGroupByValidation(validationId: number, cardType = "RANGE") {
  const rows = await listQcCards("", validationId);
  return rows.find(row => row.card_type === cardType) || null;
}

export async function getQcCard(id: number): Promise<QcCardDetail | null> {
  await ensureQcCardSchema();
  const baseResult = await query(`
    SELECT
      validation_id,
      validation_code,
      card_type
    FROM eurolab_qc_cards
    WHERE id = $1
  `, [id]);

  if (baseResult.rowCount === 0) return null;
  const base = baseResult.rows[0] as { validation_id: number; validation_code: string; card_type: string };

  const groupResult = await query(`
    SELECT
      MIN(id)::int AS id,
      'QC-' || validation_code AS code,
      card_type,
      validation_id,
      validation_code,
      MAX(method_name) AS method_name,
      COUNT(*)::int AS component_count,
      ARRAY_AGG(component_name ORDER BY component_name) AS component_names,
      MIN(created_at) AS created_at,
      MAX(updated_at) AS updated_at
    FROM eurolab_qc_cards
    WHERE validation_id = $1 AND card_type = $2
    GROUP BY validation_id, validation_code, card_type
  `, [base.validation_id, base.card_type]);

  if (groupResult.rowCount === 0) return null;

  const cardsResult = await query(`
    SELECT
      id,
      code,
      card_type,
      validation_id,
      validation_code,
      method_name,
      component_name,
      lower_limit::float AS lower_limit,
      center_line::float AS center_line,
      upper_limit::float AS upper_limit,
      unit,
      created_at,
      updated_at
    FROM eurolab_qc_cards
    WHERE validation_id = $1 AND card_type = $2
    ORDER BY component_name ASC, id ASC
  `, [base.validation_id, base.card_type]);

  const components: QcCardComponent[] = [];

  for (const card of cardsResult.rows as Omit<QcCardComponent, "points" | "audit_logs">[]) {
    const pointsResult = await query(`
      SELECT
        id,
        sequence_no,
        COALESCE(label, '') AS label,
        analyst,
        value::float AS value,
        recovery::float AS recovery,
        source,
        locked,
        measured_at,
        created_at
      FROM eurolab_qc_card_points
      WHERE card_id = $1
      ORDER BY sequence_no ASC, id ASC
    `, [card.id]);

    const auditResult = await query(`
      SELECT
        id,
        action,
        point_id,
        before_data,
        after_data,
        created_at
      FROM eurolab_qc_card_audit_logs
      WHERE card_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT 100
    `, [card.id]);

    components.push({
      ...card,
      points: pointsResult.rows as QcCardPoint[],
      audit_logs: auditResult.rows as QcCardAuditLog[],
    });
  }

  return {
    ...(groupResult.rows[0] as QcCardListRow),
    components,
  };
}

export async function getSingleQcCard(id: number): Promise<QcCardComponent | null> {
  await ensureQcCardSchema();
  const cardResult = await query(`
    SELECT
      id, code, card_type, validation_id, validation_code, method_name, component_name,
      lower_limit::float AS lower_limit,
      center_line::float AS center_line,
      upper_limit::float AS upper_limit,
      unit,
      created_at,
      updated_at
    FROM eurolab_qc_cards
    WHERE id = $1
  `, [id]);

  if (cardResult.rowCount === 0) return null;

  const pointsResult = await query(`
    SELECT
      id,
      sequence_no,
      COALESCE(label, '') AS label,
      analyst,
      value::float AS value,
      recovery::float AS recovery,
      source,
      locked,
      measured_at,
      created_at
    FROM eurolab_qc_card_points
    WHERE card_id = $1
    ORDER BY sequence_no ASC, id ASC
  `, [id]);

  const auditResult = await query(`
    SELECT id, action, point_id, before_data, after_data, created_at
    FROM eurolab_qc_card_audit_logs
    WHERE card_id = $1
    ORDER BY created_at DESC, id DESC
    LIMIT 100
  `, [id]);
  return {
    ...(cardResult.rows[0] as Omit<QcCardComponent, "points" | "audit_logs">),
    points: pointsResult.rows as QcCardPoint[],
    audit_logs: auditResult.rows as QcCardAuditLog[],
  };
}

export async function addQcCardPoint(cardId: number, input: { label?: string; analyst?: string; value?: number | null; recovery: number; measured_at?: string | null }) {
  await ensureQcCardSchema();
  const maxResult = await query(
    `SELECT COALESCE(MAX(sequence_no), 0) + 1 AS next_no FROM eurolab_qc_card_points WHERE card_id = $1`,
    [cardId],
  );
  const nextNo = Number(maxResult.rows[0]?.next_no || 1);

  const insertResult = await query(`
    INSERT INTO eurolab_qc_card_points
      (card_id, sequence_no, label, analyst, value, recovery, source, locked, measured_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'MANUAL', false, $7)
    RETURNING id, sequence_no, label, analyst, value::float AS value, recovery::float AS recovery, source, locked, measured_at, created_at
  `, [
    cardId,
    nextNo,
    input.label || `Yeni Veri ${nextNo}`,
    input.analyst || null,
    input.value ?? null,
    input.recovery,
    input.measured_at || null,
  ]);

  await query(`
    INSERT INTO eurolab_qc_card_audit_logs (card_id, point_id, action, after_data)
    VALUES ($1, $2, 'CREATE_POINT', $3::jsonb)
  `, [cardId, insertResult.rows[0]?.id || null, JSON.stringify(insertResult.rows[0] || {})]);

  await query(`UPDATE eurolab_qc_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cardId]);
}

export async function updateQcCardPoint(
  cardId: number,
  pointId: number,
  input: { label?: string; analyst?: string; value?: number | null; recovery: number; measured_at?: string | null },
) {
  await ensureQcCardSchema();
  const beforeResult = await query(`
    SELECT id, sequence_no, label, analyst, value::float AS value, recovery::float AS recovery, source, locked, measured_at, created_at
    FROM eurolab_qc_card_points
    WHERE id = $1 AND card_id = $2
  `, [pointId, cardId]);

  if (beforeResult.rowCount === 0) throw new Error("QC kart verisi bulunamadı.");
  const before = beforeResult.rows[0] as QcCardPoint;
  if (before.locked) throw new Error("Validasyondan gelen veri değiştirilemez.");

  const afterResult = await query(`
    UPDATE eurolab_qc_card_points
    SET label = $3, analyst = $4, value = $5, recovery = $6, measured_at = $7
    WHERE id = $1 AND card_id = $2 AND locked = false
    RETURNING id, sequence_no, label, analyst, value::float AS value, recovery::float AS recovery, source, locked, measured_at, created_at
  `, [
    pointId,
    cardId,
    input.label || `Veri ${before.sequence_no}`,
    input.analyst || null,
    input.value ?? null,
    input.recovery,
    input.measured_at || null,
  ]);

  await query(`
    INSERT INTO eurolab_qc_card_audit_logs (card_id, point_id, action, before_data, after_data)
    VALUES ($1, $2, 'UPDATE_POINT', $3::jsonb, $4::jsonb)
  `, [cardId, pointId, JSON.stringify(before), JSON.stringify(afterResult.rows[0] || {})]);

  await query(`UPDATE eurolab_qc_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cardId]);
}

export async function deleteQcCardPoint(cardId: number, pointId: number) {
  await ensureQcCardSchema();
  const beforeResult = await query(`
    SELECT id, sequence_no, label, analyst, value::float AS value, recovery::float AS recovery, source, locked, measured_at, created_at
    FROM eurolab_qc_card_points
    WHERE id = $1 AND card_id = $2
  `, [pointId, cardId]);

  if (beforeResult.rowCount === 0) throw new Error("QC kart verisi bulunamadı.");
  const before = beforeResult.rows[0] as QcCardPoint;
  if (before.locked) throw new Error("Validasyondan gelen veri silinemez.");

  await query(`DELETE FROM eurolab_qc_card_points WHERE id = $1 AND card_id = $2 AND locked = false`, [pointId, cardId]);
  await query(`
    INSERT INTO eurolab_qc_card_audit_logs (card_id, point_id, action, before_data)
    VALUES ($1, $2, 'DELETE_POINT', $3::jsonb)
  `, [cardId, pointId, JSON.stringify(before)]);
  await query(`UPDATE eurolab_qc_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cardId]);
}

export async function createRangeCardsFromValidation(validationId: number) {
  await ensureQcCardSchema();

  const validationResult = await query(`
    SELECT
      v.id,
      COALESCE(v.code, 'VAL-' || v.id::text) AS code,
      COALESCE(m.name, v.title) AS method_name,
      COALESCE(v.config, '{}'::jsonb) AS config
    FROM eurolab_validations v
    LEFT JOIN eurolab_methods m ON m.id = v.method_id
    WHERE v.id = $1
  `, [validationId]);

  if (validationResult.rowCount === 0) {
    throw new Error("Validasyon bulunamadı.");
  }

  const validation = validationResult.rows[0] as ValidationForQc;
  const config = asRecord(validation.config);
  const moduleData = asRecord(config.moduleData);
  const truenessData = asRecord(moduleData.TRUENESS);
  const configuredComponents = Array.isArray(config.components)
    ? (config.components as ComponentConfig[]).map(component => component.name).filter((name): name is string => Boolean(name))
    : [];
  const componentNames = configuredComponents.length > 0 ? configuredComponents : Object.keys(truenessData);

  if (componentNames.length === 0) {
    throw new Error("Validasyonda alt etken madde bulunamadı.");
  }

  const createdCards: QcCardComponent[] = [];

  for (const componentName of componentNames) {
    const componentData = asRecord(truenessData[componentName]) as TruenessComponentData;
    const rows = normalizeRows(componentData.rows);
    const analysts = asStringArray(componentData.analysts);
    const analystNames = analysts.length > 0
      ? analysts
      : Array.from({ length: Math.max(1, rows[0]?.length || 1) }, (_, index) => `Personel ${index + 1}`);
    const target = parseNumber(componentData.target);
    const sourcePoints: Array<{ label: string; analyst: string; value: number; recovery: number }> = [];

    analystNames.forEach((analyst, analystIndex) => {
      const values = rows
        .map(row => parseNumber(row[analystIndex]))
        .filter(Number.isFinite)
        .slice(0, 7);

      values.forEach((value, valueIndex) => {
        const recovery = Number.isFinite(target) && target > 0 ? (value / target) * 100 : value;
        if (!Number.isFinite(recovery)) return;
        sourcePoints.push({
          label: `${analyst} ${valueIndex + 1}`,
          analyst,
          value,
          recovery,
        });
      });
    });

    if (sourcePoints.length === 0) continue;

    const recoveries = sourcePoints.map(point => point.recovery);
    const centerLine = sampleMean(recoveries);
    const standardDeviation = sampleStandardDeviation(recoveries);
    const lowerLimit = centerLine - (2 * standardDeviation);
    const upperLimit = centerLine + (2 * standardDeviation);

    const cardResult = await query(`
      INSERT INTO eurolab_qc_cards
        (code, validation_id, validation_code, method_name, component_name, card_type, lower_limit, center_line, upper_limit, unit, source_data, metadata)
      VALUES (
        $1, $2, $3, $4, $5, 'RANGE', $6, $7, $8, $9, $10::jsonb, $11::jsonb
      )
      ON CONFLICT (validation_id, component_name, card_type)
      DO UPDATE SET
        validation_code = EXCLUDED.validation_code,
        method_name = EXCLUDED.method_name,
        lower_limit = EXCLUDED.lower_limit,
        center_line = EXCLUDED.center_line,
        upper_limit = EXCLUDED.upper_limit,
        unit = EXCLUDED.unit,
        source_data = EXCLUDED.source_data,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        id, code, card_type, validation_id, validation_code, method_name, component_name,
        lower_limit::float AS lower_limit,
        center_line::float AS center_line,
        upper_limit::float AS upper_limit,
        unit,
        created_at,
        updated_at
    `, [
      `QC-${validation.code}-${componentName}`.replace(/\s+/g, "-").slice(0, 60),
      validation.id,
      validation.code,
      validation.method_name,
      componentName,
      lowerLimit,
      centerLine,
      upperLimit,
      componentData.unit || null,
      JSON.stringify({ trueness: componentData, usedPointCount: sourcePoints.length }),
      JSON.stringify({
        source: "TRUENESS",
        pointRule: "first_7_per_analyst",
        limitRule: "mean_plus_minus_2_sample_sd",
        standardDeviation,
      }),
    ]);

    const card = cardResult.rows[0] as QcCardComponent;
    await query(`DELETE FROM eurolab_qc_card_points WHERE card_id = $1 AND source = 'VALIDATION'`, [card.id]);

    for (const [index, point] of sourcePoints.entries()) {
      await query(`
        INSERT INTO eurolab_qc_card_points
          (card_id, sequence_no, label, analyst, value, recovery, source, locked)
        VALUES ($1, $2, $3, $4, $5, $6, 'VALIDATION', true)
      `, [card.id, index + 1, point.label, point.analyst, point.value, point.recovery]);
    }

    createdCards.push(card);
  }

  if (createdCards.length === 0) {
    throw new Error("Range kartı için geri kazanım verisi bulunamadı.");
  }

  return findQcCardGroupByValidation(validationId, "RANGE");
}
