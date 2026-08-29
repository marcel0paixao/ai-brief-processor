import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum BriefStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

@Schema({ _id: false })
export class BriefAnalysisResult {
  @Prop({ required: true, trim: true })
  summary!: string;

  @Prop({ required: true, trim: true })
  mainObjective!: string;

  @Prop({ type: [String], required: true })
  targetAudience!: string[];

  @Prop({ type: [String], required: true })
  communicationPillars!: string[];

  @Prop({ type: [String], required: true })
  suggestedActions!: string[];

  @Prop({ type: [String], required: true })
  risks!: string[];
}

export const BriefAnalysisResultSchema =
  SchemaFactory.createForClass(BriefAnalysisResult);

@Schema({ _id: false })
export class BriefProcessingError {
  @Prop({ required: true, trim: true })
  code!: string;

  @Prop({ required: true, trim: true })
  message!: string;

  @Prop({ required: true })
  retryable!: boolean;
}

export const BriefProcessingErrorSchema =
  SchemaFactory.createForClass(BriefProcessingError);

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

  @Prop({
    type: BriefAnalysisResultSchema,
    required: false,
  })
  result?: BriefAnalysisResult;

  @Prop({
    type: BriefProcessingErrorSchema,
    required: false,
  })
  error?: BriefProcessingError;

  @Prop({
    type: Number,
    default: 0,
    min: 0,
    required: true,
  })
  attemptCount!: number;

  @Prop({ type: Date, required: false })
  processingStartedAt?: Date;

  @Prop({ type: Date, required: false })
  completedAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const BriefSchema = SchemaFactory.createForClass(Brief);

BriefSchema.index({ createdAt: -1 });
