import express from 'express';
import cors from 'cors';
import config from './config/index.js';
import logger from './config/logger.js';
import { initPostgres } from './db/postgres.js';
import pool from './db/postgres.js';
import { initRedis, closeRedis } from './pkg/redis/client.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRoutes from './routes/index.js';

const app = express();

// ---- Global middleware ----
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// ---- Health check ----
app.get('/ping', (req, res) => {
  res.json({ status: 'success', message: 'pong' });
});

// ---- API routes ----
app.use('/api', apiRoutes);

// ---- Error handler (must be last) ----
app.use(errorHandler);

// ---- Start ----
const start = async () => {
  try {
    await initPostgres();
    await initRedis();

    const server = app.listen(config.port, () => {
      logger.info(`Banking Ledger API running on port ${config.port}`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}, shutting down...`);

      server.close(() => logger.info('HTTP server closed'));

      await pool.end().catch((err) => logger.error('Error closing Postgres', { error: err.message }));
      await closeRedis().catch((err) => logger.error('Error closing Redis', { error: err.message }));

      logger.info('Server gracefully stopped');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error('Failed to start server', { error: err.message || String(err), stack: err.stack });
    process.exit(1);
  }
};

start();
