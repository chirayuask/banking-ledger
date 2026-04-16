import { accountService } from '../service/account.js';
import { cache } from '../pkg/redis/cache.js';

export const accountController = {
  async create(req, res, next) {
    try {
      const { name, initial_balance } = req.body;
      const account = await accountService.create(name, initial_balance);

      await cache.invalidateAccountsList();

      res.status(201).json({ status: 'success', data: account });
    } catch (err) {
      next(err);
    }
  },

  async list(req, res, next) {
    try {
      const cached = await cache.getAccountsList();
      if (cached) return res.json({ status: 'success', data: cached });

      const accounts = await accountService.list();

      await cache.setAccountsList(accounts);

      res.json({ status: 'success', data: accounts });
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const { id } = req.params;

      const cached = await cache.getAccount(id);
      if (cached) return res.json({ status: 'success', data: cached });

      const account = await accountService.getById(id);

      await cache.setAccount(account);

      res.json({ status: 'success', data: account });
    } catch (err) {
      next(err);
    }
  },
};
