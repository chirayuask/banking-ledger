import pool from '../db/postgres.js';
import { accountRepo } from '../repository/account.js';
import { transactionRepo } from '../repository/transaction.js';
import { reversalRepo } from '../repository/reversal.js';
import { auditRepo } from '../repository/audit.js';
import { acquireAccountLocks } from '../pkg/redis/client.js';

const reverseTransfer = async (client, originalTxn) => {
  const { source_account_id: sourceId, dest_account_id: destId, amount } = originalTxn;

  // Atomic: credit source, debit dest — CHECK constraint prevents negative
  await accountRepo.incrementBalance(client, sourceId, amount);
  await accountRepo.decrementBalance(client, destId, amount);
};

const reverseDeposit = async (client, originalTxn) => {
  const { dest_account_id: destId, amount } = originalTxn;

  // Atomic debit — CHECK constraint prevents negative balance
  await accountRepo.decrementBalance(client, destId, amount);
};

const reverseWithdrawal = async (client, originalTxn) => {
  const { source_account_id: sourceId, amount } = originalTxn;

  // Atomic credit — always safe (adding money)
  await accountRepo.incrementBalance(client, sourceId, amount);
};

export const reversalService = {
  async reverse({ transactionId, idempotencyKey }) {
    // Idempotency check on reversal key
    const existingRev = await reversalRepo.getByIdempotencyKey(idempotencyKey);
    if (existingRev) return existingRev;

    // Find original transaction
    const originalTxn = await transactionRepo.getById(transactionId);
    if (!originalTxn) {
      throw { status: 404, code: 'notFound', message: 'Transaction not found' };
    }

    // Already reversed? Return existing reversal for idempotency
    if (originalTxn.status === 'REVERSED') {
      const existing = await reversalRepo.getByOriginalTransactionId(transactionId);
      if (existing) return existing;
      throw { status: 409, code: 'conflict', message: 'Transaction already reversed' };
    }

    // Acquire Redis locks on all involved accounts
    const accountIds = [originalTxn.source_account_id, originalTxn.dest_account_id];
    const releaseLocks = await acquireAccountLocks(accountIds);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert reversal — UNIQUE constraint prevents duplicates
      let reversal;
      try {
        reversal = await reversalRepo.create(client, transactionId, idempotencyKey);
      } catch (err) {
        // Unique violation = concurrent reversal already won
        if (err.code === '23505') {
          await client.query('ROLLBACK');
          const existing = await reversalRepo.getByOriginalTransactionId(transactionId);
          if (existing) return existing;
          throw { status: 409, code: 'conflict', message: 'Transaction already reversed' };
        }
        throw err;
      }

      // Reverse based on type — uses atomic increment/decrement
      switch (originalTxn.type) {
        case 'TRANSFER':
          await reverseTransfer(client, originalTxn);
          break;
        case 'DEPOSIT':
          await reverseDeposit(client, originalTxn);
          break;
        case 'WITHDRAWAL':
          await reverseWithdrawal(client, originalTxn);
          break;
      }

      // Mark original as REVERSED
      await transactionRepo.updateStatus(client, transactionId, 'REVERSED');

      // Audit log
      await auditRepo.createInTx(client, {
        operation: 'REVERSAL',
        sourceAccountId: originalTxn.source_account_id,
        destAccountId: originalTxn.dest_account_id,
        amount: originalTxn.amount,
        outcome: 'SUCCESS',
        failureReason: null,
        transactionId,
      });

      await client.query('COMMIT');
      return reversal;
    } catch (err) {
      if (client) await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
      await releaseLocks();
    }
  },
};
