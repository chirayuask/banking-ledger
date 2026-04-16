import logger from '../config/logger.js';

export const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const code = err.code || 'internalServerError';
  const message = err.message || 'Something went wrong';

  if (status >= 500) {
    logger.error('Server error', { error: message, path: req.path, method: req.method });
  }

  res.status(status).json({
    status: 'error',
    error: code,
    message,
  });
};
