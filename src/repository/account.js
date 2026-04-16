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

  // Atomic increment — balance + amount, relies on CHECK (balance >= 0) for safety
  async incrementBalance(client, id, amount) {
    const { rowCount } = await client.query(
      `UPDATE accounts SET balance = balance + $1, updated_at = NOW() WHERE id = $2`,
      [amount, id],
    );
    if (rowCount === 0) throw { status: 404, code: 'notFound', message: `Account not found: ${id}` };
  },

  // Atomic decrement — balance - amount, CHECK constraint prevents negative balance
  async decrementBalance(client, id, amount) {
    try {
      const { rowCount } = await client.query(
        `UPDATE accounts SET balance = balance - $1, updated_at = NOW() WHERE id = $2`,
        [amount, id],
      );
      if (rowCount === 0) throw { status: 404, code: 'notFound', message: `Account not found: ${id}` };
    } catch (err) {
      // CHECK constraint violation (balance_non_negative)
      if (err.code === '23514') {
        throw { status: 422, code: 'unprocessableEntity', message: 'Insufficient funds' };
      }
      throw err;
    }
  },
};
