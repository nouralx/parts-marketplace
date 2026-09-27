/**
 * OTP service — rate limiting (in-memory, per-IP) + code generation.
 * Ported from the original index.js otp block.
 */

const config = require('../config/environment');

const ipRequestLog = new Map();

function isIpRateLimited(ip) {
  const now = Date.now();
  const windowMs = config.otp.ipWindowMinutes * 60 * 1000;
  const maxRequests = config.otp.ipMaxRequests;

  if (!ipRequestLog.has(ip)) {
    ipRequestLog.set(ip, []);
  }

  const timestamps = ipRequestLog.get(ip).filter((t) => now - t < windowMs);
  timestamps.push(now);
  ipRequestLog.set(ip, timestamps);

  return timestamps.length > maxRequests;
}

// Periodic cleanup so the map doesn't grow forever.
setInterval(() => {
  const now = Date.now();
  const windowMs = config.otp.ipWindowMinutes * 60 * 1000;
  for (const [ip, timestamps] of ipRequestLog.entries()) {
    const filtered = timestamps.filter((t) => now - t < windowMs);
    if (filtered.length === 0) {
      ipRequestLog.delete(ip);
    } else {
      ipRequestLog.set(ip, filtered);
    }
  }
}, 60 * 60 * 1000);

function generateOtpCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
}

module.exports = { isIpRateLimited, generateOtpCode, getClientIp };
