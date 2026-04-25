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
    trustServerCertificate: true,
  },
};

let connectionPromise: Promise<mssql.ConnectionPool> | undefined;

const getPool = () => {
  if (!process.env.DB_SERVER || !process.env.DB_NAME || !process.env.DB_USER) {
    throw new Error("MSSQL environment variables are missing. Set DB_SERVER, DB_NAME, DB_USER and DB_PASSWORD.");
  }

  connectionPromise ??= new mssql.ConnectionPool(sqlConfig)
    .connect()
    .then((pool) => {
      console.log("MSSQL veritabanina basariyla baglanildi.");
      return pool;
    })
    .catch((err) => {
      console.log("Veritabani baglantisi basarisiz! Hata: ", err);
      connectionPromise = undefined;
      throw err;
    });

  return connectionPromise;
};

const poolPromise: PromiseLike<mssql.ConnectionPool> = {
  then: (onfulfilled, onrejected) => getPool().then(onfulfilled, onrejected),
};

export default poolPromise;
