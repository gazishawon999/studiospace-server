import { randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";

/**
 * CSRF protection for Express mutations.
 *
 * The JWT cookie is HTTPOnly but browsers still attach it to cross-site
 * requests. Every unsafe request must therefore prove it came from our own UI:
 *   1. Origin/Referer must match CLIENT_URL when present.
 *   2. A double-submit token must match both the readable cookie and the
 *      X-CSRF-Token header.
 *
 * Better Auth's own endpoints keep their separate built-in origin checks.
 */

export const CSRF_COOKIE_NAME = "studiospace_csrf";
export const CSRF_HEADER_NAME = "X-CSRF-Token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function csrfCookieOptions() {
  return {
    httpOnly: false, // Must be readable so the client can echo it in a header.
    secure: env.AUTH_COOKIE_SECURE,
    sameSite: env.AUTH_COOKIE_SAME_SITE,
    path: "/",
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {}),
  };
}

function tokensMatch(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;

  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Issues a fresh double-submit CSRF token and stores it in a readable cookie.
 */
export function issueCsrfToken(_req, res) {
  const token = randomBytes(32).toString("base64url");

  res.cookie(CSRF_COOKIE_NAME, token, {
    ...csrfCookieOptions(),
    maxAge: CSRF_MAX_AGE_MS,
  });

  return res.status(200).json({
    success: true,
    data: {
      csrfToken: token,
      headerName: CSRF_HEADER_NAME,
      cookieName: CSRF_COOKIE_NAME,
    },
  });
}

/**
 * Rejects unsafe requests whose Origin is not an allowed client origin.
 * Requests without an Origin header (server-to-server) still have to pass the
 * double-submit token check.
 */
export function verifyRequestOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get("origin");
  if (origin && !env.CLIENT_ORIGINS.includes(origin)) {
    console.warn("[CSRF] Rejected unsafe request: origin not allowed", {
      path: req.originalUrl,
      method: req.method,
      hasOrigin: Boolean(origin),
      hasReferer: Boolean(req.get("referer")),
    });
    return res.status(403).json({
      success: false,
      code: "ORIGIN_NOT_ALLOWED",
      message: "This request origin is not allowed.",
    });
  }

  return next();
}

/**
 * Double-submit cookie check. Apply after verifyRequestOrigin to every
 * cookie-authenticated mutation.
 */
export function requireCsrfToken(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.get(CSRF_HEADER_NAME);

  if (!tokensMatch(cookieToken, headerToken)) {
    console.warn("[CSRF] Rejected unsafe request: CSRF token validation failed", {
      path: req.originalUrl,
      method: req.method,
      cookiePresent: typeof cookieToken === "string" && cookieToken.length > 0,
      headerPresent: typeof headerToken === "string" && headerToken.length > 0,
      cookiesParsed: Boolean(req.cookies && typeof req.cookies === "object"),
    });
    return res.status(403).json({
      success: false,
      code: "CSRF_TOKEN_INVALID",
      message:
        "Your security token is missing or expired. Refresh the page and try again.",
    });
  }

  return next();
}

/** Convenience middleware chain for JWT-protected mutations. */
export const protectMutation = [verifyRequestOrigin, requireCsrfToken];
