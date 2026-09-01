import { randomBytes } from 'node:crypto';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticatedUser } from './authenticated-user';
import {
  AuthResponseDto,
  SessionTenantDto,
  SessionUserDto,
} from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { hashPassword, verifyPassword } from './password';
import { Tenant, TenantDocument } from './schemas/tenant.schema';
import { User, UserDocument, UserRole } from './schemas/user.schema';

interface AccessTokenPayload {
  sub: string;
}

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Tenant.name) private readonly tenantModel: Model<Tenant>,
    private readonly jwtService: JwtService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const emailExists = await this.userModel.exists({
      email: registerDto.email,
    });

    if (emailExists) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists.',
      });
    }

    const tenant = await this.tenantModel.create({
      name: registerDto.tenantName,
      slug: this.createTenantSlug(registerDto.tenantName),
    });

    try {
      const user = await this.userModel.create({
        name: registerDto.name,
        email: registerDto.email,
        passwordHash: await hashPassword(registerDto.password),
        tenantId: tenant._id,
        role: UserRole.ADMIN,
        isActive: true,
      });

      return this.createAuthResponse(user, tenant);
    } catch (error) {
      await this.tenantModel.deleteOne({ _id: tenant._id }).exec();
      throw error;
    }
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.userModel
      .findOne({ email: loginDto.email, isActive: true })
      .select('+passwordHash')
      .exec();

    if (
      !user ||
      !(await verifyPassword(loginDto.password, user.passwordHash))
    ) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Email or password is invalid.',
      });
    }

    const tenant = await this.tenantModel.findById(user.tenantId).exec();

    if (!tenant) {
      throw new UnauthorizedException({
        code: 'TENANT_UNAVAILABLE',
        message:
          'The organization associated with this account is unavailable.',
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    return this.createAuthResponse(user, tenant);
  }

  async authenticateAccessToken(token: string): Promise<AuthenticatedUser> {
    try {
      const payload =
        await this.jwtService.verifyAsync<AccessTokenPayload>(token);
      const user = await this.userModel
        .findOne({ _id: payload.sub, isActive: true })
        .exec();

      if (!user) throw this.unauthorized();

      const tenant = await this.tenantModel.findById(user.tenantId).exec();
      if (!tenant) throw this.unauthorized();

      return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        tenantId: tenant._id.toString(),
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
      };
    } catch {
      throw this.unauthorized();
    }
  }

  getCurrentUser(user: AuthenticatedUser): SessionUserDto {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      tenant: {
        id: user.tenantId,
        name: user.tenantName,
        slug: user.tenantSlug,
      },
    };
  }

  private async createAuthResponse(
    user: UserDocument,
    tenant: TenantDocument,
  ): Promise<AuthResponseDto> {
    const accessToken = await this.jwtService.signAsync({
      sub: user._id.toString(),
    });

    const tenantDto: SessionTenantDto = {
      id: tenant._id.toString(),
      name: tenant.name,
      slug: tenant.slug,
    };

    return {
      accessToken,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        tenant: tenantDto,
      },
    };
  }

  private createTenantSlug(name: string): string {
    const normalizedName = name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50);
    const suffix = randomBytes(3).toString('hex');

    return `${normalizedName || 'tenant'}-${suffix}`;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'UNAUTHORIZED',
      message: 'Authentication is required or the session has expired.',
    });
  }
}
