import { auditRepo } from '../repository/audit.js';
import logger from '../config/logger.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (v) => typeof v === 'string' && UUID_REGEX.test(v);

/**
 * Best-effort audit write for a validation failure on a balance-changing endpoint.
 * Reads account/amount hints from the raw body — values may be invalid or missing,
 * in which case we store null. Failures never break the response flow.
 */
const auditValidationFailure = async (body, auditCtx, reason) => {
  try {
    const operation = auditCtx.operation;
    const srcField = auditCtx.sourceField;
    const dstField = auditCtx.destField;
    const amount = typeof body?.amount === 'number' ? body.amount : 0;
    await auditRepo.create({
      operation,
      sourceAccountId: srcField && isUuid(body?.[srcField]) ? body[srcField] : null,
      destAccountId: dstField && isUuid(body?.[dstField]) ? body[dstField] : null,
      amount,
      outcome: 'FAILURE',
      failureReason: reason,
      transactionId: null,
    });
  } catch (err) {
    logger.error('Failed to write validation-failure audit log', { error: err.message });
  }
};

/**
 * Express middleware factory — validates req.body against a schema.
 *
 * Usage:
 *   validate(schema)                                      // plain validation
 *   validate(schema, { operation, sourceField, destField }) // also audit on failure
 */
export const validate = (schema, auditCtx = null) => async (req, res, next) => {
  const errors = [];

  for (const [field, rules] of Object.entries(schema)) {
    const value = req.body[field];

    if (rules.required && (value === undefined || value === null || value === '')) {
      errors.push(`${field} is required`);
      continue;
    }

    if (value === undefined || value === null) continue;

    if (rules.type === 'string' && typeof value !== 'string') {
      errors.push(`${field} must be a string`);
    }

    if (rules.type === 'number' && typeof value !== 'number') {
      errors.push(`${field} must be a number`);
    }

    if (rules.uuid && !UUID_REGEX.test(value)) {
      errors.push(`${field} must be a valid UUID`);
    }

    if (rules.gt !== undefined && value <= rules.gt) {
      errors.push(`${field} must be greater than ${rules.gt}`);
    }

    if (rules.gte !== undefined && value < rules.gte) {
      errors.push(`${field} must be greater than or equal to ${rules.gte}`);
    }
  }

  if (errors.length > 0) {
    const message = errors.join('; ');
    if (auditCtx) {
      await auditValidationFailure(req.body, auditCtx, `VALIDATION: ${message}`.slice(0, 255));
    }
    return res.status(400).json({
      status: 'error',
      error: 'validationError',
      message,
    });
  }

  next();
};
