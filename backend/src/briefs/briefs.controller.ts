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
} from '@nestjs/common';
import { BriefsService } from './briefs.service';
import { BriefIdParamDto } from './dto/brief-id-param.dto';
import {
  BriefDetailDto,
  BriefListItemDto,
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
  ): Promise<CreateBriefResponseDto> {
    return this.briefsService.create(createBriefDto);
  }

  @Get()
  findAll(): Promise<BriefListItemDto[]> {
    return this.briefsService.findAll();
  }

  @Get(':id')
  findOne(@Param() { id }: BriefIdParamDto): Promise<BriefDetailDto> {
    return this.briefsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param() { id }: BriefIdParamDto,
    @Body() updateBriefDto: UpdateBriefDto,
  ): Promise<BriefDetailDto> {
    return this.briefsService.update(id, updateBriefDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param() { id }: BriefIdParamDto): Promise<void> {
    return this.briefsService.remove(id);
  }
}
