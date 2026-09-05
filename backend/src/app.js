const express = require('express');
const cors = require('cors');

const requestLogger = require('./middleware/logger');
const authMiddleware = require('./middleware/auth');
const tenantMiddleware = require('./middleware/tenant');
const fileUploadValidator = require('./middleware/upload');
const errorHandler = require('./middleware/errorHandler');

const healthRoutes = require('./routes/health');
const pipelineRoutes = require('./routes/pipeline');
const profileRoutes = require('./routes/profiles');
const documentRoutes = require('./routes/documents');
const reviewRoutes = require('./routes/reviews');
const recordRoutes = require('./routes/records');
const chatRoutes = require('./routes/chat');
const exportRoutes = require('./routes/exports');
const reportRoutes = require('./routes/reports');
const reprocessingRoutes = require('./routes/reprocessing');
const systemRoutes = require('./routes/system');

const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Serve frontend static application
app.use(express.static(path.join(__dirname, '..', '..', 'frontend')));

// Global health check root endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'UP', service: 'express-backend-gateway', timestamp: new Date().toISOString() });
});

// Security & isolation middleware chain for /api/v1
app.use('/api/v1', authMiddleware, tenantMiddleware, fileUploadValidator);

// Route handlers under /api/v1/
app.use('/api/v1', healthRoutes);
app.use('/api/v1/pipeline', pipelineRoutes);
app.use('/api/v1', profileRoutes);
app.use('/api/v1', documentRoutes);
app.use('/api/v1', reviewRoutes);
app.use('/api/v1', recordRoutes);
app.use('/api/v1', chatRoutes);
app.use('/api/v1', exportRoutes);
app.use('/api/v1', reportRoutes);
app.use('/api/v1', reprocessingRoutes);
app.use('/api/v1', systemRoutes);

// Centralized error handling
app.use(errorHandler);

module.exports = app;
