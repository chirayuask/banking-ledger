import pg from 'pg';
import config from '../config/index.js';
import logger from '../config/logger.js';

// Parse BIGINT (OID 20) as JavaScript number instead of string.
// Safe for balances in paisa (max safe integer ~90 trillion rupees).
pg.types.setTypeParser(20, (val) => Number(val));
pg.types.setTypeParser(1700, (val) => parseFloat(val)); // NUMERIC

const { Pool } = pg;

const pool = new Pool({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
  max: config.postgres.max,
});

pool.on('error', (err) => {
  logger.error('Unexpected Postgres pool error', { error: err.message });
});

export const initPostgres = async () => {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('Connected to PostgreSQL');
  } finally {
    client.release();
  }
};

export default pool;
