const fs = require('fs');
const sql = require('mssql');

const env = fs.readFileSync('.env.local', 'utf8');
const config = {};
env.split('\n').forEach(line => {
  const [key, ...val] = line.split('=');
  if (key && val.length) config[key.trim()] = val.join('=').trim();
});

const sqlConfig = {
  user: config.DB_USER,
  password: config.DB_PASSWORD,
  server: config.DB_SERVER,
  database: config.DB_NAME,
  options: { encrypt: true, trustServerCertificate: true }
};

async function check() {
  try {
    const pool = await sql.connect(sqlConfig);
    const result = await pool.request().query("SELECT TOP 5 * FROM rUGDYonetmelik");
    console.log(JSON.stringify(result.recordset, null, 2));
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

check();
