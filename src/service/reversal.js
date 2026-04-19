import pool from '../db/postgres.js';
import { accountRepo } from '../repository/account.js';
import { transactionRepo } from '../repository/transaction.js';
import { reversalRepo } from '../repository/reversal.js';
import { auditRepo } from '../repository/audit.js';
import logger from '../config/logger.js';

const logFailure = async ({ sourceAccountId, destAccountId, amount, reason, transactionId }) => {
  try {
    await auditRepo.create({
      operation: 'REVERSAL',
      sourceAccountId,
      destAccountId,
      amount,
      outcome: 'FAILURE',
      failureReason: reason,
      transactionId,
    });
  } catch (err) {
    logger.error('Failed to write reversal failure audit log', { error: err.message });
  }
};

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

const withOriginalAccounts = (reversal, originalTxn) => ({
  ...reversal,
  original_source_account_id: originalTxn.source_account_id,
  original_dest_account_id: originalTxn.dest_account_id,
});

export const reversalService = {
  async reverse({ transactionId, idempotencyKey }) {
    const originalTxn = await transactionRepo.getById(transactionId);
    if (!originalTxn) {
      await logFailure({
        sourceAccountId: null,
        destAccountId: null,
        amount: 0,
        reason: 'TRANSACTION_NOT_FOUND',
        transactionId: null,
      });
      throw { status: 404, code: 'notFound', message: 'Transaction not found' };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await lockAccountsForUpdate(client, [
        originalTxn.source_account_id,
        originalTxn.dest_account_id,
      ]);

      let reversal;
      try {
        reversal = await reversalRepo.create(client, transactionId, idempotencyKey);
      } catch (err) {
        if (err.code === '23505') {
          await client.query('ROLLBACK');
          // Existing reversal found. If the retry uses the SAME idempotency key
          // it's a replay (return 201 with the winner). Otherwise it's a genuine
          // conflict from a different client.
          const existing = await reversalRepo.getByOriginalTransactionId(transactionId);
          if (existing && existing.idempotency_key === idempotencyKey) {
            return withOriginalAccounts(existing, originalTxn);
          }
          await logFailure({
            sourceAccountId: originalTxn.source_account_id,
            destAccountId: originalTxn.dest_account_id,
            amount: originalTxn.amount,
            reason: 'ALREADY_REVERSED',
            transactionId,
          });
          throw { status: 409, code: 'conflict', message: 'Transaction already reversed' };
        }
        throw err;
      }

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

      await transactionRepo.updateStatus(client, transactionId, 'REVERSED');

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
      return withOriginalAccounts(reversal, originalTxn);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      const reason =
        err.status === 422 ? 'INSUFFICIENT_FUNDS' :
        err.status === 404 ? 'ACCOUNT_NOT_FOUND' :
        null;
      if (reason) {
        await logFailure({
          sourceAccountId: originalTxn.source_account_id,
          destAccountId: originalTxn.dest_account_id,
          amount: originalTxn.amount,
          reason,
          transactionId,
        });
      }
      throw err;
    } finally {
      client.release();
    }
  },
};
