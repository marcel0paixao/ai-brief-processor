import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateBriefDto } from './dto/create-brief.dto';
import { Brief, BriefDocument, BriefStatus } from './schemas/brief.schema';

export interface CreateBriefResult {
  id: string;
  status: BriefStatus;
}

@Injectable()
export class BriefsService {
  constructor(
    @InjectModel(Brief.name)
    private readonly briefModel: Model<BriefDocument>,
  ) {}

  async create(createBriefDto: CreateBriefDto): Promise<CreateBriefResult> {
    const createdBrief = await this.briefModel.create({
      ...createBriefDto,
      status: BriefStatus.PENDING,
    });

    return {
      id: createdBrief._id.toString(),
      status: createdBrief.status,
    };
  }
}
