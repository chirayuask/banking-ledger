import { transactionService } from '../service/transaction.js';

export const transactionController = {
  async list(req, res, next) {
    try {
      const { account_id, limit = '50', offset = '0' } = req.query;

      const txns = await transactionService.list(
        account_id,
        parseInt(limit, 10),
        parseInt(offset, 10),
      );

      res.json({ status: 'success', data: txns });
    } catch (err) {
      next(err);
    }
  },
};
