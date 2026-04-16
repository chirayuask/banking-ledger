import { reversalService } from '../service/reversal.js';
import { cache } from '../pkg/redis/cache.js';

export const reversalController = {
  async reverse(req, res, next) {
    try {
      const { transaction_id, idempotency_key } = req.body;

      const reversal = await reversalService.reverse({
        transactionId: transaction_id,
        idempotencyKey: idempotency_key,
      });

      await cache.invalidateAccountsList();

      res.status(201).json({ status: 'success', data: reversal });
    } catch (err) {
      next(err);
    }
  },
};
