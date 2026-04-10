import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/design_export';

export async function connectDB(): Promise<void> {
  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 15_000,
  });
  console.log('Connected to MongoDB');
}
