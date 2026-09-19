import env from "../config/env.js";

export const errorMiddleware = (err, req, res, next) => {

  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Sequelize validation error
  if (err.name === "SequelizeValidationError") {
    statusCode = 400;
    message = err.errors.map(e => e.message).join(", ");
  }

  // Sequelize unique constraint
  if (err.name === "SequelizeUniqueConstraintError") {
    statusCode = 409;
    message = err.errors.map(e => e.message).join(", ");
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expired";
  }

  const response = {
    message,
    success: false,
    source: "Global"
  };

  // show stack only in development
  if (env.APP_ENVIRONMENT !== "production") {
    response.stack = err.stack;
  }

  res.status(statusCode).json(response);
};