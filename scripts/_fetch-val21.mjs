import { createPool } from '@vercel/postgres';
import fs from 'node:fs';

const pool = createPool({ connectionString: process.env.EUROLAB_POSTGRES_URL });

const sql = `
  SELECT v.id, v.code, v.title, v.study_type, v.status, v.config,
         m.method_code, m.name AS method_name, m.technique, m.matrix, m.personnel
  FROM eurolab_validations v
  LEFT JOIN eurolab_methods m ON m.id = v.method_id
  WHERE v.id = $1
  LIMIT 1
`;

const r = await pool.query(sql, [21]);
const row = r.rows[0];
if (!row) { console.log('NOT FOUND'); process.exit(1); }
fs.writeFileSync('scripts/_val21.json', JSON.stringify(row, null, 2), 'utf8');
console.log('OK', row.id, row.title);
console.log('config keys:', Object.keys(row.config || {}).join(', '));
console.log('moduleData keys:', Object.keys(row.config?.moduleData || {}).join(', '));
console.log('components:', (row.config?.components || []).map(c => c.name).join(', '));
console.log('personnel:', (row.config?.personnel || []).map(p => p.name).join(', '));
console.log('parameters:', (row.config?.parameters || []).filter(p => p.isEnabled).map(p => p.id).join(', '));
process.exit(0);
