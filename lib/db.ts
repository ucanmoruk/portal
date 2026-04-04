import mssql from "mssql";

const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  server: process.env.DB_SERVER || "",
  port: 1433,
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
  options: {
    encrypt: true, 
    trustServerCertificate: true, // Local dev/IP connections için
  },
};

const poolPromise = new mssql.ConnectionPool(sqlConfig)
  .connect()
  .then((pool) => {
    console.log("MSSQL veritabanına başarıyla bağlanıldı.");
    return pool;
  })
  .catch((err) => {
    console.log("Veritabanı bağlantısı başarısız! Hata: ", err);
    throw err;
  });

export default poolPromise;
