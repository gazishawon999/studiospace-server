import { ObjectId } from "mongodb";
import { collections } from "../config/db.js";
import { env } from "../config/env.js";
import { clearSessionCookie } from "../lib/cookies.js";
import { verifySessionToken } from "../lib/jwt.js";
import { serializeUser } from "../lib/users.js";

/**
 * Loads the authenticated user from MongoDB using the verified JWT subject.
 * The browser never supplies this id — it comes from the signed token.
 * @param {string} id
 */
async function findUserById(id) {
  if (!ObjectId.isValid(id)) return null;

  const doc = await collections.users().findOne({ _id: new ObjectId(id) });
  return doc ?? null;
}

function unauthorized(res, message) {
  return res.status(401).json({
    success: false,
    code: "UNAUTHORIZED",
    message,
  });
}

/**
 * Optional auth: attaches req.auth when a valid token is present, but never
 * rejects the request. Useful for read endpoints that personalize responses.
 */
export async function attachOptionalAuth(req, _res, next) {
  try {
    const token = req.cookies?.[env.AUTH_COOKIE_NAME];
    if (!token) return next();

    const payload = verifySessionToken(token);
    if (!payload?.sub || typeof payload.sub !== "string") return next();

    const user = await findUserById(payload.sub);
    if (user) {
      req.auth = { user: serializeUser(user), token: payload };
    }
  } catch {
    // Invalid/expired tokens are simply treated as anonymous here.
  }

  return next();
}

/**
 * Required auth: rejects unauthenticated or invalid requests with 401.
 * Verifies the JWT signature, algorithm, expiry, issuer, audience, and that the
 * subject still exists in MongoDB.
 */
export async function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.[env.AUTH_COOKIE_NAME];

    if (!token) {
      return unauthorized(
        res,
        "Authentication required. Sign in to continue.",
      );
    }

    let payload;
    try {
      payload = verifySessionToken(token);
    } catch (error) {
      clearSessionCookie(res);
      if (error?.name === "TokenExpiredError") {
        return unauthorized(res, "Your session has expired. Sign in again.");
      }
      return unauthorized(res, "Invalid authentication token.");
    }

    if (!payload?.sub || typeof payload.sub !== "string") {
      clearSessionCookie(res);
      return unauthorized(res, "Invalid authentication token.");
    }

    const user = await findUserById(payload.sub);
    if (!user) {
      clearSessionCookie(res);
      return unauthorized(res, "This account no longer exists.");
    }

    req.auth = { user: serializeUser(user), token: payload };
    return next();
  } catch (error) {
    return next(error);
  }
}
