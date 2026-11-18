import { ObjectId } from "mongodb";
import { collections } from "../config/db.js";
import { AppError } from "../middleware/errorHandler.js";
import { STUDIO_CATEGORIES } from "../constants/studioCategories.js";

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 24;
const MAX_IMAGE_URL_LENGTH = 2048;
const MAX_AMENITIES = 30;
const MAX_SEARCH_LENGTH = 80;

const CATEGORY_SLUG_TO_VALUE = {
  "photo-studio": "Photo Studio",
  "film-stage": "Film Stage",
  "sound-stage": "Sound Stage",
  "podcast-lounge": "Podcast Lounge",
  "podcast-room": "Podcast Lounge",
  "podcast-rooms": "Podcast Lounge",
  "music-suite": "Music Suite",
  "music-suites": "Music Suite",
  workshop: "Workshop",
  workshops: "Workshop",
  "art-workshop": "Art Workshop",
  "art-workshops": "Art Workshop",
};

function toIso(value) {
  return value instanceof Date ? value.toISOString() : (value ?? null);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function baseStudioFields(studio) {
  const { _id, createdAt, updatedAt, ownerId, ...rest } = studio;

  return {
    ...rest,
    _id: _id?.toString?.() ?? String(_id),
    ownerId: ownerId?.toString?.() ?? (ownerId ? String(ownerId) : undefined),
    hourlyRate: toNumber(rest.hourlyRate),
    securityDeposit: toNumber(rest.securityDeposit),
    maxCapacity: toNumber(rest.maxCapacity),
    rating: toNumber(rest.rating),
    reviewCount: toNumber(rest.reviewCount),
    amenities: Array.isArray(rest.amenities) ? rest.amenities : [],
    galleryImages: Array.isArray(rest.galleryImages)
      ? rest.galleryImages.filter((value) => typeof value === "string" && value)
      : [],
    createdAt: toIso(createdAt),
    updatedAt: toIso(updatedAt),
  };
}

/** Public read serializer: omits owner email and owner id to avoid leaking contact/identity data. */
function serializePublicStudio(studio) {
  const serialized = baseStudioFields(studio);
  const { ownerEmail, ownerId, ...publicFields } = serialized;
  return publicFields;
}

/** Owner serializer: includes fields needed for management/edit forms. */
function serializeOwnerStudio(studio) {
  return baseStudioFields(studio);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveCategoryInput(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (STUDIO_CATEGORIES.includes(trimmed)) return trimmed;

  const slug = trimmed
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-");

  return CATEGORY_SLUG_TO_VALUE[slug] ?? null;
}

function parseFiniteNumber(value, label) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    throw new AppError(`Invalid ${label}.`, 400, [`${label} must be a number`]);
  }
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new AppError(`Invalid ${label}.`, 400, [`${label} must be a number`]);
  }
  return num;
}

function parseInteger(value, label) {
  const num = parseFiniteNumber(value, label);
  if (num === undefined) return undefined;
  if (!Number.isInteger(num)) {
    throw new AppError(`Invalid ${label}.`, 400, [
      `${label} must be a whole number`,
    ]);
  }
  return num;
}

function isValidHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeAmenities(value) {
  if (!Array.isArray(value)) return null;

  const seen = new Set();
  const amenities = [];

  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    amenities.push(trimmed.slice(0, 60));
    if (amenities.length >= MAX_AMENITIES) break;
  }

  return amenities;
}

