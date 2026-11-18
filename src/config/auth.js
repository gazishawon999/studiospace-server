import { randomBytes } from "node:crypto";
import { betterAuth } from "better-auth";
import { mongodbAdapter } from "better-auth/adapters/mongodb";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { env } from "./env.js";
import { getDB } from "./db.js";

/**
 * Better Auth configuration.
 *
 * Better Auth owns its own session cookie and is mounted at /api/auth. It is
 * deliberately kept separate from the Express JWT middleware: a Better Auth
 * session only becomes an API credential after this server explicitly issues
 * a signed JWT through POST /api/auth/token.
 */

const PLACEHOLDER_PATTERN =
  /^(replace[_-]|your[_-]|changeme)|placeholder|xxxxx|<[^<>]+>/i;
const MIN_SECRET_LENGTH = 32;

/** @type {ReturnType<typeof betterAuth> | null} */
let authInstance = null;

function isUsableSecret(value) {
  const normalized = (value ?? "").trim();
  return (
    normalized.length >= MIN_SECRET_LENGTH &&
    !PLACEHOLDER_PATTERN.test(normalized)
  );
}

export function isGoogleOAuthConfigured() {
  return (
    isUsableGoogleValue(env.GOOGLE_CLIENT_ID) &&
    isUsableGoogleValue(env.GOOGLE_CLIENT_SECRET)
  );
}

function isUsableGoogleValue(value) {
  const normalized = (value ?? "").trim();
  return Boolean(normalized) && !PLACEHOLDER_PATTERN.test(normalized);
}

/**
 * In development an ephemeral secret keeps the server runnable while the real
 * credential is being collected. Production fails fast in validateEnv() and
 * also here as a defence in depth.
 */
function resolveBetterAuthSecret() {
  if (isUsableSecret(env.BETTER_AUTH_SECRET)) {
    return env.BETTER_AUTH_SECRET.trim();
  }

  if (env.IS_PRODUCTION) {
    throw new Error(
      "BETTER_AUTH_SECRET is required in production. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\" and add it to studiospace-server/.env.",
    );
  }

  const ephemeral = randomBytes(32).toString("base64url");
  console.warn(
    "[Better Auth] BETTER_AUTH_SECRET is missing, a placeholder, or shorter than 32 characters. Using an ephemeral development secret — Better Auth sessions will be invalidated whenever the server restarts. Set BETTER_AUTH_SECRET in studiospace-server/.env.",
  );
  return ephemeral;
}

function assertStrongPassword(password) {
  if (typeof password !== "string" || password.length === 0) {
    throw new APIError("BAD_REQUEST", {
      code: "INVALID_PASSWORD",
      message: "Password is required.",
    });
  }

  if (password.length < 6) {
    throw new APIError("BAD_REQUEST", {
      code: "PASSWORD_TOO_SHORT",
      message: "Password must be at least 6 characters long.",
    });
  }

  if (!/[A-Z]/.test(password)) {
    throw new APIError("BAD_REQUEST", {
      code: "PASSWORD_MISSING_UPPERCASE",
      message: "Password must include at least one uppercase letter.",
    });
  }

  if (!/[a-z]/.test(password)) {
    throw new APIError("BAD_REQUEST", {
      code: "PASSWORD_MISSING_LOWERCASE",
      message: "Password must include at least one lowercase letter.",
    });
  }
}

/**
 * Better Auth runs the before hook for every request to its handler. The hook
 * enforces the assignment's password rules and gives duplicate-email signups a
 * clear field-level error instead of Better Auth's deliberately generic
 * response (which is used when autoSignIn is disabled).
 */
const validateSignUp = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== "/sign-up/email") return;

  const body = ctx.body ?? {};
  assertStrongPassword(body.password);

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

  if (!email) return;

  const existing = await getDB()
    .collection("user")
    .findOne({ email }, { projection: { _id: 1 } });

  if (existing) {
    throw new APIError("UNPROCESSABLE_ENTITY", {
      code: "USER_ALREADY_EXISTS",
      message:
        "An account with this email already exists. Sign in instead or use another email.",
    });
  }
});

function createAuth() {
  /** @type {Record<string, { clientId: string, clientSecret: string, prompt?: string }>} */
  const socialProviders = {};

  if (isGoogleOAuthConfigured()) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID.trim(),
      clientSecret: env.GOOGLE_CLIENT_SECRET.trim(),
      prompt: "select_account",
    };
  }

  return betterAuth({
    appName: "StudioSpace",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: resolveBetterAuthSecret(),
    trustedOrigins: env.CLIENT_ORIGINS,
    database: mongodbAdapter(getDB()),
    emailAndPassword: {
      enabled: true,
      // Registration redirects to /login, so no session should be created here.
      autoSignIn: false,
      requireEmailVerification: false,
      minPasswordLength: 6,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: false,
      },
    },
    socialProviders,
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ["google"],
      },
    },
    advanced: {
      useSecureCookies: env.AUTH_COOKIE_SECURE,
      cookiePrefix: "studiospace",
      defaultCookieAttributes: {
        httpOnly: true,
        secure: env.AUTH_COOKIE_SECURE,
        sameSite: env.AUTH_COOKIE_SAME_SITE,
        path: "/",
        ...(env.AUTH_COOKIE_DOMAIN ? { domain: env.AUTH_COOKIE_DOMAIN } : {}),
      },
    },
    hooks: {
      before: validateSignUp,
    },
  });
}

/**
 * Lazily creates the Better Auth instance after MongoDB is connected. The
 * MongoDB adapter needs a live Db handle, and creating it at module load time
 * would run before connectDB().
 */
export function getAuth() {
  if (!authInstance) {
    authInstance = createAuth();
  }
  return authInstance;
}
