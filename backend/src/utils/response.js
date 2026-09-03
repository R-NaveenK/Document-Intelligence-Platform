/**
 * Standardized API Response Formatter
 */

function successResponse(res, data = {}, statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    data: data,
    error: null
  });
}

function errorResponse(res, code = 'INTERNAL_ERROR', message = 'An unexpected error occurred', statusCode = 400) {
  return res.status(statusCode).json({
    success: false,
    data: null,
    error: {
      code: code,
      message: message
    }
  });
}

module.exports = {
  successResponse,
  errorResponse
};
