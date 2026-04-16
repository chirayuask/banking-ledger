import { transactionRepo } from '../repository/transaction.js';

export const transactionService = {
  async list(accountId, limit = 50, offset = 0) {
    limit = Math.min(Math.max(limit, 1), 200);
    return transactionRepo.list(accountId || null, limit, offset);
  },
};
