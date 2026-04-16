import 'dotenv/config';

const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT, 10) || 8080,

  postgres: {
    host: process.env.POSTGRES_HOST ?? 'localhost',
    port: parseInt(process.env.POSTGRES_PORT, 10) || 5432,
    user: process.env.POSTGRES_USER ?? 'banking',
    password: process.env.POSTGRES_PASSWORD ?? 'banking123',
    database: process.env.POSTGRES_DB ?? 'banking_ledger',
    max: parseInt(process.env.POSTGRES_MAX_CONNECTIONS, 10) || 20,
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
};

export default config;
