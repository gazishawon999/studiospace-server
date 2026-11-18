import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { toNodeHandler } from "better-auth/node";
import { env, validateEnv } from "./config/env.js";
import { connectDB, closeDB } from "./config/db.js";
import { getAuth } from "./config/auth.js";
import authRoutes from "./routes/auth.routes.js";
import bookingRoutes from "./routes/booking.routes.js";
import healthRoutes from "./routes/health.routes.js";
import studioRoutes from "./routes/studio.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import {
  notFoundHandler,
  globalErrorHandler,
} from "./middleware/errorHandler.js";

// 1. Validate required environment variables
validateEnv();

const app = express();

// 2. Trust reverse proxy (Required on Render for secure HTTPOnly cookies)
app.set("trust proxy", 1);

// 3. Configure CORS with credentials support for HTTPOnly cookies
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., server-to-server, curl, health checks)
      if (!origin || env.CLIENT_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by StudioSpace CORS`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-CSRF-Token"],
    maxAge: 86400,
  }),
);

// 4. Authentication
// Express auth routes (/token, /me, /logout, /csrf, /providers) need parsed
// cookies for CSRF/origin-protected mutations. Keep Better Auth's catch-all
// mounted before the global JSON/body parsers so Better Auth can read the raw
// request body when required.
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.all("/api/auth/*", (req, res, next) => {
  Promise.resolve(toNodeHandler(getAuth())(req, res)).catch(next);
});

// 5. Core Middleware
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// 6. Root Welcome Route
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to StudioSpace REST API Server",
    docs: "/api/health",
  });
});

// 7. API Routes
app.use("/api/health", healthRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/studios", studioRoutes);
app.use("/api/bookings", bookingRoutes);

// 8. 404 & Global Error Handlers
app.use(notFoundHandler);
app.use(globalErrorHandler);

// 9. Start Server after verifying MongoDB Connection
async function startServer() {
  try {
    await connectDB();

    const server = app.listen(env.PORT, () => {
      console.log(
        `[StudioSpace Server] Running on http://localhost:${env.PORT} (${env.NODE_ENV})`,
      );
      console.log(
        `[Health Check] Verify at http://localhost:${env.PORT}/api/health`,
      );
    });

    // Graceful Shutdown
    const shutdown = async (signal) => {
      console.log(`\n[${signal}] Shutting down StudioSpace server...`);
      server.close(async () => {
        await closeDB();
        process.exit(0);
      });
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (error) {
    console.error("[Startup Failure] Could not start server:", error.message);
    process.exit(1);
  }
}

startServer();
