import mongoose from 'mongoose';
import { env } from './env';

export async function connectDatabase(uri: string = env.mongoUri): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  // eslint-disable-next-line no-console
  console.log(`[db] connected: ${conn.connection.name}`);
  return conn;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}
