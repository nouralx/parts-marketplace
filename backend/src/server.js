const path = require('path');
const express = require('express');
const cors = require('cors');
const config = require('./config/environment');
const logger = require('./config/logger');
const apiRoutes = require('./routes');
const smsRoutes = require('./routes/sms.routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors({ origin: config.security.corsOrigin }));
app.use(express.json());

// Serve the static frontend (same behavior as the original single-file app).
app.use(express.static(path.join(__dirname, '../../frontend')));

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/welcome.html'));
});

app.use('/api', apiRoutes);
app.use('/sms', smsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

app.listen(config.port, () => {
  logger.info(`Server running on port ${config.port}`);
});

module.exports = app;