function validateStudioPayload(body, { partial = false } = {}) {
  const errors = [];
  const data = {};

  const requireString = (field, label, min = 1, max = 300) => {
    const value = body?.[field];
    if (value === undefined || value === null || value === "") {
      if (!partial) errors.push(`${label} is required.`);
      return;
    }
    if (typeof value !== "string") {
      errors.push(`${label} must be text.`);
      return;
    }
    const trimmed = value.trim();
    if (trimmed.length < min) {
      errors.push(`${label} must be at least ${min} characters.`);
      return;
    }
    if (trimmed.length > max) {
      errors.push(`${label} must be ${max} characters or fewer.`);
      return;
    }
    data[field] = trimmed;
  };

  const requireNumber = (field, label, { min = 0, integer = false } = {}) => {
    const value = body?.[field];
    if (value === undefined || value === null || value === "") {
      if (!partial) errors.push(`${label} is required.`);
      return;
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
      errors.push(`${label} must be a valid number.`);
      return;
    }
    if (integer && !Number.isInteger(num)) {
      errors.push(`${label} must be a whole number.`);
      return;
    }
    if (num < min) {
      errors.push(`${label} must be ${min} or greater.`);
      return;
    }
    data[field] = num;
  };

  requireString("title", "Title", 3, 120);

  if (body?.category === undefined || body?.category === null || body?.category === "") {
    if (!partial) errors.push("Category is required.");
  } else if (typeof body.category !== "string" || !STUDIO_CATEGORIES.includes(body.category.trim())) {
    errors.push(
      `Category must be one of: ${STUDIO_CATEGORIES.join(", ")}.`,
    );
  } else {
    data.category = body.category.trim();
  }

  requireNumber("hourlyRate", "Hourly rate", { min: 0 });
  requireNumber("securityDeposit", "Security deposit", { min: 0 });
  requireNumber("maxCapacity", "Maximum capacity", { min: 1, integer: true });
  requireString("location", "Location", 3, 180);

  const imageValue = body?.imageUrl ?? body?.image;
  if (imageValue === undefined || imageValue === null || imageValue === "") {
    if (!partial) errors.push("Studio image is required.");
  } else if (typeof imageValue !== "string") {
    errors.push("Studio image must be a valid URL.");
  } else {
    const trimmed = imageValue.trim();
    if (!isValidHttpUrl(trimmed) || trimmed.length > MAX_IMAGE_URL_LENGTH) {
      errors.push("Studio image must be a valid http(s) image URL.");
    } else {
      data.imageUrl = trimmed;
    }
  }

  if (body?.amenities === undefined || body?.amenities === null) {
    if (!partial) errors.push("At least one amenity is required.");
  } else {
    const amenities = normalizeAmenities(body.amenities);
    if (amenities === null) {
      errors.push("Amenities must be a list of values.");
    } else if (amenities.length === 0) {
      errors.push("Please provide at least one amenity.");
    } else {
      data.amenities = amenities;
    }
  }

  requireString("overview", "Overview", 20, 3000);

  // Never trust client-supplied owner identity fields.
  delete data.ownerId;
  delete data.ownerName;
  delete data.ownerEmail;
  delete data.rating;
  delete data.reviewCount;
  delete data.createdAt;
  delete data.updatedAt;

  return { data, errors };
}

function assertObjectId(id, label = "studio id") {
  if (!ObjectId.isValid(id)) {
    throw new AppError(`Invalid ${label}.`, 400);
  }
  return new ObjectId(id);
}

/**
 * GET /api/studios/featured
 */
