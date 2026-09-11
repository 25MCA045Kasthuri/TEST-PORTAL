import { afterAll, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { TEST_MONGO_URI } from './globalSetup';

process.env.PASSWORD_BCRYPT_ROUNDS = process.env.PASSWORD_BCRYPT_ROUNDS || '4';
process.env.AUTH_RATE_LIMIT = process.env.AUTH_RATE_LIMIT || String(Number.MAX_SAFE_INTEGER);
process.env.CANDIDATE_LOGIN_RATE_LIMIT = process.env.CANDIDATE_LOGIN_RATE_LIMIT || String(Number.MAX_SAFE_INTEGER);

beforeAll(async () => {
  mongoose.set('strictQuery', true);
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  }
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});