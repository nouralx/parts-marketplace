const config = require('../config/environment');

// The Android SMS bridge authenticates with a static shared secret header,
// not a user/admin session token.
function checkGatewaySecret(req, res, next) {
  // Fail closed: if the secret isn't configured, deny everyone rather than
  // matching "undefined === undefined" and letting unauthenticated requests through.
  if (!config.smsGateway.secret || req.headers['x-gateway-secret'] !== config.smsGateway.secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { checkGatewaySecret };
