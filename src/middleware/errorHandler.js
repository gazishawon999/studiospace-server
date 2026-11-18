import { env } from "../config/env.js";

/**
 * Custom operational error class with HTTP status code.
 */
export class AppError extends Error {
  /**
   * @param {string} message
   * @param {number} statusCode
   * @param {Array<string>} [errors]
   * @param {string} [code]
   */
  constructor(message, statusCode = 500, errors = [], code = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 handler for undefined API endpoints.
 */
export function notFoundHandler(req, res, next) {
  const error = new AppError(
    `API Endpoint not found: ${req.method} ${req.originalUrl}`,
    404,
  );
  next(error);
}

/**
 * Centralized Express error-handling middleware.
 */
export function globalErrorHandler(err, req, res, _next) {
  const statusCode = err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  if (statusCode >= 500) {
    console.error(`[SERVER ERROR] ${req.method} ${req.originalUrl}:`, err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    code: err.code || undefined,
    errors: err.errors?.length ? err.errors : undefined,
    stack: env.NODE_ENV === "development" ? err.stack : undefined,
  });
}
