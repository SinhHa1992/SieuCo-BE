import mongoose, { Schema, Document, Model } from 'mongoose';



export interface IDealLinkedContact {

  deviceContactId: string;

  displayName: string;

}



export interface IDeal extends Document {

  userEmail: string;

  transcript: string;

  nguoiQuyetDinh: string;

  nhuCau: string;

  nganSach: number | null;

  timeline: string;

  status: string;

  linkedContacts: IDealLinkedContact[];

  /** @deprecated use linkedContacts; kept for legacy documents */

  contactDeviceId?: string;

  contactName?: string;

  createdAt: Date;

  updatedAt: Date;

}



const linkedContactSchema = new Schema<IDealLinkedContact>(

  {

    deviceContactId: { type: String, required: true },

    displayName: { type: String, default: '' },

  },

  { _id: false }

);



const dealSchema = new Schema<IDeal>(

  {

    userEmail: { type: String, required: true, index: true },

    transcript: { type: String, default: '' },

    nguoiQuyetDinh: { type: String, default: '' },

    nhuCau: { type: String, default: '' },

    nganSach: { type: Number, default: null },

    timeline: { type: String, default: '' },

    status: { type: String, default: 'follow' },

    linkedContacts: { type: [linkedContactSchema], default: [] },

    contactDeviceId: { type: String, default: '' },

    contactName: { type: String, default: '' },

  },

  { timestamps: true }

);



export const Deal: Model<IDeal> = mongoose.model<IDeal>('Deal', dealSchema);

