import { ObjectId } from "mongodb";
import { AppError } from "./errorHandler.js";

/**
 * Validates that required fields are present and non-empty in req.body.
 * @param {string[]} requiredFields
 */
export function requireFields(requiredFields) {
  return (req, _res, next) => {
    const missing = [];

    for (const field of requiredFields) {
      const value = req.body?.[field];
      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "")
      ) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return next(
        new AppError(
          `Validation failed. Missing required fields: ${missing.join(", ")}`,
          400,
          missing.map((f) => `${f} is required`),
        ),
      );
    }

    next();
  };
}

/**
 * Validates that a route parameter (e.g., :id) is a valid 24-hex MongoDB ObjectId.
 * @param {string} [paramName="id"]
 */
export function validateObjectId(paramName = "id") {
  return (req, _res, next) => {
    const value = req.params[paramName];
    if (!value || !ObjectId.isValid(value)) {
      return next(
        new AppError(
          `Invalid MongoDB ID provided for parameter "${paramName}".`,
          400,
        ),
      );
    }
    next();
  };
}
