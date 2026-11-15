import { connectDB } from "../config/db.js";
import { env } from "../config/env.js";

/**
 * GET /api/health
 * Verifies API server status and performs a live ping against MongoDB Atlas.
 */
export async function getHealthStatus(_req, res, next) {
  try {
    const startTime = Date.now();
    const db = await connectDB();
    await db.command({ ping: 1 });
    const dbLatencyMs = Date.now() - startTime;

    res.status(200).json({
      success: true,
      service: "studiospace-server",
      status: "ok",
      environment: env.NODE_ENV,
      database: {
        connected: true,
        name: env.DB_NAME,
        latencyMs: dbLatencyMs,
      },
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}
