/**
 * Environment Configuration
 * Centralized environment variables management
 */

require('dotenv').config();

const config = {
  // Server Configuration
  port: process.env.PORT || 3000,
  host: process.env.HOST || 'localhost',
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',

  // Database Configuration
  database: {
    url: process.env.DATABASE_URL,
    name: process.env.DB_NAME || 'parts_marketplace',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
  },

  // Supabase Configuration
  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
    bucket: process.env.SUPABASE_BUCKET || 'parts-images',
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your-super-secret-key-change-this',
    expiresIn: process.env.JWT_EXPIRE || '7d',
    refreshSecret: process.env.REFRESH_TOKEN_SECRET || 'refresh-secret',
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRE || '30d',
  },

  // Admin Configuration
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@example.com',
    password: process.env.ADMIN_PASSWORD || 'admin123',
  },

  // Email Configuration
  email: {
    smtpHost: process.env.SMTP_HOST,
    smtpPort: process.env.SMTP_PORT || 587,
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
    from: process.env.SMTP_FROM || 'noreply@parts-marketplace.com',
  },

  // Security Configuration
  security: {
    rateLimitWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '15'),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
    corsOrigin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs',
  },

  // Features Configuration
  features: {
    emailVerification: process.env.ENABLE_EMAIL_VERIFICATION === 'true',
    smsNotifications: process.env.ENABLE_SMS_NOTIFICATIONS === 'true',
    analytics: process.env.ENABLE_ANALYTICS === 'true',
  },

  // API Documentation
  apiDocs: {
    enabled: process.env.API_DOCS_ENABLED === 'true',
    url: process.env.API_DOCS_URL || '/api-docs',
  },
};

// Validate required environment variables
const requiredEnvVars = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'JWT_SECRET',
];

if (config.isProduction) {
  requiredEnvVars.forEach((envVar) => {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  });
}

module.exports = config;
