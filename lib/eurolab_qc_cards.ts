import { query } from "@/lib/db_eurolab";

type JsonRecord = Record<string, unknown>;

export type QcCardListRow = {
  id: number;
  code: string;
  card_type: string;
  validation_id: number;
  validation_code: string;
  method_code: string | null;
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
  lower_warning_limit: number;
  upper_warning_limit: number;
  lower_control_limit: number;
  upper_control_limit: number;
  lower_legal_limit: number | null;
  upper_legal_limit: number | null;
  standard_deviation: number | null;
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
  target_value: number | null;
  unit: string | null;
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
  actor_name: string | null;
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
  unitLabel?: string;
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

const recoveryLimits = [
  { concentration: "1.000.000", low: 98, high: 102 },
  { concentration: "100.000", low: 98, high: 102 },
  { concentration: "10.000", low: 97, high: 103 },
  { concentration: "1.000", low: 95, high: 105 },
  { concentration: "100", low: 90, high: 107 },
  { concentration: "10", low: 80, high: 110 },
  { concentration: "1", low: 80, high: 110 },
  { concentration: "0,1", low: 80, high: 110 },
  { concentration: "0,01", low: 60, high: 115 },
  { concentration: "0,001", low: 40, high: 120 },
];

const parseLimitConcentration = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));

const getPpmFactor = (unit?: string) => {
  if (unit === "ug_L" || unit === "ug_kg") return 0.001;
  if (unit === "ng_L") return 0.000001;
  if (unit === "percent") return 10000;
  return 1;
};

