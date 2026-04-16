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

const logFailureInTx = async (client, operation, sourceAccountId, destAccountId, amount, reason) => {
  try {
    await auditRepo.createInTx(client, {
      operation,
      sourceAccountId,
      destAccountId,
      amount,
      outcome: 'FAILURE',
      failureReason: reason,
      transactionId: null,
    });
  } catch (err) {
    logger.error('Failed to write failure audit log in tx', { error: err.message });
  }
};

export const transferService = {
  async transfer({ sourceAccountId, destAccountId, amount, idempotencyKey }) {
    // Validate: source != dest
    if (sourceAccountId === destAccountId) {
      await logFailure('TRANSFER', sourceAccountId, destAccountId, amount, 'SAME_ACCOUNT');
      throw { status: 400, code: 'badRequest', message: 'Source and destination accounts must be different' };
    }

    // Idempotency check
    const existing = await transactionRepo.getByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    // Determine lock order: smaller UUID first to prevent deadlocks
    const [firstId, secondId] = sourceAccountId < destAccountId
      ? [sourceAccountId, destAccountId]
      : [destAccountId, sourceAccountId];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Lock both accounts in deterministic order
      const firstAcc = await accountRepo.getByIdForUpdate(client, firstId);
      if (!firstAcc) {
        await client.query('ROLLBACK');
        await logFailure('TRANSFER', sourceAccountId, destAccountId, amount, 'ACCOUNT_NOT_FOUND');
        throw { status: 404, code: 'notFound', message: `Account not found: ${firstId}` };
      }

      const secondAcc = await accountRepo.getByIdForUpdate(client, secondId);
      if (!secondAcc) {
        await client.query('ROLLBACK');
        await logFailure('TRANSFER', sourceAccountId, destAccountId, amount, 'ACCOUNT_NOT_FOUND');
        throw { status: 404, code: 'notFound', message: `Account not found: ${secondId}` };
      }

      // Map back to source/dest
      const sourceAcc = firstAcc.id === sourceAccountId ? firstAcc : secondAcc;
      const destAcc = firstAcc.id === destAccountId ? firstAcc : secondAcc;

      // Check sufficient balance
      if (sourceAcc.balance < amount) {
        await logFailureInTx(client, 'TRANSFER', sourceAccountId, destAccountId, amount, 'INSUFFICIENT_FUNDS');
        await client.query('COMMIT'); // commit the failure audit log
        throw { status: 422, code: 'unprocessableEntity', message: 'Insufficient funds' };
      }

      // Debit source, credit dest
      await accountRepo.updateBalance(client, sourceAccountId, sourceAcc.balance - amount);
      await accountRepo.updateBalance(client, destAccountId, destAcc.balance + amount);

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
      throw err;
    } finally {
      client.release();
    }
  },

  async deposit({ accountId, amount, idempotencyKey }) {
    const existing = await transactionRepo.getByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const acc = await accountRepo.getByIdForUpdate(client, accountId);
      if (!acc) {
        await client.query('ROLLBACK');
        await logFailure('DEPOSIT', null, accountId, amount, 'ACCOUNT_NOT_FOUND');
        throw { status: 404, code: 'notFound', message: 'Account not found' };
      }

      await accountRepo.updateBalance(client, accountId, acc.balance + amount);

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
      throw err;
    } finally {
      client.release();
    }
  },

  async withdraw({ accountId, amount, idempotencyKey }) {
    const existing = await transactionRepo.getByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const acc = await accountRepo.getByIdForUpdate(client, accountId);
      if (!acc) {
        await client.query('ROLLBACK');
        await logFailure('WITHDRAWAL', accountId, null, amount, 'ACCOUNT_NOT_FOUND');
        throw { status: 404, code: 'notFound', message: 'Account not found' };
      }

      if (acc.balance < amount) {
        await logFailureInTx(client, 'WITHDRAWAL', accountId, null, amount, 'INSUFFICIENT_FUNDS');
        await client.query('COMMIT');
        throw { status: 422, code: 'unprocessableEntity', message: 'Insufficient funds' };
      }

      await accountRepo.updateBalance(client, accountId, acc.balance - amount);

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
      throw err;
    } finally {
      client.release();
    }
  },
};
