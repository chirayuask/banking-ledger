import pool from '../db/postgres.js';
import { accountRepo } from '../repository/account.js';
import { transactionRepo } from '../repository/transaction.js';
import { reversalRepo } from '../repository/reversal.js';
import { auditRepo } from '../repository/audit.js';
import { acquireAccountLocks } from '../pkg/redis/client.js';

const reverseTransfer = async (client, originalTxn) => {
  const { source_account_id: sourceId, dest_account_id: destId, amount } = originalTxn;

  await accountRepo.incrementBalance(client, sourceId, amount);
  await accountRepo.decrementBalance(client, destId, amount);
};

const reverseDeposit = async (client, originalTxn) => {
  const { dest_account_id: destId, amount } = originalTxn;

  await accountRepo.decrementBalance(client, destId, amount);
};

const reverseWithdrawal = async (client, originalTxn) => {
  const { source_account_id: sourceId, amount } = originalTxn;

  await accountRepo.incrementBalance(client, sourceId, amount);
};

export const reversalService = {
  async reverse({ transactionId, idempotencyKey }) {
    // We need the original transaction to know which accounts to lock and reverse
    const originalTxn = await transactionRepo.getById(transactionId);
    if (!originalTxn) {
      throw { status: 404, code: 'notFound', message: 'Transaction not found' };
    }

    const accountIds = [originalTxn.source_account_id, originalTxn.dest_account_id];
    const releaseLocks = await acquireAccountLocks(accountIds);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Attempt INSERT — UNIQUE constraints on original_transaction_id and
      // idempotency_key will reject duplicates. No pre-check needed.
      let reversal;
      try {
        reversal = await reversalRepo.create(client, transactionId, idempotencyKey);
      } catch (err) {
        if (err.code === '23505') {
          await client.query('ROLLBACK');
          throw { status: 409, code: 'conflict', message: 'Transaction already reversed' };
        }
        throw err;
      }

      // Reverse based on type
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
