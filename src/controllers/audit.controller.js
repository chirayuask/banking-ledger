import { auditService } from '../service/audit.js';

export const auditController = {
  async list(req, res, next) {
    try {
      const { account_id, limit = '50', offset = '0' } = req.query;

      const logs = await auditService.list(
        account_id,
        parseInt(limit, 10),
        parseInt(offset, 10),
      );

      res.json({ status: 'success', data: logs });
    } catch (err) {
      next(err);
    }
  },
};
