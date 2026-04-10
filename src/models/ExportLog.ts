import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IExportLog extends Document {
  format: string;
  scale: number;
  quality: number;
  createdAt: Date;
}

const exportLogSchema = new Schema<IExportLog>(
  {
    format: { type: String, required: true },
    scale: { type: Number, required: true },
    quality: { type: Number, required: true },
  },
  { timestamps: true }
);

export const ExportLog: Model<IExportLog> = mongoose.model<IExportLog>('ExportLog', exportLogSchema);
