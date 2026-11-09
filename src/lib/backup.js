import mongoose from 'mongoose';
import { BSON } from 'mongodb';

export const { EJSON } = BSON;

/**
 * Everything in the database except GridFS file chunks (the file bytes are
 * downloaded separately, as real files).
 */
export async function backupCollections() {
  const list = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  return list
    .map((c) => c.name)
    .filter((n) => !n.startsWith('system.') && n !== 'uploads.chunks')
    .sort();
}
