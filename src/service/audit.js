import { auditRepo } from '../repository/audit.js';

export const auditService = {
  async list(accountId, limit = 50, offset = 0) {
    limit = Math.min(Math.max(limit, 1), 200);
    return auditRepo.list(accountId || null, limit, offset);
  },
};
