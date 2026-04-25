import { createPool } from '@vercel/postgres';

/**
 * Eurolab Modülü için Gerçek Vercel Postgres / Neon Bağlantısı
 */

let pool: ReturnType<typeof createPool> | undefined;

export const hasEurolabDatabaseConfig = () =>
  Boolean(process.env.EUROLAB_POSTGRES_URL || process.env.POSTGRES_URL);

const getPool = () => {
  const connectionString = process.env.EUROLAB_POSTGRES_URL || process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("Eurolab metot veritabanı bağlantısı eksik. EUROLAB_POSTGRES_URL veya POSTGRES_URL tanımlanmalı.");
  }

  pool ??= createPool({
    connectionString,
  });

  return pool;
};

// Kolay kullanım için query yardımcısı
export const query = async (text: string, params?: unknown[]) => {
  const start = Date.now();
  try {
    const res = await getPool().query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database Query Error:', error);
    throw error;
  }
};
