import { env } from "../config/env.js";

/**
 * Cookie helpers for the Express-issued JWT.
 *
 * Better Auth manages its own cookies (prefix `studiospace.`). These helpers
 * only touch AUTH_COOKIE_NAME, which belongs to the Express API layer.
 */

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: env.AUTH_COOKIE_SECURE,
    sameSite: env.AUTH_COOKIE_SAME_SITE,
    path: "/",
    ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {}),
  };
}

export function setSessionCookie(res, token, maxAge) {
  const options = sessionCookieOptions();
  if (typeof maxAge === "number") {
    options.maxAge = maxAge;
  }
  res.cookie(env.AUTH_COOKIE_NAME, token, options);
}

export function clearSessionCookie(res) {
  res.clearCookie(env.AUTH_COOKIE_NAME, sessionCookieOptions());
}

export const BETTER_AUTH_COOKIE_NAMES = [
  "studiospace.session_token",
  "studiospace.session_data",
  "studiospace.account_data",
  "studiospace.dont_remember",
];

export function clearBetterAuthCookies(res) {
  for (const name of BETTER_AUTH_COOKIE_NAMES) {
    res.clearCookie(name, sessionCookieOptions());
  }
}
