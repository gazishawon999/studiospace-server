import dotenv from "dotenv";

dotenv.config({ quiet: true });

const ALLOWED_NODE_ENVS = new Set(["development", "test", "production"]);

/**
 * Values that are obviously templates rather than real credentials.
 * We never print the values themselves — only the variable names.
 */
const PLACEHOLDER_PATTERNS = [
  /^replace[_-]/i,
  /^your[_-]/i,
  /^changeme/i,
  /^<.*>$/i,
  /<[^<>]+>/, // placeholder embedded inside a larger value
  /placeholder/i,
  /xxxxx/i,
];

function read(name, fallback = "") {
  const value = process.env[name];
  return (value ?? "").trim() || fallback;
}

function isPlaceholder(value) {
  const normalized = value.trim();
  return (
    !normalized || PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isOriginOnlyUrl(value) {
  if (!isHttpUrl(value)) return false;

  try {
    const url = new URL(value);
    return url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

function parseOrigins(value) {
  const origins = [];

  for (const entry of value.split(",")) {
    const candidate = entry.trim();
    if (!candidate) continue;

    try {
      const url = new URL(candidate);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { origins: [], invalid: candidate };
      }
      origins.push(url.origin);
    } catch {
      return { origins: [], invalid: candidate };
    }
  }

  return { origins, invalid: null };
}

function isStrongSecret(value, minimumLength = 32) {
  return !isPlaceholder(value) && value.length >= minimumLength;
}

/**
 * Validates all server environment variables before the Express app starts.
 *
 * Development stays runnable while credentials are still being collected:
 * missing third-party integrations produce warnings. Production fails fast so
 * an incomplete deployment cannot silently run without auth or image uploads.
 */
export function validateEnv() {
  const errors = [];
  const warnings = [];
  const nodeEnv = read("NODE_ENV", "development");
  const isProduction = nodeEnv === "production";

  if (!ALLOWED_NODE_ENVS.has(nodeEnv)) {
    errors.push("NODE_ENV must be one of: development, test, production.");
  }

  const portRaw = read("PORT", "5000");
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    errors.push("PORT must be an integer between 1 and 65535.");
  }

  const mongoUri = read("MONGODB_URI");
  if (!mongoUri) {
    errors.push(
      "MONGODB_URI is required. Add your MongoDB Atlas connection string to studiospace-server/.env.",
    );
  } else if (
    !/^mongodb(\+srv)?:\/\/[^\s]+$/.test(mongoUri) ||
    isPlaceholder(mongoUri)
  ) {
    errors.push(
      "MONGODB_URI must be a real mongodb:// or mongodb+srv:// connection string with the username, password, and cluster host filled in.",
    );
  }

  const dbName = read("DB_NAME", "studiospace_db");
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(dbName)) {
    errors.push(
      "DB_NAME must be 1-63 characters using only letters, numbers, hyphens, and underscores.",
    );
  }

  const jwtSecret = read("JWT_SECRET");
  if (!jwtSecret) {
    errors.push(
      "JWT_SECRET is required. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  } else if (!isStrongSecret(jwtSecret, 32)) {
    const message =
      "JWT_SECRET is a placeholder or shorter than 32 characters. Generate a 64-character hex secret and update studiospace-server/.env before enabling auth.";
    isProduction ? errors.push(message) : warnings.push(message);
  }

  const jwtExpiresIn = read("JWT_EXPIRES_IN", "7d");
  if (!/^\d+[smhd]$/.test(jwtExpiresIn)) {
    errors.push("JWT_EXPIRES_IN must look like 60s, 15m, 24h, or 7d.");
  }

  const jwtIssuer = read("JWT_ISSUER", "studiospace-api");
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(jwtIssuer)) {
    errors.push(
      "JWT_ISSUER must be 3-80 characters using letters, numbers, dots, hyphens, or underscores.",
    );
  }

  const jwtAudience = read("JWT_AUDIENCE", "studiospace-client");
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(jwtAudience)) {
    errors.push(
      "JWT_AUDIENCE must be 3-80 characters using letters, numbers, dots, hyphens, or underscores.",
    );
  }

  const cookieName = read("AUTH_COOKIE_NAME", "studiospace_session");
  if (!/^[A-Za-z0-9_-]+$/.test(cookieName)) {
    errors.push(
      "AUTH_COOKIE_NAME may only contain letters, numbers, hyphens, and underscores.",
    );
  }

  const sameSite = read("AUTH_COOKIE_SAME_SITE", "lax").toLowerCase();
  if (!["lax", "strict", "none"].includes(sameSite)) {
    errors.push("AUTH_COOKIE_SAME_SITE must be one of: lax, strict, none.");
  }

  const cookieSecureRaw = read(
    "AUTH_COOKIE_SECURE",
    isProduction ? "true" : "false",
  ).toLowerCase();
  if (!["true", "false"].includes(cookieSecureRaw)) {
    errors.push("AUTH_COOKIE_SECURE must be true or false.");
  }
  const cookieSecure = cookieSecureRaw === "true";

  if (isProduction && !cookieSecure) {
    errors.push("AUTH_COOKIE_SECURE must be true in production.");
  }
  if (sameSite === "none" && !cookieSecure) {
    errors.push(
      "AUTH_COOKIE_SAME_SITE=none requires AUTH_COOKIE_SECURE=true (HTTPS).",
    );
  }
  if (sameSite === "none" && !isProduction) {
    warnings.push(
      "AUTH_COOKIE_SAME_SITE=none is intended for cross-site HTTPS deployments. Use lax locally.",
    );
  }

  const cookieDomain = read("AUTH_COOKIE_DOMAIN");
  if (
    cookieDomain &&
    !/^\.?([a-z0-9-]+\.)+[a-z]{2,}$/i.test(cookieDomain)
  ) {
    errors.push(
      "AUTH_COOKIE_DOMAIN must be a bare domain such as .studiospace.app, or empty for localhost.",
    );
  }

  const clientUrl = read("CLIENT_URL", "http://localhost:3000");
  const { origins: clientOrigins, invalid: invalidOrigin } =
    parseOrigins(clientUrl);
  if (invalidOrigin || clientOrigins.length === 0) {
    errors.push(
      "CLIENT_URL must be one or more comma-separated http(s) origins, e.g. http://localhost:3000.",
    );
  }
  if (
    isProduction &&
    clientOrigins.length > 0 &&
    clientOrigins.some((origin) => !origin.startsWith("https://"))
  ) {
    warnings.push(
      "A non-HTTPS origin is configured in CLIENT_URL while NODE_ENV=production.",
    );
  }

  const betterAuthUrl = read("BETTER_AUTH_URL", `http://localhost:${port}`);
  if (!isOriginOnlyUrl(betterAuthUrl)) {
    errors.push(
      "BETTER_AUTH_URL must be an http(s) origin without a path, e.g. http://localhost:5000.",
    );
  } else if (isProduction && !betterAuthUrl.startsWith("https://")) {
    errors.push("BETTER_AUTH_URL must use https:// when NODE_ENV=production.");
  }

  const betterAuthSecret = read("BETTER_AUTH_SECRET");
  const googleClientId = read("GOOGLE_CLIENT_ID");
  const googleClientSecret = read("GOOGLE_CLIENT_SECRET");
  const authMissing = [];

  if (!isStrongSecret(betterAuthSecret, 32)) {
    authMissing.push("BETTER_AUTH_SECRET");
  }
  if (isPlaceholder(googleClientId)) {
    authMissing.push("GOOGLE_CLIENT_ID");
  }
  if (isPlaceholder(googleClientSecret)) {
    authMissing.push("GOOGLE_CLIENT_SECRET");
  }

  if (authMissing.length > 0) {
    const message = `Better Auth / Google OAuth is not fully configured. Missing or placeholder: ${authMissing.join(
      ", ",
    )}. Public pages and read-only APIs can still run. See studiospace-server/docs/environment.md.`;
    isProduction ? errors.push(message) : warnings.push(message);
  } else {
    if (
      googleClientId &&
      !googleClientId.endsWith(".apps.googleusercontent.com")
    ) {
      warnings.push(
        "GOOGLE_CLIENT_ID does not end with .apps.googleusercontent.com. Double-check the OAuth client ID.",
      );
    }
    if (googleClientSecret.length < 10) {
      warnings.push(
        "GOOGLE_CLIENT_SECRET looks unusually short. Double-check the OAuth client secret.",
      );
    }
  }

  const imgbbApiKey = read("IMGBB_API_KEY");
  if (isPlaceholder(imgbbApiKey)) {
    const message =
      "IMGBB_API_KEY is missing or a placeholder. Server-side image uploads will not work until a real key is configured in studiospace-server/.env.";
    isProduction ? errors.push(message) : warnings.push(message);
  } else if (imgbbApiKey.length < 20) {
    warnings.push(
      "IMGBB_API_KEY looks unusually short. Double-check the ImgBB API key.",
    );
  }

  for (const warning of warnings) {
    console.warn(`[ENV WARNING] ${warning}`);
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`[ENV ERROR] ${error}`);
    }
    console.error(
      "Copy studiospace-server/.env.example to studiospace-server/.env and fill in the required values.",
    );
    process.exit(1);
  }
}

