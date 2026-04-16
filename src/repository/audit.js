import pool from '../db/postgres.js';

export const auditRepo = {
  async createInTx(client, { operation, sourceAccountId, destAccountId, amount, outcome, failureReason, transactionId }) {
    const { rows } = await client.query(
      `INSERT INTO audit_logs (operation, source_account_id, dest_account_id, amount, outcome, failure_reason, transaction_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [operation, sourceAccountId, destAccountId, amount, outcome, failureReason, transactionId],
    );
    return rows[0];
  },

  async create({ operation, sourceAccountId, destAccountId, amount, outcome, failureReason, transactionId }) {
    const { rows } = await pool.query(
      `INSERT INTO audit_logs (operation, source_account_id, dest_account_id, amount, outcome, failure_reason, transaction_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, created_at`,
      [operation, sourceAccountId, destAccountId, amount, outcome, failureReason, transactionId],
    );
    return rows[0];
  },

  async list(accountId, limit = 50, offset = 0) {
    if (accountId) {
      const { rows } = await pool.query(
        `SELECT id, operation, source_account_id, dest_account_id, amount, outcome, failure_reason, transaction_id, created_at
         FROM audit_logs
         WHERE source_account_id = $1 OR dest_account_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [accountId, limit, offset],
      );
      return rows;
    }

    const { rows } = await pool.query(
      `SELECT id, operation, source_account_id, dest_account_id, amount, outcome, failure_reason, transaction_id, created_at
       FROM audit_logs
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset],
    );
    return rows;
  },
};
