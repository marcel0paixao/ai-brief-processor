import { UserRole } from '@ai-brief/shared';

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
}
