import pool from '../db/postgres.js';

export const accountRepo = {
  async create(name, accountNumber, ifscCode, initialBalance) {
    const { rows } = await pool.query(
      `INSERT INTO accounts (name, account_number, ifsc_code, balance) VALUES ($1, $2, $3, $4)
       RETURNING id, name, account_number, ifsc_code, balance, created_at, updated_at`,
      [name, accountNumber, ifscCode, initialBalance],
    );
    return rows[0];
  },

  async getById(id) {
    const { rows } = await pool.query(
      `SELECT id, name, account_number, ifsc_code, balance, created_at, updated_at FROM accounts WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async list() {
    const { rows } = await pool.query(
      `SELECT id, name, account_number, ifsc_code, balance, created_at, updated_at FROM accounts ORDER BY created_at DESC`,
    );
    return rows;
  },

  async getByIdForUpdate(client, id) {
    const { rows } = await client.query(
      `SELECT id, name, account_number, ifsc_code, balance, created_at, updated_at FROM accounts WHERE id = $1 FOR UPDATE`,
      [id],
    );
    return rows[0] ?? null;
  },

  async updateBalance(client, id, newBalance) {
    await client.query(
      `UPDATE accounts SET balance = $1, updated_at = NOW() WHERE id = $2`,
      [newBalance, id],
    );
  },
};
