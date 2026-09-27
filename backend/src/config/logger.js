/**
 * Logger Configuration
 * Centralized, dependency-free logging for the application.
 */

const config = require('./environment');

class Logger {
  constructor() {
    this.isDevelopment = !config.isProduction;
  }

  format(level, message) {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
  }

  error(message) {
    console.error(this.format('error', message));
  }

  warn(message) {
    console.warn(this.format('warn', message));
  }

  info(message) {
    console.log(this.format('info', message));
  }

  debug(message) {
    if (this.isDevelopment) {
      console.log(this.format('debug', message));
    }
  }

  request(req, statusCode, duration) {
    this.info(`${req.method} ${req.originalUrl} ${statusCode} - ${duration}ms`);
  }
}

module.exports = new Logger();
