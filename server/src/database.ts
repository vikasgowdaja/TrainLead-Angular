import mongoose, { type ClientSession } from 'mongoose';

let supportsTransactions = false;

export async function connectDatabase(
  uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/trainlead',
): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const hello = await mongoose.connection.db?.admin().command({ hello: 1 });
  supportsTransactions = Boolean(hello?.['setName'] || hello?.['msg'] === 'isdbgrid');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

/**
 * Runs related writes atomically on a replica set (Docker Compose). A standalone local
 * MongoDB cannot do transactions, so there the writes simply run in order.
 */
export async function withTransaction<T>(work: (session: ClientSession | undefined) => Promise<T>): Promise<T> {
  if (!supportsTransactions) {
    return work(undefined);
  }
  return mongoose.connection.transaction((session) => work(session));
}