import express, { Router } from "express";
import {
  getAuthProviders,
  getCurrentUser,
  issueApiToken,
  logout,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { issueCsrfToken, protectMutation } from "../middleware/csrf.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// These routes live under /api/auth but are handled by Express, not Better
// Auth. They are registered before the Better Auth catch-all in index.js.
const jsonBody = express.json({ limit: "32kb" });

// GET /api/auth/csrf — issue a double-submit CSRF token.
router.get("/csrf", issueCsrfToken);

// GET /api/auth/providers — report which social providers are configured.
router.get("/providers", getAuthProviders);

// GET /api/auth/me — current Express-authenticated user (JWT required).
router.get("/me", requireAuth, getCurrentUser);

// POST /api/auth/token — exchange a Better Auth session for an API JWT.
router.post("/token", jsonBody, ...protectMutation, asyncHandler(issueApiToken));

// POST /api/auth/logout — revoke Better Auth session and clear cookies.
router.post("/logout", jsonBody, ...protectMutation, asyncHandler(logout));

export default router;
