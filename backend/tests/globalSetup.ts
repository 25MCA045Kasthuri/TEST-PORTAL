import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

export const TEST_MONGO_URI =
  process.env.TEST_MONGODB_URI ?? 'mongodb://127.0.0.1:27017/swap2k26_test';

export default async function globalSetup(): Promise<void> {
  if (!process.env.TEST_MONGODB_URI) {
    const mongod = await MongoMemoryServer.create();
    process.env.TEST_MONGODB_URI = mongod.getUri('swap2k26_test');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(process.env.TEST_MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  // Clean slate before the test run
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  await mongoose.disconnect();
}