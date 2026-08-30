import { UserRole } from '@ai-brief/shared';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { BriefsService } from './briefs.service';
import { BriefIdParamDto } from './dto/brief-id-param.dto';
import { BriefQueryDto } from './dto/brief-query.dto';
import {
  BriefDetailDto,
  BriefListResponseDto,
  CreateBriefResponseDto,
} from './dto/brief-response.dto';
import { CreateBriefDto } from './dto/create-brief.dto';
import { UpdateBriefDto } from './dto/update-brief.dto';

@Controller('briefs')
export class BriefsController {
  constructor(private readonly briefsService: BriefsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @Body() createBriefDto: CreateBriefDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<CreateBriefResponseDto> {
    return this.briefsService.create(createBriefDto, currentUser);
  }

  @Get()
  findAll(
    @Query() query: BriefQueryDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<BriefListResponseDto> {
    return this.briefsService.findAll(query, currentUser);
  }

  @Get(':id')
  findOne(
    @Param() { id }: BriefIdParamDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<BriefDetailDto> {
    return this.briefsService.findOne(id, currentUser);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(
    @Param() { id }: BriefIdParamDto,
    @Body() updateBriefDto: UpdateBriefDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<BriefDetailDto> {
    return this.briefsService.update(id, updateBriefDto, currentUser);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param() { id }: BriefIdParamDto,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<void> {
    return this.briefsService.remove(id, currentUser);
  }
}
