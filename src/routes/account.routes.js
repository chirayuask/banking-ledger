import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { createAccountSchema } from '../middleware/schemas/account.js';
import { accountController } from '../controllers/account.controller.js';

const router = Router();

router.post('/', validate(createAccountSchema), accountController.create);
router.get('/', accountController.list);
router.get('/:id', accountController.getById);

export default router;
