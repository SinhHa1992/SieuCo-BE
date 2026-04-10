import mongoose, { Schema, Document, Model } from 'mongoose';

export interface IContact extends Document {
  userEmail: string;
  deviceContactId: string;
  displayName: string;
  jobTitle: string;
  company: string;
  phones: string[];
  emails: string[];
  /** Google People `genders.value`: typically `male` | `female` | empty */
  gender: string;
  createdAt: Date;
  updatedAt: Date;
}

const contactSchema = new Schema<IContact>(
  {
    userEmail: { type: String, required: true, index: true },
    deviceContactId: { type: String, required: true },
    displayName: { type: String, required: true },
    jobTitle: { type: String, default: '' },
    company: { type: String, default: '' },
    phones: { type: [String], default: [] },
    emails: { type: [String], default: [] },
    gender: { type: String, default: '' },
  },
  { timestamps: true }
);

contactSchema.index({ userEmail: 1, deviceContactId: 1 }, { unique: true });

export const Contact: Model<IContact> = mongoose.model<IContact>('Contact', contactSchema);
