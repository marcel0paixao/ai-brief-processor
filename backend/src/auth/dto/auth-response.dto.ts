import { UserRole } from '@ai-brief/shared';

export class SessionTenantDto {
  id!: string;
  name!: string;
  slug!: string;
}

export class SessionUserDto {
  id!: string;
  name!: string;
  email!: string;
  role!: UserRole;
  tenant!: SessionTenantDto;
}

export class AuthResponseDto {
  accessToken!: string;
  user!: SessionUserDto;
}
