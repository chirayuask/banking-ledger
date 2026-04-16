import pool from '../db/postgres.js';
import { accountRepo } from '../repository/account.js';
import { transactionRepo } from '../repository/transaction.js';
import { auditRepo } from '../repository/audit.js';
import { acquireAccountLocks } from '../pkg/redis/client.js';
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

export const transferService = {
  async transfer({ sourceAccountId, destAccountId, amount, idempotencyKey }) {
    if (sourceAccountId === destAccountId) {
      await logFailure('TRANSFER', sourceAccountId, destAccountId, amount, 'SAME_ACCOUNT');
      throw { status: 400, code: 'badRequest', message: 'Source and destination accounts must be different' };
    }

    // Idempotency check
    const existing = await transactionRepo.getByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    // Acquire Redis locks on both accounts (sorted order prevents deadlocks)
    const releaseLocks = await acquireAccountLocks([sourceAccountId, destAccountId]);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Atomic decrement source — CHECK constraint prevents negative balance
      await accountRepo.decrementBalance(client, sourceAccountId, amount);

      // Atomic increment destination
      await accountRepo.incrementBalance(client, destAccountId, amount);

      // Create transaction record
      const txn = await transactionRepo.create(client, {
        type: 'TRANSFER',
        sourceAccountId,
        destAccountId,
        amount,
        status: 'SUCCESS',
        idempotencyKey,
      });

      // Audit log
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
      if (client) await client.query('ROLLBACK').catch(() => {});
      // Log failure for business errors
      if (err.status === 422) {
        await logFailure('TRANSFER', sourceAccountId, destAccountId, amount, 'INSUFFICIENT_FUNDS');
      } else if (err.status === 404) {
        await logFailure('TRANSFER', sourceAccountId, destAccountId, amount, 'ACCOUNT_NOT_FOUND');
      }
      throw err;
    } finally {
      client.release();
      await releaseLocks();
    }
  },

  async deposit({ accountId, amount, idempotencyKey }) {
    const existing = await transactionRepo.getByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    // Acquire Redis lock on the account
    const releaseLocks = await acquireAccountLocks([accountId]);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Atomic increment
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
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (err.status === 404) {
        await logFailure('DEPOSIT', null, accountId, amount, 'ACCOUNT_NOT_FOUND');
      }
      throw err;
    } finally {
      client.release();
      await releaseLocks();
    }
  },

  async withdraw({ accountId, amount, idempotencyKey }) {
    const existing = await transactionRepo.getByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    // Acquire Redis lock on the account
    const releaseLocks = await acquireAccountLocks([accountId]);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Atomic decrement — CHECK constraint prevents negative balance
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
      if (client) await client.query('ROLLBACK').catch(() => {});
      if (err.status === 422) {
        await logFailure('WITHDRAWAL', accountId, null, amount, 'INSUFFICIENT_FUNDS');
      } else if (err.status === 404) {
        await logFailure('WITHDRAWAL', accountId, null, amount, 'ACCOUNT_NOT_FOUND');
      }
      throw err;
    } finally {
      client.release();
      await releaseLocks();
    }
  },
};
