import { ObjectId } from "mongodb";
import { fromNodeHeaders } from "better-auth/node";
import { getAuth, isGoogleOAuthConfigured } from "../config/auth.js";
import { collections } from "../config/db.js";
import { env } from "../config/env.js";
import { clearBetterAuthCookies, clearSessionCookie, setSessionCookie } from "../lib/cookies.js";
import { isJwtConfigured, signSessionToken, tokenCookieMaxAge } from "../lib/jwt.js";
import { serializeUser } from "../lib/users.js";

function findUserDocument(id, fallbackEmail) {
  const queries = [];

  if (ObjectId.isValid(id)) {
    queries.push({ _id: new ObjectId(id) });
  }
  if (fallbackEmail) {
    queries.push({ email: fallbackEmail.trim().toLowerCase() });
  }

  return (async () => {
    for (const query of queries) {
      const doc = await collections.users().findOne(query);
      if (doc) return doc;
    }
    return null;
  })();
}

/**
 * POST /api/auth/token
 *
 * The only way to obtain an Express API JWT. It verifies the Better Auth
 * session server-side, then signs a fresh token whose subject is the database
 * user id. A browser-supplied user id is never accepted.
 */
export async function issueApiToken(req, res) {
  if (!isJwtConfigured()) {
    return res.status(503).json({
      success: false,
      code: "JWT_NOT_CONFIGURED",
      message:
        "JWT_SECRET is missing, a placeholder, or shorter than 32 characters. Add a real secret to studiospace-server/.env, restart the server, then sign in again.",
    });
  }

  const auth = getAuth();
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session?.user) {
    return res.status(401).json({
      success: false,
      code: "NO_SESSION",
      message: "Sign in with Better Auth before requesting an API token.",
    });
  }

  const userDocument = await findUserDocument(
    session.user.id,
    session.user.email,
  );

  if (!userDocument) {
    return res.status(401).json({
      success: false,
      code: "USER_NOT_FOUND",
      message: "The authenticated account could not be found.",
    });
  }

  const user = serializeUser(userDocument);
  const token = signSessionToken(user);

  setSessionCookie(res, token, tokenCookieMaxAge(token));

  return res.status(200).json({
    success: true,
    data: { user },
  });
}

/**
 * GET /api/auth/me
 * Requires the Express JWT (not just a Better Auth session).
 */
export function getCurrentUser(req, res) {
  return res.status(200).json({
    success: true,
    data: { user: req.auth.user },
  });
}

/**
 * POST /api/auth/logout
 * Revokes the Better Auth session and clears both cookie families.
 */
export async function logout(req, res) {
  const auth = getAuth();

  try {
    await auth.api.signOut({
      headers: fromNodeHeaders(req.headers),
    });
  } catch {
    // The Better Auth session may already be gone; clearing cookies is still
    // the correct outcome.
  }

  clearBetterAuthCookies(res);
  clearSessionCookie(res);

  return res.status(200).json({
    success: true,
    message: "Signed out successfully.",
  });
}

/**
 * GET /api/auth/providers
 * Lets the client show Google as available only when it is configured.
 */
export function getAuthProviders(_req, res) {
  const google = isGoogleOAuthConfigured();

  return res.status(200).json({
    success: true,
    data: {
      google,
      googleCallbackUrl: google
        ? `${env.BETTER_AUTH_URL}/api/auth/callback/google`
        : null,
    },
  });
}
