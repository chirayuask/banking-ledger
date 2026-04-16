const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Express middleware factory — validates req.body against a schema.
 *
 * Usage:
 *   validate({ name: { required: true, type: 'string' }, amount: { required: true, type: 'number', gt: 0 } })
 */
export const validate = (schema) => (req, res, next) => {
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
    return res.status(400).json({
      status: 'error',
      error: 'validationError',
      message: errors.join('; '),
    });
  }

  next();
};
