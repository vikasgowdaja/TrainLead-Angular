import mongoose from 'mongoose';

export async function connectDatabase(
  uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/trainlead',
): Promise<void> {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}