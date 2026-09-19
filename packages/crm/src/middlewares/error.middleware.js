const psEnv = require("@ps/env/crm");
const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  res.status(statusCode).json({
    success: false,
    message: err.message || 'Internal Server Error',
    stack: psEnv.NODE_ENV === 'production' ? null : err.stack,
  });
};

module.exports = errorHandler;