const nodeEnv = read("NODE_ENV", "development");
const port = Number(read("PORT", "5000"));
const dbName = read("DB_NAME", "studiospace_db");
const clientUrl = read("CLIENT_URL", "http://localhost:3000");
const { origins: clientOrigins } = parseOrigins(clientUrl);
const isProduction = nodeEnv === "production";

export const env = {
  NODE_ENV: nodeEnv,
  IS_PRODUCTION: isProduction,
  PORT: port,
  MONGODB_URI: read("MONGODB_URI"),
  DB_NAME: dbName,
  JWT_SECRET: read("JWT_SECRET"),
  JWT_EXPIRES_IN: read("JWT_EXPIRES_IN", "7d"),
  JWT_ISSUER: read("JWT_ISSUER", "studiospace-api"),
  JWT_AUDIENCE: read("JWT_AUDIENCE", "studiospace-client"),
  AUTH_COOKIE_NAME: read("AUTH_COOKIE_NAME", "studiospace_session"),
  AUTH_COOKIE_SAME_SITE: read("AUTH_COOKIE_SAME_SITE", "lax").toLowerCase(),
  AUTH_COOKIE_SECURE: read(
    "AUTH_COOKIE_SECURE",
    isProduction ? "true" : "false",
  ).toLowerCase() === "true",
  AUTH_COOKIE_DOMAIN: read("AUTH_COOKIE_DOMAIN") || undefined,
  CLIENT_URL: clientUrl,
  CLIENT_ORIGINS: clientOrigins,
  BETTER_AUTH_SECRET: read("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: read("BETTER_AUTH_URL", `http://localhost:${port}`),
  GOOGLE_CLIENT_ID: read("GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: read("GOOGLE_CLIENT_SECRET"),
  IMGBB_API_KEY: read("IMGBB_API_KEY"),
};
