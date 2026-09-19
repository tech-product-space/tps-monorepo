const psEnv = require("@ps/env/tps");
function errorHandler(err, req, res, next) {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

  console.log("====Internal Error=====")
  console.error(err);
  
  res.status(statusCode).json({
    message: err.message,
    stack: psEnv.NODE_ENV === 'production' ? null : err.stack,
  });
}

module.exports = errorHandler;
