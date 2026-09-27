/**
 * Environment Configuration
 * Centralized environment variables management
 */

require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  database: {
    url: process.env.DATABASE_URL,
  },

  supabase: {
    url: process.env.SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket: process.env.SUPABASE_DOCUMENTS_BUCKET || 'supplier-documents',
  },

  smsGateway: {
    secret: process.env.SMS_GATEWAY_SECRET,
  },

  // Tailscale/SOCKS proxy is optional (used only when DB is reached through a
  // home-server tunnel). Leave PROXY_URL unset to connect directly.
  proxy: {
    url: process.env.PROXY_URL || null,
  },

  security: {
    corsOrigin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : '*',
  },

  otp: {
    codeExpiryMinutes: 5,
    resendCooldownSeconds: 60,
    maxPerWindow: 3,
    windowHours: 3,
    ipMaxRequests: 3,
    ipWindowMinutes: 15,
  },

  sessions: {
    userExpiryDays: 30,
    adminExpiryHours: 8,
  },
};

const requiredEnvVars = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];

if (config.isProduction) {
  requiredEnvVars.forEach((envVar) => {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  });
}

module.exports = config;
