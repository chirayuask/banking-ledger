import { Router } from 'express';
import accountRoutes from './account.routes.js';
import transferRoutes from './transfer.routes.js';
import reversalRoutes from './reversal.routes.js';
import transactionRoutes from './transaction.routes.js';
import auditRoutes from './audit.routes.js';

const router = Router();

router.use('/accounts', accountRoutes);
router.use('/', transferRoutes);              // /transfers, /deposits, /withdrawals
router.use('/reversals', reversalRoutes);
router.use('/transactions', transactionRoutes);
router.use('/audit-logs', auditRoutes);

export default router;
