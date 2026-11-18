import { ObjectId } from "mongodb";
import { collections, getClient } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";

const BOOKING_STATUSES = ["Pending", "Confirmed", "Completed", "Cancelled"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toIso(value) {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function serializeBooking(booking) {
  const { _id, createdAt, updatedAt, ...rest } = booking;

  return {
    ...rest,
    _id: _id?.toString?.() ?? String(_id),
    studioId: rest.studioId?.toString?.() ?? String(rest.studioId ?? ""),
    userId: rest.userId?.toString?.() ?? String(rest.userId ?? ""),
    startTime: toNumber(rest.startTime),
    endTime: toNumber(rest.endTime),
    duration: toNumber(rest.duration ?? rest.totalHours),
    hourlyRate: toNumber(rest.hourlyRate),
    bookingPrice: toNumber(rest.bookingPrice ?? rest.totalPrice),
    securityDeposit: toNumber(rest.securityDeposit),
    status: rest.status ?? "Pending",
    createdAt: toIso(createdAt),
    updatedAt: toIso(updatedAt),
  };
}

function assertObjectId(id, label = "id") {
  if (typeof id !== "string" || !ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}.`, 400, [`${label} is invalid`]);
  }
  return new ObjectId(id);
}

function parseBookingDate(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value.trim())) {
    throw new AppError("Booking date must be in YYYY-MM-DD format.", 400, [
      "bookingDate must be in YYYY-MM-DD format",
    ]);
  }

  const date = value.trim();
  const [yearStr, monthStr, dayStr] = date.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    throw new AppError("Booking date is invalid.", 400, [
      "bookingDate must be a valid calendar date",
    ]);
  }

  return date;
}

function parseHour(value, field, { min, max }) {
  const num = Number(value);
  if (!Number.isInteger(num)) {
    throw new AppError(`${field} must be a whole hour.`, 400, [
      `${field} must be an integer hour`,
    ]);
  }
  if (num < min || num > max) {
    throw new AppError(`${field} must be between ${min} and ${max}.`, 400, [
      `${field} must be between ${min} and ${max}`,
    ]);
  }
  return num;
}

function buildStartDateTimeUtc(bookingDate, startTime) {
  // Treat provided date/hour as a UTC wall-clock slot to avoid server timezone
  // ambiguity. Validation requires this start moment to be in the future.
  return new Date(`${bookingDate}T${String(startTime).padStart(2, "0")}:00:00.000Z`);
}

function isTransactionUnsupportedError(error) {
  if (!error) return false;
  const message = String(error.message || "");
  return (
    error.code === 20 ||
    error.codeName === "IllegalOperation" ||
    /Transaction numbers are only allowed/i.test(message) ||
    /replica set/i.test(message) && /transaction/i.test(message)
  );
}

function isTransientTransactionError(error) {
  return Boolean(
    error &&
      (error.hasErrorLabel?.("TransientTransactionError") ||
        error.errorLabels?.includes?.("TransientTransactionError")),
  );
}

async function findConflictingConfirmedBooking(
  bookingsCollection,
  { studioId, bookingDate, startTime, endTime },
  session,
) {
  return bookingsCollection.findOne(
    {
      studioId,
      bookingDate,
      status: "Confirmed",
      startTime: { $lt: endTime },
      endTime: { $gt: startTime },
    },
    { session, projection: { _id: 1 } },
  );
}

/**
 * POST /api/bookings
 * Creates a Pending booking for the authenticated user.
 *
 * Double-booking prevention (as required): rejects overlaps against existing
 * Confirmed bookings for the same studio and date using
 *   newStart < existingEnd AND newEnd > existingStart
 *
 * Concurrency strategy: the overlap check and insert run inside a MongoDB
 * multi-document transaction (session.withTransaction) on deployments that
 * support transactions (replica set / Atlas). This makes the read-check-then-
 * insert atomic with respect to concurrent writers participating in the same
 * transactional guarantees. If the deployment does not support transactions,
 * the request fails with a clear 503 error (race-condition safety is not
 * claimed/guaranteed without transaction support).
 *
 * Note: only Confirmed bookings block creation per assignment rules, so
 * concurrent requests that would create overlapping Pending bookings are not
 * treated as collisions with Confirmed bookings unless a Confirmed booking is
 * present/committed in that interval.
 */
export async function createBooking(req, res, next) {
  const session = getClient().startSession();

  try {
    const user = req.auth.user;
    const { studioId: studioIdRaw, bookingDate: bookingDateRaw, startTime: startRaw, endTime: endRaw } =
      req.body ?? {};

    if (typeof studioIdRaw !== "string" || !studioIdRaw.trim()) {
      throw new AppError("Studio is required.", 400, ["studioId is required"]);
    }

    const studioObjectId = assertObjectId(studioIdRaw.trim(), "studioId");
    const bookingDate = parseBookingDate(bookingDateRaw);
    const startTime = parseHour(startRaw, "startTime", { min: 0, max: 23 });
    const endTime = parseHour(endRaw, "endTime", { min: 1, max: 24 });

    if (endTime <= startTime) {
      throw new AppError("End time must be after start time.", 400, [
        "endTime must be after startTime",
      ]);
    }

    const duration = endTime - startTime;
    if (duration <= 0) {
      throw new AppError("Booking duration must be positive.", 400, [
        "duration must be positive",
      ]);
    }

    const startDateTime = buildStartDateTimeUtc(bookingDate, startTime);
    if (startDateTime.getTime() <= Date.now()) {
      throw new AppError("Booking date and time must be in the future.", 400, [
        "booking must be scheduled in the future",
      ]);
    }

    const studiosCollection = collections.studios();
    const bookingsCollection = collections.bookings();

    let createdBooking = null;

    const runCreate = async () => {
      const studio = await studiosCollection.findOne(
        { _id: studioObjectId },
        { session },
      );

      if (!studio) {
        throw new AppError("Studio not found.", 404, ["studio does not exist"]);
      }

      const conflict = await findConflictingConfirmedBooking(
        bookingsCollection,
        {
          studioId: studioObjectId.toString(),
          bookingDate,
          startTime,
          endTime,
        },
        session,
      );

      if (conflict) {
        throw new AppError(
          "This time slot overlaps with an existing confirmed booking for this studio. Please choose a different time.",
          409,
          ["booking time overlaps with a confirmed reservation"],
          "BOOKING_TIME_CONFLICT",
        );
      }

      const hourlyRate = toNumber(studio.hourlyRate);
      const securityDeposit = toNumber(studio.securityDeposit);
      const bookingPrice = roundCurrency(hourlyRate * duration);
      const now = new Date();

      const document = {
        studioId: studioObjectId.toString(),
        studioTitle: typeof studio.title === "string" ? studio.title : "Studio",
        studioImage:
          typeof studio.imageUrl === "string" && studio.imageUrl
            ? studio.imageUrl
            : typeof studio.image === "string"
              ? studio.image
              : "",
        studioCategory: typeof studio.category === "string" ? studio.category : "",
        studioLocation: typeof studio.location === "string" ? studio.location : "",
        userId: user.id,
        userName: user.name || "StudioSpace user",
        userEmail: user.email,
        bookingDate,
        startTime,
        endTime,
        duration,
        hourlyRate,
        bookingPrice,
        securityDeposit,
        status: "Pending",
        createdAt: now,
        updatedAt: now,
      };

      const result = await bookingsCollection.insertOne(document, { session });
      createdBooking = { ...document, _id: result.insertedId };
    };

    let attempts = 0;
    while (true) {
      attempts += 1;
      try {
        await session.withTransaction(runCreate, {
          readConcern: { level: "snapshot" },
          writeConcern: { w: "majority" },
        });
        break;
      } catch (error) {
        if (isTransientTransactionError(error) && attempts < 3) {
          continue;
        }
        throw error;
      }
    }

    res.status(201).json({
      success: true,
      message: "Booking request submitted successfully.",
      data: serializeBooking(createdBooking),
    });
  } catch (error) {
    if (isTransactionUnsupportedError(error)) {
      return next(
        new AppError(
          "Booking could not be completed because this MongoDB deployment does not support transactions required for safe overlap checks. Use a MongoDB replica set or Atlas cluster with transaction support.",
          503,
          undefined,
          "TRANSACTIONS_UNSUPPORTED",
        ),
      );
    }
    return next(error);
  } finally {
    await session.endSession();
  }
}

/**
 * GET /api/bookings/me
 */
export async function getMyBookings(req, res, next) {
  try {
    const user = req.auth.user;

    const bookings = await collections
      .bookings()
      .find({
        $or: [{ userId: user.id }, { userEmail: user.email }],
      })
      .sort({ createdAt: -1, _id: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: bookings.length,
      data: bookings.map(serializeBooking),
    });
  } catch (error) {
    next(error);
  }
}

function assertBookingOwner(booking, user) {
  const bookingUserId = booking.userId?.toString?.() ?? String(booking.userId ?? "");
  const ownsById = bookingUserId && bookingUserId === user.id;
  const ownsByEmail =
    typeof booking.userEmail === "string" &&
    booking.userEmail.toLowerCase() === user.email.toLowerCase();

  if (!ownsById && !ownsByEmail) {
    throw new AppError("You do not have permission to access this booking.", 403);
  }
}

/**
 * GET /api/bookings/:id
 */
export async function getBookingById(req, res, next) {
  try {
    const _id = assertObjectId(req.params.id, "booking id");
    const booking = await collections.bookings().findOne({ _id });

    if (!booking) {
      throw new AppError("Booking not found.", 404);
    }

    assertBookingOwner(booking, req.auth.user);

    res.status(200).json({
      success: true,
      data: serializeBooking(booking),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/bookings/:id/cancel
 * Only the owner may cancel, and only Pending bookings may be cancelled.
 */
export async function cancelBooking(req, res, next) {
  try {
    const _id = assertObjectId(req.params.id, "booking id");
    const bookingsCollection = collections.bookings();
    const booking = await bookingsCollection.findOne({ _id });

    if (!booking) {
      throw new AppError("Booking not found.", 404);
    }

    assertBookingOwner(booking, req.auth.user);

    if (booking.status === "Cancelled") {
      return res.status(200).json({
        success: true,
        message: "Booking is already cancelled.",
        data: serializeBooking(booking),
      });
    }

    if (booking.status !== "Pending") {
      throw new AppError(
        "Only pending bookings can be cancelled.",
        409,
        ["booking status does not allow cancellation"],
      );
    }

    const now = new Date();
    await bookingsCollection.updateOne(
      { _id, status: "Pending" },
      { $set: { status: "Cancelled", updatedAt: now } },
    );

    const updated = await bookingsCollection.findOne({ _id });

    res.status(200).json({
      success: true,
      message: "Booking cancelled successfully.",
      data: serializeBooking(updated),
    });
  } catch (error) {
    next(error);
  }
}
