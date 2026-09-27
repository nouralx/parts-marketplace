/**
 * Database & Supabase clients
 * Single shared pg Pool + Supabase admin client used across the whole backend.
 */

const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');
const config = require('./environment');
const logger = require('./logger');

const poolConfig = {
  connectionString: config.database.url,
  ssl: { rejectUnauthorized: false },
};

// If the DB is only reachable through a SOCKS tunnel (e.g. Tailscale to a
// home server), set PROXY_URL and pg will connect through it via a custom
// stream. Left disabled by default — most deployments connect directly.
if (config.proxy.url) {
  try {
    const { SocksProxyAgent } = require('socks-proxy-agent');
    poolConfig.stream = () => {
      const agent = new SocksProxyAgent(config.proxy.url);
      return agent;
    };
    logger.info('Database configured to connect through SOCKS proxy');
  } catch (err) {
    logger.warn('PROXY_URL set but socks-proxy-agent is not installed; connecting directly');
  }
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error: ' + err.message);
});

const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey);

module.exports = { pool, supabaseAdmin };
