import express, { Router } from "express";
import {
  createStudio,
  deleteStudio,
  getFeaturedStudios,
  getMyStudios,
  getOwnedStudioById,
  getStudioById,
  listStudios,
  updateStudio,
} from "../controllers/studio.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { protectMutation } from "../middleware/csrf.js";
import { validateObjectId } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const jsonBody = express.json({ limit: "2mb" });

// Public reads
router.get("/featured", asyncHandler(getFeaturedStudios));
router.get("/", asyncHandler(listStudios));

// Owner reads (authenticated). Must be registered before "/:id".
router.get("/owner/me", requireAuth, asyncHandler(getMyStudios));
router.get(
  "/:id/owner",
  requireAuth,
  validateObjectId("id"),
  asyncHandler(getOwnedStudioById),
);

// Public studio details
router.get("/:id", validateObjectId("id"), asyncHandler(getStudioById));

// Mutations (JWT + CSRF/origin protected)
router.post(
  "/",
  jsonBody,
  requireAuth,
  ...protectMutation,
  asyncHandler(createStudio),
);

router.patch(
  "/:id",
  jsonBody,
  requireAuth,
  ...protectMutation,
  validateObjectId("id"),
  asyncHandler(updateStudio),
);

router.put(
  "/:id",
  jsonBody,
  requireAuth,
  ...protectMutation,
  validateObjectId("id"),
  asyncHandler(updateStudio),
);

router.delete(
  "/:id",
  jsonBody,
  requireAuth,
  ...protectMutation,
  validateObjectId("id"),
  asyncHandler(deleteStudio),
);

export default router;
