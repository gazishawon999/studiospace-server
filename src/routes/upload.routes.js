import { Router } from "express";
import { uploadStudioImage } from "../controllers/upload.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { protectMutation } from "../middleware/csrf.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// POST /api/uploads/image — authenticated image upload (ImgBB, server-side key)
router.post(
  "/image",
  requireAuth,
  ...protectMutation,
  asyncHandler(uploadStudioImage),
);

export default router;
