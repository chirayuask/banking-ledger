import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { reversalSchema } from '../middleware/schemas/reversal.js';
import { reversalController } from '../controllers/reversal.controller.js';

const router = Router();

router.post('/', validate(reversalSchema, { operation: 'REVERSAL' }), reversalController.reverse);

export default router;
