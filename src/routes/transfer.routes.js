import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { transferSchema, depositSchema, withdrawalSchema } from '../middleware/schemas/transfer.js';
import { transferController } from '../controllers/transfer.controller.js';

const router = Router();

router.post('/transfers', validate(transferSchema), transferController.transfer);
router.post('/deposits', validate(depositSchema), transferController.deposit);
router.post('/withdrawals', validate(withdrawalSchema), transferController.withdraw);

export default router;
