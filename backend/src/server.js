/**
 * Main Server Entry Point
 * Express application setup and configuration
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const config = require('./config/environment');
const logger = require('./config/logger');
const apiRoutes = require('./routes');
const {
  errorHandler,
  notFoundHandler,
} = require('./middleware/errorHandler');

// Initialize Express app
const app = express();

/**
 * Security Middleware
 */

// Helmet for security headers
if (config.isProduction) {
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  }));
}

/**
 * CORS Configuration
 */
app.use(cors({
  origin: config.security.corsOrigin,
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-user-token', 'x-admin-token'],
}));

/**
 * Body Parsing Middleware
 */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

/**
 * Rate Limiting
 */
if (config.isProduction) {
  const limiter = rateLimit({
    windowMs: config.security.rateLimitWindow * 60 * 1000,
    max: config.security.rateLimitMaxRequests,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api/', limiter);

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts, please try again later.',
  });
  app.use('/api/auth/login', authLimiter);
  app.use('/api/auth/admin-login', authLimiter);
}

/**
 * Request Logging Middleware
 */
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
    });
  });

  next();
});

/**
 * Static Files
 */
app.use(express.static('../frontend'));

/**
 * Health Check Routes
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

/**
 * API Routes
 */
app.use('/api', apiRoutes);

/**
 * 404 Handler
 */
app.use(notFoundHandler);

/**
 * Global Error Handler
 */
app.use(errorHandler);

/**
 * Start Server
 */
const PORT = config.port;
const HOST = config.host;

app.listen(PORT, HOST, () => {
  logger.info(`Server started successfully`, {
    port: PORT,
    host: HOST,
    environment: config.nodeEnv,
  });
});

module.exports = app;
