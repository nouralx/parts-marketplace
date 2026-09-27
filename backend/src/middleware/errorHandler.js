/**
 * Global error handling.
 * Response shape kept identical to the original API: { success: false, error: string }
 * so the existing frontend needs no changes.
 */

const logger = require('../config/logger');

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Registered last in server.js — catches anything a controller didn't
// already handle itself (most controllers keep their own try/catch to
// preserve the exact original error messages).
const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  logger.error(`[${status}] ${req.method} ${req.path} — ${err.message}`);
  res.status(status).json({ success: false, error: err.message || 'خطأ في الخادم' });
};

const notFoundHandler = (req, res) => {
  res.status(404).json({ success: false, error: 'المسار غير موجود' });
};

// Wraps an async controller so a thrown/rejected error reaches errorHandler
// instead of crashing the process.
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { ApiError, errorHandler, notFoundHandler, asyncHandler };
