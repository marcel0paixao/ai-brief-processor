import { UserRole } from '@ai-brief/shared';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { Tenant } from './tenant.schema';

export { UserRole } from '@ai-brief/shared';
export type UserDocument = HydratedDocument<User>;

@Schema({ collection: 'users', timestamps: true, versionKey: false })
export class User {
  @Prop({ required: true, trim: true, minlength: 2, maxlength: 100 })
  name!: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({
    type: SchemaTypes.ObjectId,
    ref: Tenant.name,
    required: true,
  })
  tenantId!: Types.ObjectId;

  @Prop({ type: String, enum: UserRole, required: true })
  role!: UserRole;

  @Prop({ type: Boolean, default: true, required: true })
  isActive!: boolean;

  @Prop({ type: Date, required: false })
  lastLoginAt?: Date;

  createdAt!: Date;
  updatedAt!: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ tenantId: 1, role: 1 });
UserSchema.index({ tenantId: 1, createdAt: -1 });
