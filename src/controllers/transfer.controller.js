import { transferService } from '../service/transfer.js';
import { cache } from '../pkg/redis/cache.js';

export const transferController = {
  async transfer(req, res, next) {
    try {
      const { source_account_id, dest_account_id, amount, idempotency_key } = req.body;

      const txn = await transferService.transfer({
        sourceAccountId: source_account_id,
        destAccountId: dest_account_id,
        amount,
        idempotencyKey: idempotency_key,
      });

      await cache.invalidateForTransfer(source_account_id, dest_account_id);

      res.status(201).json({ status: 'success', data: txn });
    } catch (err) {
      next(err);
    }
  },

  async deposit(req, res, next) {
    try {
      const { account_id, amount, idempotency_key } = req.body;

      const txn = await transferService.deposit({
        accountId: account_id,
        amount,
        idempotencyKey: idempotency_key,
      });

      await cache.invalidateForTransfer(null, account_id);

      res.status(201).json({ status: 'success', data: txn });
    } catch (err) {
      next(err);
    }
  },

  async withdraw(req, res, next) {
    try {
      const { account_id, amount, idempotency_key } = req.body;

      const txn = await transferService.withdraw({
        accountId: account_id,
        amount,
        idempotencyKey: idempotency_key,
      });

      await cache.invalidateForTransfer(account_id, null);

      res.status(201).json({ status: 'success', data: txn });
    } catch (err) {
      next(err);
    }
  },
};
