import { UserRole } from '@ai-brief/shared';

export class UserResponseDto {
  id!: string;
  name!: string;
  email!: string;
  role!: UserRole;
  isActive!: boolean;
  lastLoginAt?: Date;
  createdAt!: Date;
  updatedAt!: Date;
}
