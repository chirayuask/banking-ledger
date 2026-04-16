import { accountRepo } from '../repository/account.js';

export const accountService = {
  async create(name, initialBalance) {
    return accountRepo.create(name, initialBalance);
  },

  async getById(id) {
    const account = await accountRepo.getById(id);
    if (!account) throw { status: 404, code: 'notFound', message: 'Account not found' };
    return account;
  },

  async list() {
    return accountRepo.list();
  },
};
