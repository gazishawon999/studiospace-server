import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Express API access tokens.
 *
 * These are intentionally separate from Better Auth sessions. The browser can
 * only obtain one through POST /api/auth/token, which verifies a Better Auth
 * session server-side. The JWT is stored in an HTTPOnly cookie, so client
 * JavaScript never sees the token or the signing secret.
 */

export const JWT_ALGORITHM = "HS256";

const PLACEHOLDER_PATTERN =
  /^(replace[_-]|your[_-]|changeme)|placeholder|xxxxx|<[^<>]+>/i;

export function isJwtConfigured() {
  const secret = (env.JWT_SECRET ?? "").trim();
  return (
    secret.length >= 32 &&
    !PLACEHOLDER_PATTERN.test(secret) &&
    Boolean(env.JWT_ISSUER) &&
    Boolean(env.JWT_AUDIENCE)
  );
}

/**
 * @param {{ id: string, email: string, name: string, image?: string | null }} user
 * @returns {string}
 */
export function signSessionToken(user) {
  if (!isJwtConfigured()) {
    const error = new Error(
      "JWT_SECRET is missing, a placeholder, or shorter than 32 characters. Add a real secret to studiospace-server/.env before signing users in.",
    );
    error.statusCode = 503;
    error.code = "JWT_NOT_CONFIGURED";
    throw error;
  }

  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      image: user.image ?? null,
    },
    env.JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: env.JWT_EXPIRES_IN,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    },
  );
}

/**
 * Verifies signature, algorithm, expiry, issuer, and audience. Throws a
 * jsonwebtoken error when any check fails.
 * @param {string} token
 */
export function verifySessionToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
}

/**
 * Returns the remaining lifetime of a token in milliseconds, used for the
 * cookie's maxAge so the cookie and the JWT expire together.
 * @param {string} token
 */
export function tokenCookieMaxAge(token) {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded !== "object" || !decoded.exp) {
    return undefined;
  }

  return Math.max(0, decoded.exp * 1000 - Date.now());
}
