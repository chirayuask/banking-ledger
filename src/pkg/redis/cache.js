import { getKey, setKey, delKey } from './client.js';

const TTL = {
  ACCOUNT: 30,         // 30 seconds
  IDEMPOTENCY: 86400,  // 24 hours
};

const PREFIX = {
  ACCOUNT: 'account:',
  ACCOUNTS_LIST: 'accounts:list',
  IDEMPOTENCY: 'idempotency:',
};

export const cache = {
  // ---- Account cache ----

  async getAccount(id) {
    const data = await getKey(`${PREFIX.ACCOUNT}${id}`);
    return data ? JSON.parse(data) : null;
  },

  async setAccount(account) {
    await setKey(`${PREFIX.ACCOUNT}${account.id}`, JSON.stringify(account), TTL.ACCOUNT);
  },

  async invalidateAccount(id) {
    await delKey(`${PREFIX.ACCOUNT}${id}`);
  },

  // ---- Accounts list cache ----

  async getAccountsList() {
    const data = await getKey(PREFIX.ACCOUNTS_LIST);
    return data ? JSON.parse(data) : null;
  },

  async setAccountsList(accounts) {
    await setKey(PREFIX.ACCOUNTS_LIST, JSON.stringify(accounts), TTL.ACCOUNT);
  },

  async invalidateAccountsList() {
    await delKey(PREFIX.ACCOUNTS_LIST);
  },

  // ---- Composite invalidation ----

  async invalidateForTransfer(sourceId, destId) {
    if (sourceId) await this.invalidateAccount(sourceId);
    if (destId) await this.invalidateAccount(destId);
    await this.invalidateAccountsList();
  },

  // ---- Idempotency keys ----

  async checkIdempotencyKey(key) {
    const result = await getKey(`${PREFIX.IDEMPOTENCY}${key}`);
    return result ? { exists: true, data: result } : { exists: false };
  },

  async setIdempotencyKey(key, resultJson) {
    await setKey(`${PREFIX.IDEMPOTENCY}${key}`, resultJson, TTL.IDEMPOTENCY);
  },
};
