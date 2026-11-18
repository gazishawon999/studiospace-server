import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";

const PLACEHOLDER_PATTERN =
  /^(replace[_-]|your[_-]|changeme)|placeholder|xxxxx|<[^<>]+>/i;

function isImgbbConfigured() {
  const key = (env.IMGBB_API_KEY ?? "").trim();
  return key.length >= 20 && !PLACEHOLDER_PATTERN.test(key);
}

/**
 * POST /api/uploads/image
 * Uploads an image to ImgBB from the server so the API key never reaches the
 * browser. Expects JSON: { imageBase64: string, name?: string }
 * imageBase64 may be a raw base64 string or a data URL.
 */
export async function uploadStudioImage(req, res, next) {
  try {
    if (!isImgbbConfigured()) {
      throw new AppError(
        "Image upload is not configured. Add IMGBB_API_KEY to studiospace-server/.env and restart the API.",
        503,
        [],
        "IMGBB_NOT_CONFIGURED",
      );
    }

    const { imageBase64, name } = req.body ?? {};

    if (typeof imageBase64 !== "string" || imageBase64.trim() === "") {
      throw new AppError("An image file is required for upload.", 400, [
        "imageBase64 is required",
      ]);
    }

    // Strip data URL prefix if present and estimate size (base64 ~ 4/3 of bytes).
    const raw = imageBase64.includes(",")
      ? imageBase64.split(",").pop() || ""
      : imageBase64.trim();
    const approxBytes = Math.floor((raw.length * 3) / 4);

    if (approxBytes > 10 * 1024 * 1024) {
      throw new AppError("Image is too large. Maximum size is 10 MB.", 400, [
        "image must be 10 MB or smaller",
      ]);
    }

    const form = new URLSearchParams();
    form.set("image", raw);
    if (typeof name === "string" && name.trim()) {
      form.set("name", name.trim().slice(0, 120));
    }

    const response = await fetch(
      `https://api.imgbb.com/1/upload?key=${encodeURIComponent(env.IMGBB_API_KEY)}`,
      {
        method: "POST",
        body: form,
      },
    );

    const payload = await response.json().catch(() => null);

    if (!response.ok || !payload?.success || !payload?.data?.url) {
      const message =
        payload?.error?.message ||
        payload?.status_txt ||
        "The image host could not process this upload.";
      throw new AppError(`Image upload failed: ${message}`, 502);
    }

    return res.status(201).json({
      success: true,
      data: {
        url: payload.data.url,
        displayUrl: payload.data.display_url || payload.data.url,
        deleteUrl: payload.data.delete_url || null,
      },
    });
  } catch (error) {
    return next(error);
  }
}
