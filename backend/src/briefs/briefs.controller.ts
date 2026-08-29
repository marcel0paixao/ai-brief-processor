import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { BriefsService, CreateBriefResult } from './briefs.service';
import { CreateBriefDto } from './dto/create-brief.dto';

@Controller('briefs')
export class BriefsController {
  constructor(private readonly briefsService: BriefsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  create(@Body() createBriefDto: CreateBriefDto): Promise<CreateBriefResult> {
    return this.briefsService.create(createBriefDto);
  }
}
