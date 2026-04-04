const mssql = require('mssql');

const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  server: process.env.DB_SERVER || '',
  port: 1433,
  options: { encrypt: true, trustServerCertificate: true },
};

async function checkRows() {
  try {
    let pool = await mssql.connect(sqlConfig);
    
    console.log("--- rUGDListe ---");
    let res1 = await pool.request().query("SELECT TOP 0 * FROM rUGDListe");
    Object.keys(res1.recordset.columns).forEach(c => console.log("L:" + c));
    
    console.log("--- rUGDTip ---");
    let res2 = await pool.request().query("SELECT TOP 0 * FROM rUGDTip");
    Object.keys(res2.recordset.columns).forEach(c => console.log("T:" + c));
    
    await pool.close();
  } catch (err) {
    console.error(err);
  }
}

checkRows();
