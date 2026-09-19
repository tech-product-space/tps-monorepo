const psEnv = require("@ps/env/crm");
const notFound = (req, res, next) => {
  // Dev only. A misaddressed webhook is invisible otherwise: the sender shows a
  // 404 and the server shows one access-log line, with nothing saying the path
  // simply never matched a route. Printing the method and URL makes a wrong
  // prefix obvious at a glance — routes are mounted under /api/v1/..., so a
  // path that omits it lands here rather than at its handler.
  if (psEnv.NODE_ENV !== 'production') {
    console.log(`[404] no route for ${req.method} ${req.originalUrl}`);
  }

  const error = new Error(`Route not found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

module.exports = notFound;