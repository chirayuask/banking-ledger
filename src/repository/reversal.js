import pool from '../db/postgres.js';

export const reversalRepo = {
  async create(client, originalTransactionId, idempotencyKey) {
    const { rows } = await client.query(
      `INSERT INTO reversals (original_transaction_id, idempotency_key)
       VALUES ($1, $2)
       RETURNING id, original_transaction_id, idempotency_key, created_at`,
      [originalTransactionId, idempotencyKey],
    );
    return rows[0];
  },

  async getByOriginalTransactionId(originalTransactionId) {
    const { rows } = await pool.query(
      `SELECT id, original_transaction_id, idempotency_key, created_at
       FROM reversals WHERE original_transaction_id = $1`,
      [originalTransactionId],
    );
    return rows[0] ?? null;
  },

  async getByIdempotencyKey(key) {
    const { rows } = await pool.query(
      `SELECT id, original_transaction_id, idempotency_key, created_at
       FROM reversals WHERE idempotency_key = $1`,
      [key],
    );
    return rows[0] ?? null;
  },
};
