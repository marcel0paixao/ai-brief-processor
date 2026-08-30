import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuthenticatedUser } from '../auth/authenticated-user';
import { hashPassword } from '../auth/password';
import { User, UserDocument, UserRole } from '../auth/schemas/user.schema';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

function toResponse(user: UserDocument): UserResponseDto {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async findAll(currentUser: AuthenticatedUser): Promise<UserResponseDto[]> {
    const users = await this.userModel
      .find({ tenantId: new Types.ObjectId(currentUser.tenantId) })
      .sort({ createdAt: 1 })
      .exec();

    return users.map(toResponse);
  }

  async create(
    createUserDto: CreateUserDto,
    currentUser: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    const emailExists = await this.userModel.exists({
      email: createUserDto.email,
    });

    if (emailExists) {
      throw new ConflictException({
        code: 'EMAIL_ALREADY_REGISTERED',
        message: 'An account with this email already exists.',
      });
    }

    const user = await this.userModel.create({
      name: createUserDto.name,
      email: createUserDto.email,
      passwordHash: await hashPassword(createUserDto.password),
      tenantId: new Types.ObjectId(currentUser.tenantId),
      role: createUserDto.role ?? UserRole.MEMBER,
      isActive: true,
    });

    return toResponse(user);
  }

  async update(
    id: string,
    updateUserDto: UpdateUserDto,
    currentUser: AuthenticatedUser,
  ): Promise<UserResponseDto> {
    if (Object.keys(updateUserDto).length === 0) {
      throw new BadRequestException('At least one change must be provided');
    }

    if (
      id === currentUser.id &&
      (updateUserDto.isActive === false ||
        updateUserDto.role === UserRole.MEMBER)
    ) {
      throw new BadRequestException({
        code: 'SELF_LOCKOUT_NOT_ALLOWED',
        message: 'You cannot deactivate or demote your own account.',
      });
    }

    const updatedUser = await this.userModel
      .findOneAndUpdate(
        {
          _id: id,
          tenantId: new Types.ObjectId(currentUser.tenantId),
        },
        { $set: updateUserDto },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updatedUser) throw new NotFoundException('User not found');

    return toResponse(updatedUser);
  }
}