export async function getFeaturedStudios(_req, res, next) {
  try {
    const studios = await collections
      .studios()
      .find({})
      .sort({ rating: -1, reviewCount: -1, createdAt: -1 })
      .limit(6)
      .toArray();

    res.status(200).json({
      success: true,
      count: studios.length,
      data: studios.map(serializePublicStudio),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/studios
 * Supports backend-driven search, filtering, sorting, and pagination.
 */
export async function listStudios(req, res, next) {
  try {
    const errors = [];

    const qRaw = req.query.q ?? req.query.search;
    let search = "";
    if (qRaw !== undefined) {
      if (typeof qRaw !== "string") {
        errors.push("search must be text");
      } else {
        search = qRaw.trim().slice(0, MAX_SEARCH_LENGTH);
      }
    }

    let category;
    if (req.query.category !== undefined) {
      const resolved = resolveCategoryInput(req.query.category);
      if (!resolved) {
        errors.push("category must be a valid studio category");
      } else {
        category = resolved;
      }
    }

    let minHourlyRate;
    let maxHourlyRate;
    let maxCapacity;
    let page = 1;
    let limit = DEFAULT_LIMIT;

    try {
      minHourlyRate = parseFiniteNumber(req.query.minHourlyRate, "minHourlyRate");
      maxHourlyRate = parseFiniteNumber(req.query.maxHourlyRate, "maxHourlyRate");
      maxCapacity = parseInteger(req.query.maxCapacity, "maxCapacity");
      const pageParsed = parseInteger(req.query.page, "page");
      const limitParsed = parseInteger(req.query.limit, "limit");
      if (pageParsed !== undefined) page = pageParsed;
      if (limitParsed !== undefined) limit = limitParsed;
    } catch (error) {
      if (error instanceof AppError) {
        errors.push(...(error.errors || [error.message]));
      } else {
        throw error;
      }
    }

    if (minHourlyRate !== undefined && minHourlyRate < 0) {
      errors.push("minHourlyRate must be 0 or greater");
    }
    if (maxHourlyRate !== undefined && maxHourlyRate < 0) {
      errors.push("maxHourlyRate must be 0 or greater");
    }
    if (
      minHourlyRate !== undefined &&
      maxHourlyRate !== undefined &&
      minHourlyRate > maxHourlyRate
    ) {
      errors.push("minHourlyRate cannot be greater than maxHourlyRate");
    }
    if (maxCapacity !== undefined && maxCapacity < 1) {
      errors.push("maxCapacity must be 1 or greater");
    }
    if (page < 1) errors.push("page must be 1 or greater");
    if (limit < 1) errors.push("limit must be 1 or greater");

    const sortRaw =
      typeof req.query.sort === "string" ? req.query.sort.trim() : "newest";
    const sortKey = sortRaw || "newest";
    const allowedSorts = new Set(["newest", "price-asc", "price-desc", "rating"]);
    if (!allowedSorts.has(sortKey)) {
      errors.push("sort must be one of: newest, price-asc, price-desc, rating");
    }

    if (errors.length > 0) {
      throw new AppError("Invalid studio query parameters.", 400, errors);
    }

    limit = Math.min(limit, MAX_LIMIT);
    const skip = (page - 1) * limit;

    /** @type {Record<string, any>} */
    const filter = {};

    if (category) filter.category = category;

    if (search) {
      const pattern = new RegExp(escapeRegex(search), "i");
      filter.$or = [{ title: pattern }, { location: pattern }];
    }

    if (minHourlyRate !== undefined || maxHourlyRate !== undefined) {
      filter.hourlyRate = {};
      if (minHourlyRate !== undefined) filter.hourlyRate.$gte = minHourlyRate;
      if (maxHourlyRate !== undefined) filter.hourlyRate.$lte = maxHourlyRate;
    }

    if (maxCapacity !== undefined) {
      filter.maxCapacity = { $lte: maxCapacity };
    }

    let sort;
    switch (sortKey) {
      case "price-asc":
        sort = { hourlyRate: 1, createdAt: -1, _id: -1 };
        break;
      case "price-desc":
        sort = { hourlyRate: -1, createdAt: -1, _id: -1 };
        break;
      case "rating":
        // Only studios with real rating data should rank by rating.
        filter.reviewCount = { ...(filter.reviewCount || {}), $gt: 0 };
        filter.rating = { ...(filter.rating || {}), $gt: 0 };
        sort = { rating: -1, reviewCount: -1, createdAt: -1, _id: -1 };
        break;
      case "newest":
      default:
        sort = { createdAt: -1, _id: -1 };
        break;
    }

    const collection = collections.studios();
    const [studios, total] = await Promise.all([
      collection.find(filter).sort(sort).skip(skip).limit(limit).toArray(),
      collection.countDocuments(filter),
    ]);

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const hasMore = totalPages > 0 && page < totalPages;

    res.status(200).json({
      success: true,
      count: studios.length,
      data: studios.map(serializePublicStudio),
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasMore,
      },
      appliedFilters: {
        q: search || null,
        category: category || null,
        minHourlyRate: minHourlyRate ?? null,
        maxHourlyRate: maxHourlyRate ?? null,
        maxCapacity: maxCapacity ?? null,
        sort: sortKey,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/studios/:id
 * Public details read. Includes host display info and gallery fields needed for
 * the Studio Details page while omitting sensitive owner contact identifiers.
 */
export async function getStudioById(req, res, next) {
  try {
    const _id = assertObjectId(req.params.id);
    const studio = await collections.studios().findOne({ _id });

    if (!studio) {
      throw new AppError("Studio not found.", 404);
    }

    const serialized = serializePublicStudio(studio);

    // Ensure detail-page fields exist even for older documents.
    if (!Array.isArray(serialized.galleryImages)) serialized.galleryImages = [];
    if (typeof serialized.ownerPhoto !== "string") serialized.ownerPhoto = null;

    res.status(200).json({
      success: true,
      data: serialized,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/studios/owner/me
 * Returns studios owned by the authenticated user (by ownerId, with ownerEmail fallback).
 */
export async function getMyStudios(req, res, next) {
  try {
    const user = req.auth.user;
    const ownerObjectId = ObjectId.isValid(user.id)
      ? new ObjectId(user.id)
      : null;

    const orConditions = [{ ownerEmail: user.email }];
    if (ownerObjectId) {
      orConditions.push({ ownerId: ownerObjectId });
      orConditions.push({ ownerId: user.id });
    }

    const studios = await collections
      .studios()
      .find({ $or: orConditions })
      .sort({ updatedAt: -1, createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      count: studios.length,
      data: studios.map(serializeOwnerStudio),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/studios
 */
export async function createStudio(req, res, next) {
  try {
    const { data, errors } = validateStudioPayload(req.body);

    if (errors.length > 0) {
      throw new AppError("Please fix the highlighted fields.", 400, errors);
    }

    const user = req.auth.user;
    const now = new Date();

    const document = {
      ...data,
      ownerId: ObjectId.isValid(user.id) ? new ObjectId(user.id) : user.id,
      ownerName: user.name,
      ownerEmail: user.email,
      // Ratings are only meaningful when real review data exists.
      rating: 0,
      reviewCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const result = await collections.studios().insertOne(document);
    const created = await collections
      .studios()
      .findOne({ _id: result.insertedId });

    res.status(201).json({
      success: true,
      message: "Studio listing created successfully.",
      data: serializeOwnerStudio(created),
    });
  } catch (error) {
    next(error);
  }
}

async function findOwnedStudioOrThrow(id, user) {
  const _id = assertObjectId(id);
  const studio = await collections.studios().findOne({ _id });

  if (!studio) {
    throw new AppError("Studio not found.", 404);
  }

  const ownerIdStr = studio.ownerId?.toString?.() ?? String(studio.ownerId ?? "");
  const ownsById = ownerIdStr && ownerIdStr === user.id;
  const ownsByEmail =
    typeof studio.ownerEmail === "string" &&
    studio.ownerEmail.toLowerCase() === user.email.toLowerCase();

  if (!ownsById && !ownsByEmail) {
    throw new AppError(
      "You do not have permission to modify this studio listing.",
      403,
    );
  }

  return studio;
}

/**
 * GET /api/studios/:id/owner
 * Owner-only read for edit form (includes owner fields).
 */
export async function getOwnedStudioById(req, res, next) {
  try {
    const studio = await findOwnedStudioOrThrow(req.params.id, req.auth.user);

    res.status(200).json({
      success: true,
      data: serializeOwnerStudio(studio),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/studios/:id
 */
export async function updateStudio(req, res, next) {
  try {
    const existing = await findOwnedStudioOrThrow(req.params.id, req.auth.user);
    const { data, errors } = validateStudioPayload(req.body);

    if (errors.length > 0) {
      throw new AppError("Please fix the highlighted fields.", 400, errors);
    }

    const updates = {
      ...data,
      // Host/owner information remains read-only and server-controlled.
      ownerId: existing.ownerId,
      ownerName: req.auth.user.name || existing.ownerName,
      ownerEmail: req.auth.user.email || existing.ownerEmail,
      // Preserve real rating/review data; do not accept from client.
      rating: toNumber(existing.rating),
      reviewCount: toNumber(existing.reviewCount),
      createdAt: existing.createdAt instanceof Date ? existing.createdAt : new Date(existing.createdAt || Date.now()),
      updatedAt: new Date(),
    };

    await collections.studios().updateOne({ _id: existing._id }, { $set: updates });
    const updated = await collections.studios().findOne({ _id: existing._id });

    res.status(200).json({
      success: true,
      message: "Studio listing updated successfully.",
      data: serializeOwnerStudio(updated),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /api/studios/:id
 */
export async function deleteStudio(req, res, next) {
  try {
    const studio = await findOwnedStudioOrThrow(req.params.id, req.auth.user);
    await collections.studios().deleteOne({ _id: studio._id });

    res.status(200).json({
      success: true,
      message: "Studio listing deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
}
