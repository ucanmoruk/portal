import { createPool } from '@vercel/postgres';

/**
 * Eurolab Modülü için Gerçek Vercel Postgres / Neon Bağlantısı
 */

const pool = createPool({
  connectionString: process.env.POSTGRES_URL,
});

export default pool;

// Kolay kullanım için query yardımcısı
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Executed query', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database Query Error:', error);
    throw error;
  }
};
