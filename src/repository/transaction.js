import pool from '../db/postgres.js';

export const transactionRepo = {
  async create(client, { type, sourceAccountId, destAccountId, amount, status, idempotencyKey }) {
    const { rows } = await client.query(
      `INSERT INTO transactions (type, source_account_id, dest_account_id, amount, status, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, type, source_account_id, dest_account_id, amount, status, idempotency_key, created_at`,
      [type, sourceAccountId, destAccountId, amount, status, idempotencyKey],
    );
    return rows[0];
  },

  async getById(id) {
    const { rows } = await pool.query(
      `SELECT id, type, source_account_id, dest_account_id, amount, status, idempotency_key, created_at
       FROM transactions WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async getByIdempotencyKey(key) {
    const { rows } = await pool.query(
      `SELECT id, type, source_account_id, dest_account_id, amount, status, idempotency_key, created_at
       FROM transactions WHERE idempotency_key = $1`,
      [key],
    );
    return rows[0] ?? null;
  },

  async updateStatus(client, id, status) {
    await client.query(
      `UPDATE transactions SET status = $1 WHERE id = $2`,
      [status, id],
    );
  },

  async list(accountId, limit = 50, offset = 0) {
    if (accountId) {
      const { rows } = await pool.query(
        `SELECT id, type, source_account_id, dest_account_id, amount, status, idempotency_key, created_at
         FROM transactions
         WHERE source_account_id = $1 OR dest_account_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [accountId, limit, offset],
      );
      return rows;
    }

    const { rows } = await pool.query(
      `SELECT id, type, source_account_id, dest_account_id, amount, status, idempotency_key, created_at
       FROM transactions
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows;
  },
};
