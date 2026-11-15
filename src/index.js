import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env, validateEnv } from "./config/env.js";
import { connectDB, closeDB } from "./config/db.js";
import healthRoutes from "./routes/health.routes.js";
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
const allowedOrigins = env.CLIENT_URL.split(",").map((url) => url.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g., server-to-server, curl, health checks)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by StudioSpace CORS`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie"],
  }),
);

// 4. Core Middleware
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// 5. Root Welcome Route
app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to StudioSpace REST API Server",
    docs: "/api/health",
  });
});

// 6. API Routes
app.use("/api/health", healthRoutes);

// 7. 404 & Global Error Handlers
app.use(notFoundHandler);
app.use(globalErrorHandler);

// 8. Start Server after verifying MongoDB Connection
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
