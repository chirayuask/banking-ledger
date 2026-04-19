import pool from '../db/postgres.js';
import { accountRepo } from '../repository/account.js';
import { transactionRepo } from '../repository/transaction.js';
import { auditRepo } from '../repository/audit.js';
import logger from '../config/logger.js';

const logFailure = async (operation, sourceAccountId, destAccountId, amount, reason) => {
  try {
    await auditRepo.create({
      operation,
      sourceAccountId,
      destAccountId,
      amount,
      outcome: 'FAILURE',
      failureReason: reason,
      transactionId: null,
    });
  } catch (err) {
    logger.error('Failed to write failure audit log', { error: err.message });
  }
};

// Lock rows FOR UPDATE in deterministic order so concurrent transfers A↔B can't deadlock.
const lockAccountsForUpdate = async (client, accountIds) => {
  const sorted = [...new Set(accountIds.filter(Boolean))].sort();
  for (const id of sorted) {
    const { rowCount } = await client.query(
      'SELECT id FROM accounts WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (rowCount === 0) {
      throw { status: 404, code: 'notFound', message: `Account not found: ${id}` };
    }
  }
};

export const transferService = {
  async transfer({ sourceAccountId, destAccountId, amount, idempotencyKey }) {
    if (sourceAccountId === destAccountId) {
      await logFailure('TRANSFER', sourceAccountId, destAccountId, amount, 'SAME_ACCOUNT');
      throw { status: 400, code: 'badRequest', message: 'Source and destination accounts must be different' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await lockAccountsForUpdate(client, [sourceAccountId, destAccountId]);

      await accountRepo.decrementBalance(client, sourceAccountId, amount);
      await accountRepo.incrementBalance(client, destAccountId, amount);

      const txn = await transactionRepo.create(client, {
        type: 'TRANSFER',
        sourceAccountId,
        destAccountId,
        amount,
        status: 'SUCCESS',
        idempotencyKey,
      });

      await auditRepo.createInTx(client, {
        operation: 'TRANSFER',
        sourceAccountId,
        destAccountId,
        amount,
        outcome: 'SUCCESS',
        failureReason: null,
        transactionId: txn.id,
      });

      await client.query('COMMIT');
      return txn;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      // Idempotent replay: same key retried — return the winner's transaction.
      if (err.code === '23505' && err.constraint === 'transactions_idempotency_key_key') {
        return transactionRepo.getByIdempotencyKey(idempotencyKey);
      }
      if (err.status === 422) {
        await logFailure('TRANSFER', sourceAccountId, destAccountId, amount, 'INSUFFICIENT_FUNDS');
      } else if (err.status === 404) {
        await logFailure('TRANSFER', sourceAccountId, destAccountId, amount, 'ACCOUNT_NOT_FOUND');
      }
      throw err;
    } finally {
      client.release();
    }
  },

  async deposit({ accountId, amount, idempotencyKey }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await lockAccountsForUpdate(client, [accountId]);

      await accountRepo.incrementBalance(client, accountId, amount);

      const txn = await transactionRepo.create(client, {
        type: 'DEPOSIT',
        sourceAccountId: null,
        destAccountId: accountId,
        amount,
        status: 'SUCCESS',
        idempotencyKey,
      });

      await auditRepo.createInTx(client, {
        operation: 'DEPOSIT',
        sourceAccountId: null,
        destAccountId: accountId,
        amount,
        outcome: 'SUCCESS',
        failureReason: null,
        transactionId: txn.id,
      });

      await client.query('COMMIT');
      return txn;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23505' && err.constraint === 'transactions_idempotency_key_key') {
        return transactionRepo.getByIdempotencyKey(idempotencyKey);
      }
      if (err.status === 404) {
        await logFailure('DEPOSIT', null, accountId, amount, 'ACCOUNT_NOT_FOUND');
      }
      throw err;
    } finally {
      client.release();
    }
  },

  async withdraw({ accountId, amount, idempotencyKey }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await lockAccountsForUpdate(client, [accountId]);

      await accountRepo.decrementBalance(client, accountId, amount);

      const txn = await transactionRepo.create(client, {
        type: 'WITHDRAWAL',
        sourceAccountId: accountId,
        destAccountId: null,
        amount,
        status: 'SUCCESS',
        idempotencyKey,
      });

      await auditRepo.createInTx(client, {
        operation: 'WITHDRAWAL',
        sourceAccountId: accountId,
        destAccountId: null,
        amount,
        outcome: 'SUCCESS',
        failureReason: null,
        transactionId: txn.id,
      });

      await client.query('COMMIT');
      return txn;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      if (err.code === '23505' && err.constraint === 'transactions_idempotency_key_key') {
        return transactionRepo.getByIdempotencyKey(idempotencyKey);
      }
      if (err.status === 422) {
        await logFailure('WITHDRAWAL', accountId, null, amount, 'INSUFFICIENT_FUNDS');
      } else if (err.status === 404) {
        await logFailure('WITHDRAWAL', accountId, null, amount, 'ACCOUNT_NOT_FOUND');
      }
      throw err;
    } finally {
      client.release();
    }
  },
};
