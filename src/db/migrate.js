import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import config from '../config/index.js';
import logger from '../config/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

const direction = process.argv[2]; // 'up', 'down', or 'reset'

if (!['up', 'down', 'reset'].includes(direction)) {
  console.error('Usage: node migrate.js <up|down|reset>');
  process.exit(1);
}

const migrationsDir = resolve(__dirname, '../../migrations');

// Collect migration files sorted by version number
function collectFiles(suffix) {
  return readdirSync(migrationsDir)
    .filter((f) => f.endsWith(suffix))
    .sort();
}

const upFiles = collectFiles('.up.sql');
const downFiles = collectFiles('.down.sql').reverse(); // reverse order for down

async function runFiles(client, files, label, ignoreErrors = false) {
  for (const file of files) {
    const sql = readFileSync(resolve(migrationsDir, file), 'utf-8');
    logger.info(`  ${label} ${file}`);
    try {
      await client.query(sql);
    } catch (err) {
      if (ignoreErrors) {
        logger.warn(`  ⚠ ${file} skipped (${err.message})`);
      } else {
        throw err;
      }
    }
  }
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

  if (direction === 'up') {
    logger.info('Running all UP migrations...');
    await runFiles(client, upFiles, '↑');
    logger.info('All migrations applied successfully');
  } else if (direction === 'down') {
    logger.info('Running all DOWN migrations (reverse order)...');
    await runFiles(client, downFiles, '↓');
    logger.info('All migrations rolled back successfully');
  } else if (direction === 'reset') {
    logger.info('=== Migration Reset ===');
    logger.info('Running all DOWN migrations (reverse order, skipping errors)...');
    await runFiles(client, downFiles, '↓', true);
    logger.info('Down migrations done.\n');
    logger.info('Running all UP migrations...');
    await runFiles(client, upFiles, '↑');
    logger.info('All migrations applied.');
    logger.info('=== Migration Reset Complete ===');
  }
} catch (err) {
  logger.error(`Migration ${direction} failed`, { error: err.message });
  process.exit(1);
} finally {
  await client.end();
}
