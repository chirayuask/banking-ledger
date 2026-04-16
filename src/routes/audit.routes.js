import { Router } from 'express';
import { auditController } from '../controllers/audit.controller.js';

const router = Router();

router.get('/', auditController.list);

export default router;
