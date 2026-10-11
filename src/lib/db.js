import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI;

let cached = global._mongooseCache;
if (!cached) cached = global._mongooseCache = { conn: null, promise: null };

/**
 * Connect to MongoDB Atlas, reusing the connection across hot reloads and
 * across serverless invocations on Vercel. A new connection per request
 * would exhaust the Atlas M0 (free tier) connection limit very quickly.
 */
export async function dbConnect() {
  if (cached.conn) return cached.conn;
  if (!MONGODB_URI) {
    throw new Error(
      'MONGODB_URI is not set. Add it to .env.local locally, or in Vercel > Settings > Environment Variables.'
    );
  }
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 20000,
    });
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

export default dbConnect;
