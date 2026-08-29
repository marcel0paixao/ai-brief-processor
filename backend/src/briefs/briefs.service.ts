import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BriefAnalysisResultDto,
  BriefDetailDto,
  BriefListItemDto,
  BriefProcessingErrorDto,
  CreateBriefResponseDto,
} from './dto/brief-response.dto';
import { CreateBriefDto } from './dto/create-brief.dto';
import { UpdateBriefDto } from './dto/update-brief.dto';
import { BriefsQueueService } from './queue/briefs-queue.service';
import {
  Brief,
  BriefAnalysisResult,
  BriefDocument,
  BriefProcessingError,
  BriefStatus,
} from './schemas/brief.schema';

const queueUnavailableError: BriefProcessingError = {
  code: 'QUEUE_UNAVAILABLE',
  message: 'The brief could not be scheduled for processing.',
  retryable: true,
};

function toListItem(brief: BriefDocument): BriefListItemDto {
  return {
    id: brief._id.toString(),
    title: brief.title,
    status: brief.status,
    createdAt: brief.createdAt,
    updatedAt: brief.updatedAt,
  };
}

function toAnalysisResult(result: BriefAnalysisResult): BriefAnalysisResultDto {
  return {
    summary: result.summary,
    mainObjective: result.mainObjective,
    targetAudience: result.targetAudience,
    communicationPillars: result.communicationPillars,
    suggestedActions: result.suggestedActions,
    risks: result.risks,
  };
}

function toProcessingError(
  error: BriefProcessingError,
): BriefProcessingErrorDto {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  };
}

function toDetail(brief: BriefDocument): BriefDetailDto {
  return {
    ...toListItem(brief),
    brief: brief.brief,
    result: brief.result ? toAnalysisResult(brief.result) : undefined,
    error: brief.error ? toProcessingError(brief.error) : undefined,
    attemptCount: brief.attemptCount,
    processingStartedAt: brief.processingStartedAt,
    completedAt: brief.completedAt,
  };
}

@Injectable()
export class BriefsService {
  constructor(
    @InjectModel(Brief.name)
    private readonly briefModel: Model<Brief>,
    private readonly briefsQueueService: BriefsQueueService,
  ) {}

  async create(
    createBriefDto: CreateBriefDto,
  ): Promise<CreateBriefResponseDto> {
    const createdBrief = await this.briefModel.create({
      ...createBriefDto,
      status: BriefStatus.PENDING,
    });
    const briefId = createdBrief._id.toString();

    try {
      await this.briefsQueueService.enqueueAnalysis(briefId);
    } catch {
      await this.briefModel
        .updateOne(
          { _id: createdBrief._id },
          {
            $set: {
              status: BriefStatus.FAILED,
              error: queueUnavailableError,
            },
          },
        )
        .exec();

      throw new ServiceUnavailableException({
        code: queueUnavailableError.code,
        message: queueUnavailableError.message,
        briefId,
      });
    }

    return {
      id: briefId,
      status: createdBrief.status,
    };
  }

  async findAll(): Promise<BriefListItemDto[]> {
    const briefs = await this.briefModel
      .find()
      .select({ brief: 0 })
      .sort({ createdAt: -1 })
      .exec();

    return briefs.map(toListItem);
  }

  async findOne(id: string): Promise<BriefDetailDto> {
    const brief = await this.findByIdOrThrow(id);

    return toDetail(brief);
  }

  async update(
    id: string,
    updateBriefDto: UpdateBriefDto,
  ): Promise<BriefDetailDto> {
    const changes: Partial<Pick<Brief, 'title' | 'brief'>> = {};

    if (updateBriefDto.title !== undefined) {
      changes.title = updateBriefDto.title;
    }

    if (updateBriefDto.brief !== undefined) {
      changes.brief = updateBriefDto.brief;
    }

    if (Object.keys(changes).length === 0) {
      throw new BadRequestException(
        'At least one of title or brief must be provided',
      );
    }

    const updatedBrief = await this.briefModel
      .findByIdAndUpdate(
        id,
        { $set: changes },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updatedBrief) {
      throw new NotFoundException('Brief not found');
    }

    return toDetail(updatedBrief);
  }

  async remove(id: string): Promise<void> {
    const deletedBrief = await this.briefModel.findByIdAndDelete(id).exec();

    if (!deletedBrief) {
      throw new NotFoundException('Brief not found');
    }
  }

  private async findByIdOrThrow(id: string): Promise<BriefDocument> {
    const brief = await this.briefModel.findById(id).exec();

    if (!brief) {
      throw new NotFoundException('Brief not found');
    }

    return brief;
  }
}
