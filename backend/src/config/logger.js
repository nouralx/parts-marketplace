/**
 * Logger Configuration
 * Centralized logging for the application
 */

const config = require('./environment');

/**
 * Simple Logger Implementation
 * In production, use Winston or Bunyan
 */
class Logger {
  constructor() {
    this.level = config.logging.level;
    this.dir = config.logging.dir;
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3,
    };
  }

  /**
   * Format log message
   */
  format(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logObject = {
      timestamp,
      level,
      message,
      ...data,
      env: config.nodeEnv,
    };

    if (config.isDevelopment) {
      return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    }

    return JSON.stringify(logObject);
  }

  /**
   * Log error message
   */
  error(message, error = {}) {
    console.error(
      this.format('error', message, {
        stack: error.stack,
        code: error.code,
      })
    );
  }

  /**
   * Log warning message
   */
  warn(message, data = {}) {
    console.warn(this.format('warn', message, data));
  }

  /**
   * Log info message
   */
  info(message, data = {}) {
    if (this.levels[this.level] >= this.levels['info']) {
      console.log(this.format('info', message, data));
    }
  }

  /**
   * Log debug message
   */
  debug(message, data = {}) {
    if (this.levels[this.level] >= this.levels['debug']) {
      console.log(this.format('debug', message, data));
    }
  }

  /**
   * Log request
   */
  request(req, duration) {
    const data = {
      method: req.method,
      path: req.path,
      status: req.res?.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    };

    this.info(`API Request: ${req.method} ${req.path}`, data);
  }

  /**
   * Log database query
   */
  query(query, duration) {
    this.debug(`Database Query (${duration}ms)`, { query: query.substring(0, 100) });
  }
}

module.exports = new Logger();
