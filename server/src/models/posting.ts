import { Schema, model, Types } from 'mongoose';

const PostingSchema = new Schema(
  {
    opportunityId: { type: Schema.Types.ObjectId, ref: 'Opportunity', required: true, index: true },
    sourceName: { type: String, required: true },
    groupName: { type: String, required: true },
    vendorName: { type: String, default: null, select: false },
    vendorCompany: { type: String, default: null, select: false },
    rate: { type: Number, default: null, select: false },
    paymentDate: { type: Date, default: null, select: false },
    vendorPhone: { type: String, default: null, select: false },
    travel: { type: String, required: true, select: false },
    food: { type: String, required: true, select: false },
    stay: { type: String, required: true, select: false },
    deletedAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

PostingSchema.index({ opportunityId: 1, createdAt: -1 });

export interface PostingRecord {
  _id: Types.ObjectId;
  opportunityId: Types.ObjectId;
  sourceName: string;
  groupName: string;
  createdAt: Date;
}

export const Posting = model('Posting', PostingSchema);