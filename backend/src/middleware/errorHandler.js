/**
 * Global Error Handler Middleware
 * Centralized error handling for the application
 */

const logger = require('../config/logger');
const config = require('../config/environment');

/**
 * Custom API Error class
 */
class ApiError extends Error {
  constructor(status, message, details = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/**
 * Error Handler Middleware
 * Must be registered last in app.use()
 */
const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Log error
  logger.error(`[${status}] ${message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: config.isDevelopment ? req.body : undefined,
  });

  // Send error response
  res.status(status).json({
    success: false,
    error: {
      status,
      message,
      ...(config.isDevelopment && { stack: err.stack }),
      ...(config.isDevelopment && { details: err.details }),
    },
  });
};

/**
 * 404 Handler
 */
const notFoundHandler = (req, res) => {
  logger.warn('Route not found', {
    path: req.path,
    method: req.method,
  });

  res.status(404).json({
    success: false,
    error: {
      status: 404,
      message: 'Route not found',
      path: req.path,
    },
  });
};

/**
 * Validation Error Handler
 */
const validationErrorHandler = (errors) => {
  const formattedErrors = {};

  errors.forEach((error) => {
    const field = error.param;
    formattedErrors[field] = {
      message: error.msg,
      value: error.value,
    };
  });

  throw new ApiError(400, 'Validation failed', formattedErrors);
};

/**
 * Database Error Handler
 */
const handleDatabaseError = (err) => {
  logger.error('Database error:', err);

  if (err.code === 'P0001') {
    throw new ApiError(400, 'Invalid input data');
  }

  if (err.code === 'P0002') {
    throw new ApiError(404, 'Record not found');
  }

  throw new ApiError(500, 'Database operation failed');
};

/**
 * Async Handler Wrapper
 * Catches errors in async route handlers
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = {
  ApiError,
  errorHandler,
  notFoundHandler,
  validationErrorHandler,
  handleDatabaseError,
  asyncHandler,
};
