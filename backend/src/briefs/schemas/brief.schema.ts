import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum BriefStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export type BriefDocument = HydratedDocument<Brief>;

@Schema({
  collection: 'briefs',
  timestamps: true,
  versionKey: false,
})
export class Brief {
  @Prop({
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 120,
  })
  title!: string;

  @Prop({
    required: true,
    trim: true,
    minlength: 20,
    maxlength: 10_000,
  })
  brief!: string;

  @Prop({
    type: String,
    enum: BriefStatus,
    default: BriefStatus.PENDING,
    required: true,
  })
  status!: BriefStatus;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BriefSchema = SchemaFactory.createForClass(Brief);

BriefSchema.index({ createdAt: -1 });