const findRecoveryLimit = (targetPpm: number) => {
  if (!Number.isFinite(targetPpm) || targetPpm <= 0) return null;
  const sortedLimits = [...recoveryLimits].sort((a, b) => parseLimitConcentration(b.concentration) - parseLimitConcentration(a.concentration));
  return sortedLimits.find(limit => targetPpm >= parseLimitConcentration(limit.concentration)) || sortedLimits[sortedLimits.length - 1];
};

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

  await query(`ALTER TABLE eurolab_qc_cards ADD COLUMN IF NOT EXISTS lower_warning_limit NUMERIC;`);
  await query(`ALTER TABLE eurolab_qc_cards ADD COLUMN IF NOT EXISTS upper_warning_limit NUMERIC;`);
  await query(`ALTER TABLE eurolab_qc_cards ADD COLUMN IF NOT EXISTS lower_control_limit NUMERIC;`);
  await query(`ALTER TABLE eurolab_qc_cards ADD COLUMN IF NOT EXISTS upper_control_limit NUMERIC;`);
  await query(`ALTER TABLE eurolab_qc_cards ADD COLUMN IF NOT EXISTS lower_legal_limit NUMERIC;`);
  await query(`ALTER TABLE eurolab_qc_cards ADD COLUMN IF NOT EXISTS upper_legal_limit NUMERIC;`);
  await query(`ALTER TABLE eurolab_qc_cards ADD COLUMN IF NOT EXISTS standard_deviation NUMERIC;`);
  await query(`
    CREATE TABLE IF NOT EXISTS eurolab_qc_card_points (
      id SERIAL PRIMARY KEY,
      card_id INTEGER REFERENCES eurolab_qc_cards(id) ON DELETE CASCADE,
      sequence_no INTEGER NOT NULL,
      label VARCHAR(120),
      analyst VARCHAR(160),
      value NUMERIC,
      unit VARCHAR(50),
      recovery NUMERIC NOT NULL,
      source VARCHAR(30) NOT NULL DEFAULT 'MANUAL',
      locked BOOLEAN NOT NULL DEFAULT false,
      measured_at DATE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await query(`ALTER TABLE eurolab_qc_card_points ADD COLUMN IF NOT EXISTS target_value NUMERIC;`);
  await query(`ALTER TABLE eurolab_qc_card_points ADD COLUMN IF NOT EXISTS unit VARCHAR(50);`);

  await query(`
    CREATE TABLE IF NOT EXISTS eurolab_qc_card_audit_logs (
      id SERIAL PRIMARY KEY,
      card_id INTEGER REFERENCES eurolab_qc_cards(id) ON DELETE CASCADE,
      point_id INTEGER,
      action VARCHAR(30) NOT NULL,
      actor_name VARCHAR(160),
      before_data JSONB,
      after_data JSONB,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await query(`ALTER TABLE eurolab_qc_card_audit_logs ADD COLUMN IF NOT EXISTS actor_name VARCHAR(160);`);
}

export async function listQcCards(search = "", validationId?: number): Promise<QcCardListRow[]> {
  await ensureQcCardSchema();
  const params: unknown[] = [];
  let where = "1=1";

  if (search.trim()) {
    params.push(`%${search.trim()}%`);
    where += ` AND (
      c.code ILIKE $1 OR c.validation_code ILIKE $1 OR c.method_name ILIKE $1 OR c.component_name ILIKE $1 OR m.method_code ILIKE $1
    )`;
  }

  if (validationId) {
    params.push(validationId);
    where += ` AND c.validation_id = $${params.length}`;
  }

  const res = await query(`
    SELECT
      MIN(id)::int AS id,
      'QC-' || validation_code AS code,
      card_type,
      validation_id,
      validation_code,
      MAX(method_code) AS method_code,
      MAX(method_name) AS method_name,
      COUNT(*)::int AS component_count,
      ARRAY_AGG(component_name ORDER BY component_name) AS component_names,
      MAX(reproducibility_last_date) AS created_at,
      '2026-05-20'::date AS updated_at
    FROM (
      SELECT
        c.*,
        m.method_code,
        (
          SELECT MAX(CASE WHEN elem->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (elem->>'date')::date END)
          FROM jsonb_each(COALESCE(v.config->'moduleData'->'PRECISION_REPRODUCIBILITY', '{}'::jsonb)) AS components(key, comp_data)
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(comp_data->'rows', '[]'::jsonb)) AS elem
        ) AS reproducibility_last_date
      FROM eurolab_qc_cards c
      LEFT JOIN eurolab_validations v ON v.id = c.validation_id
      LEFT JOIN eurolab_methods m ON m.id = v.method_id
      WHERE ${where}
    ) c
    GROUP BY validation_id, validation_code, card_type
    ORDER BY MAX(method_code) ASC NULLS LAST, MIN(id) ASC
  `, params);

  return res.rows as QcCardListRow[];
}

export async function findQcCardGroupByValidation(validationId: number, cardType = "RANGE") {
  const rows = await listQcCards("", validationId);
  return rows.find(row => row.card_type === cardType) || null;
}

export async function deleteQcCardGroup(id: number) {
  await ensureQcCardSchema();
  const baseResult = await query(`
    SELECT validation_id, card_type
    FROM eurolab_qc_cards
    WHERE id = $1
  `, [id]);

  if (baseResult.rowCount === 0) return false;
  const base = baseResult.rows[0] as { validation_id: number; card_type: string };
  await query(`
    DELETE FROM eurolab_qc_cards
    WHERE validation_id = $1 AND card_type = $2
  `, [base.validation_id, base.card_type]);
  return true;
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
      MAX(method_code) AS method_code,
      MAX(method_name) AS method_name,
      COUNT(*)::int AS component_count,
      ARRAY_AGG(component_name ORDER BY component_name) AS component_names,
      MAX(reproducibility_last_date) AS created_at,
      '2026-05-20'::date AS updated_at
    FROM (
      SELECT
        c.*,
        m.method_code,
        (
          SELECT MAX(CASE WHEN elem->>'date' ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN (elem->>'date')::date END)
          FROM jsonb_each(COALESCE(v.config->'moduleData'->'PRECISION_REPRODUCIBILITY', '{}'::jsonb)) AS components(key, comp_data)
          CROSS JOIN LATERAL jsonb_array_elements(COALESCE(comp_data->'rows', '[]'::jsonb)) AS elem
        ) AS reproducibility_last_date
      FROM eurolab_qc_cards c
      LEFT JOIN eurolab_validations v ON v.id = c.validation_id
      LEFT JOIN eurolab_methods m ON m.id = v.method_id
      WHERE c.validation_id = $1 AND c.card_type = $2
    ) c
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
      COALESCE(lower_warning_limit, lower_limit)::float AS lower_warning_limit,
      COALESCE(upper_warning_limit, upper_limit)::float AS upper_warning_limit,
      COALESCE(lower_control_limit, lower_limit)::float AS lower_control_limit,
      COALESCE(upper_control_limit, upper_limit)::float AS upper_control_limit,
      lower_legal_limit::float AS lower_legal_limit,
      upper_legal_limit::float AS upper_legal_limit,
      standard_deviation::float AS standard_deviation,
      unit,
      created_at,
      updated_at
    FROM eurolab_qc_cards
    WHERE validation_id = $1 AND card_type = $2
    ORDER BY component_name ASC, id ASC
  `, [base.validation_id, base.card_type]);

  const groupRow = groupResult.rows[0] as QcCardListRow;
  const reproducibilityLastDate = groupRow.created_at || null;

  const components: QcCardComponent[] = [];

  for (const card of cardsResult.rows as Omit<QcCardComponent, "points" | "audit_logs">[]) {
    const pointsResult = await query(`
      SELECT
        id,
        sequence_no,
        COALESCE(label, '') AS label,
        analyst,
        value::float AS value,
        target_value::float AS target_value,
        unit,
        recovery::float AS recovery,
        source,
        locked,
        CASE
          WHEN source IN ('VALIDATION', 'VALIDATION_BASELINE', 'VALIDATION_FLOW') AND measured_at IS NULL AND $2::timestamptz IS NOT NULL
            THEN $2::timestamptz
          ELSE measured_at
        END AS measured_at,
        created_at
      FROM eurolab_qc_card_points
      WHERE card_id = $1
      ORDER BY sequence_no ASC, id ASC
    `, [card.id, reproducibilityLastDate]);

    const auditResult = await query(`
      SELECT
        id,
        action,
        point_id,
        actor_name,
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
      COALESCE(lower_warning_limit, lower_limit)::float AS lower_warning_limit,
      COALESCE(upper_warning_limit, upper_limit)::float AS upper_warning_limit,
      COALESCE(lower_control_limit, lower_limit)::float AS lower_control_limit,
      COALESCE(upper_control_limit, upper_limit)::float AS upper_control_limit,
      lower_legal_limit::float AS lower_legal_limit,
      upper_legal_limit::float AS upper_legal_limit,
      standard_deviation::float AS standard_deviation,
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
      target_value::float AS target_value,
      unit,
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
    SELECT id, action, point_id, actor_name, before_data, after_data, created_at
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

export async function addQcCardPoint(cardId: number, input: { label?: string; analyst?: string; value?: number | null; target_value?: number | null; unit?: string | null; recovery: number; measured_at?: string | null }, actorName?: string | null) {
  await ensureQcCardSchema();
  const maxResult = await query(
    `SELECT COALESCE(MAX(sequence_no), 0) + 1 AS next_no FROM eurolab_qc_card_points WHERE card_id = $1`,
    [cardId],
  );
  const nextNo = Number(maxResult.rows[0]?.next_no || 1);

  const insertResult = await query(`
    INSERT INTO eurolab_qc_card_points
      (card_id, sequence_no, label, analyst, value, target_value, unit, recovery, source, locked, measured_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'MANUAL', false, $9)
    RETURNING id, sequence_no, label, analyst, value::float AS value, target_value::float AS target_value, unit, recovery::float AS recovery, source, locked, measured_at, created_at
  `, [
    cardId,
    nextNo,
    input.label || `Yeni Veri ${nextNo}`,
    input.analyst || null,
    input.value ?? null,
    input.target_value ?? null,
    input.unit || null,
    input.recovery,
    input.measured_at || null,
  ]);

  await query(`
    INSERT INTO eurolab_qc_card_audit_logs (card_id, point_id, action, actor_name, after_data)
    VALUES ($1, $2, 'CREATE_POINT', $3, $4::jsonb)
  `, [cardId, insertResult.rows[0]?.id || null, actorName || null, JSON.stringify(insertResult.rows[0] || {})]);

  await query(`UPDATE eurolab_qc_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cardId]);
}

export async function updateQcCardPoint(
  cardId: number,
  pointId: number,
  input: { label?: string; analyst?: string; value?: number | null; target_value?: number | null; unit?: string | null; recovery: number; measured_at?: string | null },
  actorName?: string | null,
) {
  await ensureQcCardSchema();
  const beforeResult = await query(`
    SELECT id, sequence_no, label, analyst, value::float AS value, target_value::float AS target_value, unit, recovery::float AS recovery, source, locked, measured_at, created_at
    FROM eurolab_qc_card_points
    WHERE id = $1 AND card_id = $2
  `, [pointId, cardId]);

  if (beforeResult.rowCount === 0) throw new Error("QC kart verisi bulunamadı.");
  const before = beforeResult.rows[0] as QcCardPoint;
  if (before.locked) throw new Error("Validasyondan gelen veri değiştirilemez.");

  const afterResult = await query(`
    UPDATE eurolab_qc_card_points
    SET label = $3, analyst = $4, value = $5, target_value = $6, unit = $7, recovery = $8, measured_at = $9
    WHERE id = $1 AND card_id = $2 AND locked = false
    RETURNING id, sequence_no, label, analyst, value::float AS value, target_value::float AS target_value, unit, recovery::float AS recovery, source, locked, measured_at, created_at
  `, [
    pointId,
    cardId,
    input.label || `Veri ${before.sequence_no}`,
    input.analyst || null,
    input.value ?? null,
    input.target_value ?? null,
    input.unit || null,
    input.recovery,
    input.measured_at || null,
  ]);

  await query(`
    INSERT INTO eurolab_qc_card_audit_logs (card_id, point_id, action, actor_name, before_data, after_data)
    VALUES ($1, $2, 'UPDATE_POINT', $3, $4::jsonb, $5::jsonb)
  `, [cardId, pointId, actorName || null, JSON.stringify(before), JSON.stringify(afterResult.rows[0] || {})]);

  await query(`UPDATE eurolab_qc_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cardId]);
}

export async function deleteQcCardPoint(cardId: number, pointId: number, actorName?: string | null) {
  await ensureQcCardSchema();
  const beforeResult = await query(`
    SELECT id, sequence_no, label, analyst, value::float AS value, target_value::float AS target_value, unit, recovery::float AS recovery, source, locked, measured_at, created_at
    FROM eurolab_qc_card_points
    WHERE id = $1 AND card_id = $2
  `, [pointId, cardId]);

  if (beforeResult.rowCount === 0) throw new Error("QC kart verisi bulunamadı.");
  const before = beforeResult.rows[0] as QcCardPoint;
  if (before.locked) throw new Error("Validasyondan gelen veri silinemez.");

  await query(`DELETE FROM eurolab_qc_card_points WHERE id = $1 AND card_id = $2 AND locked = false`, [pointId, cardId]);
  await query(`
    INSERT INTO eurolab_qc_card_audit_logs (card_id, point_id, action, actor_name, before_data)
    VALUES ($1, $2, 'DELETE_POINT', $3, $4::jsonb)
  `, [cardId, pointId, actorName || null, JSON.stringify(before)]);
  await query(`UPDATE eurolab_qc_cards SET updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [cardId]);
}

export async function createRecoveryCardsFromValidation(validationId: number) {
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
    const targetPpm = target * getPpmFactor(componentData.unit);
    const legalLimit = findRecoveryLimit(targetPpm);
    const pointUnit = componentData.unitLabel || componentData.unit || null;
    const baselinePoints: Array<{ label: string; analyst: string; value: number; targetValue: number | null; unit: string | null; recovery: number }> = [];
    const flowPoints: Array<{ label: string; analyst: string; value: number; targetValue: number | null; unit: string | null; recovery: number }> = [];
    const selectedAnalysts = analystNames.slice(0, 2);

    selectedAnalysts.forEach((analyst, analystIndex) => {
      const values = rows
        .map(row => parseNumber(row[analystIndex]))
        .filter(Number.isFinite);

      values.slice(0, 7).forEach((value, valueIndex) => {
        const recovery = Number.isFinite(target) && target > 0 ? (value / target) * 100 : value;
        if (!Number.isFinite(recovery)) return;
        baselinePoints.push({
          label: `Sınır ${analyst} ${valueIndex + 1}`,
          analyst,
          value,
          targetValue: Number.isFinite(target) ? target : null,
          unit: pointUnit,
          recovery,
        });
      });

      const flowValue = values[7];
      const flowRecovery = Number.isFinite(target) && target > 0 ? (flowValue / target) * 100 : flowValue;
      if (Number.isFinite(flowRecovery)) {
        flowPoints.push({
          label: `Takip ${analyst} 1`,
          analyst,
          value: flowValue,
          targetValue: Number.isFinite(target) ? target : null,
          unit: pointUnit,
          recovery: flowRecovery,
        });
      }
    });

    if (baselinePoints.length === 0) continue;

    const recoveries = baselinePoints.map(point => point.recovery);
    const centerLine = sampleMean(recoveries);
    const standardDeviation = sampleStandardDeviation(recoveries);
    const lowerWarningLimit = centerLine - (2 * standardDeviation);
    const upperWarningLimit = centerLine + (2 * standardDeviation);
    const lowerControlLimit = centerLine - (3 * standardDeviation);
    const upperControlLimit = centerLine + (3 * standardDeviation);
    const lowerLegalLimit = legalLimit?.low ?? null;
    const upperLegalLimit = legalLimit?.high ?? null;

    const cardResult = await query(`
      INSERT INTO eurolab_qc_cards
        (
          code, validation_id, validation_code, method_name, component_name, card_type,
          lower_limit, center_line, upper_limit,
          lower_warning_limit, upper_warning_limit, lower_control_limit, upper_control_limit,
          lower_legal_limit, upper_legal_limit, standard_deviation,
          unit, source_data, metadata
        )
      VALUES (
        $1, $2, $3, $4, $5, 'RECOVERY',
        $6, $7, $8,
        $6, $8, $9, $10,
        $11, $12, $13,
        $14, $15::jsonb, $16::jsonb
      )
      ON CONFLICT (validation_id, component_name, card_type)
      DO UPDATE SET
        validation_code = EXCLUDED.validation_code,
        method_name = EXCLUDED.method_name,
        lower_limit = EXCLUDED.lower_limit,
        center_line = EXCLUDED.center_line,
        upper_limit = EXCLUDED.upper_limit,
        lower_warning_limit = EXCLUDED.lower_warning_limit,
        upper_warning_limit = EXCLUDED.upper_warning_limit,
        lower_control_limit = EXCLUDED.lower_control_limit,
        upper_control_limit = EXCLUDED.upper_control_limit,
        lower_legal_limit = EXCLUDED.lower_legal_limit,
        upper_legal_limit = EXCLUDED.upper_legal_limit,
        standard_deviation = EXCLUDED.standard_deviation,
        unit = EXCLUDED.unit,
        source_data = EXCLUDED.source_data,
        metadata = EXCLUDED.metadata,
        updated_at = CURRENT_TIMESTAMP
      RETURNING
        id, code, card_type, validation_id, validation_code, method_name, component_name,
        lower_limit::float AS lower_limit,
        center_line::float AS center_line,
        upper_limit::float AS upper_limit,
        COALESCE(lower_warning_limit, lower_limit)::float AS lower_warning_limit,
        COALESCE(upper_warning_limit, upper_limit)::float AS upper_warning_limit,
        COALESCE(lower_control_limit, lower_limit)::float AS lower_control_limit,
        COALESCE(upper_control_limit, upper_limit)::float AS upper_control_limit,
        lower_legal_limit::float AS lower_legal_limit,
        upper_legal_limit::float AS upper_legal_limit,
        standard_deviation::float AS standard_deviation,
        unit,
        created_at,
        updated_at
    `, [
      `QC-GK-${validation.code}-${componentName}`.replace(/\s+/g, "-").slice(0, 60),
      validation.id,
      validation.code,
      validation.method_name,
      componentName,
      lowerWarningLimit,
      centerLine,
      upperWarningLimit,
      lowerControlLimit,
      upperControlLimit,
      lowerLegalLimit,
      upperLegalLimit,
      standardDeviation,
      pointUnit,
      JSON.stringify({
        trueness: componentData,
        baselinePointCount: baselinePoints.length,
        flowPointCount: flowPoints.length,
      }),
      JSON.stringify({
        source: "TRUENESS",
        cardType: "RECOVERY",
        pointRule: "first_7_per_first_2_analysts_for_limits_plus_next_1_each_for_flow",
        limitRule: "mean_plus_minus_2_and_3_sample_sd",
        standardDeviation,
        lowerWarningLimit,
        upperWarningLimit,
        lowerControlLimit,
        upperControlLimit,
        lowerLegalLimit,
        upperLegalLimit,
      }),
    ]);

    const card = cardResult.rows[0] as QcCardComponent;
    await query(`DELETE FROM eurolab_qc_card_points WHERE card_id = $1 AND source IN ('VALIDATION', 'VALIDATION_BASELINE', 'VALIDATION_FLOW')`, [card.id]);

    for (const [index, point] of baselinePoints.entries()) {
      await query(`
        INSERT INTO eurolab_qc_card_points
          (card_id, sequence_no, label, analyst, value, target_value, unit, recovery, source, locked)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'VALIDATION_BASELINE', true)
      `, [card.id, index + 1, point.label, point.analyst, point.value, point.targetValue, point.unit, point.recovery]);
    }

    for (const [index, point] of flowPoints.entries()) {
      await query(`
        INSERT INTO eurolab_qc_card_points
          (card_id, sequence_no, label, analyst, value, target_value, unit, recovery, source, locked)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'VALIDATION_FLOW', true)
      `, [card.id, baselinePoints.length + index + 1, point.label, point.analyst, point.value, point.targetValue, point.unit, point.recovery]);
    }

    createdCards.push(card);
  }

  if (createdCards.length === 0) {
    throw new Error("Geri kazanım kartı için validasyon geri kazanım verisi bulunamadı.");
  }

  return findQcCardGroupByValidation(validationId, "RECOVERY");
}

export async function createRangeCardsFromValidation(validationId: number) {
  return createRecoveryCardsFromValidation(validationId);
}
