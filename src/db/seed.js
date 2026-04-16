import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import config from '../config/index.js';
import logger from '../config/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

const client = new Client({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
});

try {
  await client.connect();
  const sql = readFileSync(resolve(__dirname, '../../scripts/seed.sql'), 'utf-8');
  await client.query(sql);
  logger.info('Seed data inserted successfully');
} catch (err) {
  logger.error('Seed failed', { error: err.message });
  process.exit(1);
} finally {
  await client.end();
}
