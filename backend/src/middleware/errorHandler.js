/**
 * Centralized Global Error Handler Middleware
 */
function errorHandler(err, req, res, next) {
  console.error('[GLOBAL ERROR HANDLER]', err.stack || err.message);

  const statusCode = err.statusCode || 500;
  const response = {
    error: {
      message: err.message || 'Internal Server Error',
      status: statusCode,
      timestamp: new Date().toISOString()
    }
  };

  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
