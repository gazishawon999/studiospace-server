import { MongoClient, ServerApiVersion } from "mongodb";
import { env } from "./env.js";

/** @type {MongoClient | null} */
let client = null;

/** @type {import('mongodb').Db | null} */
let dbInstance = null;

/**
 * Returns the active MongoClient (required for sessions/transactions).
 * @returns {MongoClient}
 */
export function getClient() {
  if (!client) {
    throw new Error("Database not initialized. Call connectDB() first.");
  }
  return client;
}

/**
 * Connects to MongoDB Atlas using a reusable singleton instance.
 * Safe to call multiple times across requests.
 * @returns {Promise<import('mongodb').Db>}
 */
export async function connectDB() {
  if (dbInstance && client) {
    return dbInstance;
  }

  try {
    client = new MongoClient(env.MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
      maxPoolSize: 10,
      minPoolSize: 1,
      connectTimeoutMS: 10000,
    });

    await client.connect();
    dbInstance = client.db(env.DB_NAME);

    // Verify connection with a lightweight ping
    await dbInstance.command({ ping: 1 });
    console.log(
      `[MongoDB] Connected successfully to database: "${env.DB_NAME}"`,
    );

    // Ensure performance & integrity indexes exist
    await ensureIndexes(dbInstance);

    return dbInstance;
  } catch (error) {
    console.error("[MongoDB Connection Error]:", error.message);
    client = null;
    dbInstance = null;
    throw error;
  }
}

/**
 * Creates indexes for studios, bookings, and wishlists collections.
 * @param {import('mongodb').Db} db
 */
async function ensureIndexes(db) {
  try {
    const studios = db.collection("studios");
    const bookings = db.collection("bookings");
    const wishlists = db.collection("wishlists");

    await Promise.all([
      studios.createIndex({ category: 1 }),
      studios.createIndex({ ownerEmail: 1 }),
      studios.createIndex({ rating: -1, createdAt: -1 }),
      bookings.createIndex({ studioId: 1, bookingDate: 1, status: 1 }),
      bookings.createIndex({ studioId: 1, bookingDate: 1, startTime: 1, endTime: 1 }),
      bookings.createIndex({ userEmail: 1, createdAt: -1 }),
      bookings.createIndex({ userId: 1, createdAt: -1 }),
      wishlists.createIndex({ userEmail: 1, studioId: 1 }, { unique: true }),
    ]);
  } catch (indexError) {
    console.warn("[MongoDB Index Warning]:", indexError.message);
  }
}

/**
 * Returns the active database instance or throws if not initialized.
 * @returns {import('mongodb').Db}
 */
export function getDB() {
  if (!dbInstance) {
    throw new Error("Database not initialized. Call connectDB() first.");
  }
  return dbInstance;
}

/**
 * Collection helper getters
 */
export const collections = {
  studios: () => getDB().collection("studios"),
  bookings: () => getDB().collection("bookings"),
  wishlists: () => getDB().collection("wishlists"),
  users: () => getDB().collection("user"),
  sessions: () => getDB().collection("session"),
};

/**
 * Gracefully closes the MongoDB connection on process termination.
 */
export async function closeDB() {
  if (client) {
    await client.close();
    client = null;
    dbInstance = null;
    console.log("[MongoDB] Connection closed gracefully.");
  }
}
