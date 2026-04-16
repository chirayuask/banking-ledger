import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import config from '../config/index.js';
import logger from '../config/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

const direction = process.argv[2]; // 'up' or 'down'

if (!['up', 'down'].includes(direction)) {
  console.error('Usage: node migrate.js <up|down>');
  process.exit(1);
}

const client = new Client({
  host: config.postgres.host,
  port: config.postgres.port,
  user: config.postgres.user,
  password: config.postgres.password,
  database: config.postgres.database,
});

try {
  await client.connect();

  const file = direction === 'up' ? '000001_init.up.sql' : '000001_init.down.sql';
  const sql = readFileSync(resolve(__dirname, '../../migrations', file), 'utf-8');

  await client.query(sql);
  logger.info(`Migration ${direction} completed successfully`);
} catch (err) {
  logger.error(`Migration ${direction} failed`, { error: err.message });
  process.exit(1);
} finally {
  await client.end();
}
