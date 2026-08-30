import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { Model } from 'mongoose';
import { AuthenticatedUser } from '../authenticated-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Tenant } from '../schemas/tenant.schema';
import { User } from '../schemas/user.schema';

interface AccessTokenPayload {
  sub: string;
}

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<Tenant>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) throw this.unauthorized();

    try {
      const payload =
        await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      const user = await this.userModel
        .findOne({ _id: payload.sub, isActive: true })
        .exec();

      if (!user) throw this.unauthorized();

      const tenant = await this.tenantModel.findById(user.tenantId).exec();
      if (!tenant) throw this.unauthorized();

      request.user = {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: tenant._id.toString(),
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
      };

      return true;
    } catch {
      throw this.unauthorized();
    }
  }

  private extractBearerToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type?.toLowerCase() === 'bearer' ? token : undefined;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'UNAUTHORIZED',
      message: 'Authentication is required or the session has expired.',
    });
  }
}
