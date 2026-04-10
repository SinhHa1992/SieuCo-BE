import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IDesign extends Document {
  name: string;
  thumbnailUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const designSchema = new Schema<IDesign>(
  {
    name: { type: String, required: true },
    thumbnailUrl: { type: String },
  },
  { timestamps: true }
);

export const Design: Model<IDesign> = mongoose.model<IDesign>('Design', designSchema);
