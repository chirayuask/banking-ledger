import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { transferSchema, depositSchema, withdrawalSchema } from '../middleware/schemas/transfer.js';
import { transferController } from '../controllers/transfer.controller.js';

const router = Router();

router.post(
  '/transfers',
  validate(transferSchema, { operation: 'TRANSFER', sourceField: 'source_account_id', destField: 'dest_account_id' }),
  transferController.transfer,
);
router.post(
  '/deposits',
  validate(depositSchema, { operation: 'DEPOSIT', destField: 'account_id' }),
  transferController.deposit,
);
router.post(
  '/withdrawals',
  validate(withdrawalSchema, { operation: 'WITHDRAWAL', sourceField: 'account_id' }),
  transferController.withdraw,
);

export default router;
