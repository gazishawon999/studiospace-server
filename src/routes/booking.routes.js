import express, { Router } from "express";
import {
  cancelBooking,
  createBooking,
  getBookingById,
  getMyBookings,
} from "../controllers/booking.controller.js";
import { requireAuth } from "../middleware/auth.js";
import { protectMutation } from "../middleware/csrf.js";
import { validateObjectId } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();
const jsonBody = express.json({ limit: "1mb" });

router.get("/me", requireAuth, asyncHandler(getMyBookings));

router.post(
  "/",
  jsonBody,
  requireAuth,
  ...protectMutation,
  asyncHandler(createBooking),
);

router.get(
  "/:id",
  requireAuth,
  validateObjectId("id"),
  asyncHandler(getBookingById),
);

router.patch(
  "/:id/cancel",
  jsonBody,
  requireAuth,
  ...protectMutation,
  validateObjectId("id"),
  asyncHandler(cancelBooking),
);

export default router;
