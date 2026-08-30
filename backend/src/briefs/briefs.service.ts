import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, SortOrder as MongooseSortOrder, Types } from 'mongoose';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { BriefQueryDto, SortOrder } from './dto/brief-query.dto';
import {
  BriefAnalysisResultDto,
  BriefDetailDto,
  BriefListItemDto,
  BriefListResponseDto,
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

type BriefFilter = {
  tenantId: Types.ObjectId;
  status?: BriefStatus;
  $or?: Array<{ title: RegExp } | { brief: RegExp }>;
  createdAt?: { $gte?: Date; $lte?: Date };
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
    currentUser: AuthenticatedUser,
  ): Promise<CreateBriefResponseDto> {
    const tenantId = new Types.ObjectId(currentUser.tenantId);
    const createdBrief = await this.briefModel.create({
      ...createBriefDto,
      tenantId,
      createdBy: new Types.ObjectId(currentUser.id),
      status: BriefStatus.PENDING,
    });
    const briefId = createdBrief._id.toString();

    try {
      await this.briefsQueueService.enqueueAnalysis(
        briefId,
        currentUser.tenantId,
      );
    } catch {
      await this.briefModel
        .updateOne(
          { _id: createdBrief._id, tenantId },
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

    return { id: briefId, status: createdBrief.status };
  }

  async findAll(
    query: BriefQueryDto,
    currentUser: AuthenticatedUser,
  ): Promise<BriefListResponseDto> {
    const tenantId = new Types.ObjectId(currentUser.tenantId);
    const baseFilter = this.createBaseFilter(query, tenantId);
    const itemFilter: BriefFilter = query.status
      ? { ...baseFilter, status: query.status }
      : baseFilter;
    const direction: MongooseSortOrder =
      query.sortOrder === SortOrder.ASC ? 1 : -1;
    const skip = (query.page - 1) * query.limit;

    const [briefs, total, statusRows] = await Promise.all([
      this.briefModel
        .find(itemFilter)
        .select({ brief: 0, result: 0, error: 0 })
        .sort({ [query.sortBy]: direction })
        .skip(skip)
        .limit(query.limit)
        .exec(),
      this.briefModel.countDocuments(itemFilter).exec(),
      this.briefModel
        .aggregate<{ _id: BriefStatus; count: number }>([
          { $match: baseFilter },
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ])
        .exec(),
    ]);

    const statusCounts: Record<BriefStatus, number> = {
      PENDING: 0,
      PROCESSING: 0,
      COMPLETED: 0,
      FAILED: 0,
    };

    for (const row of statusRows) statusCounts[row._id] = row.count;

    return {
      items: briefs.map(toListItem),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
        statusCounts,
      },
    };
  }

  async findOne(
    id: string,
    currentUser: AuthenticatedUser,
  ): Promise<BriefDetailDto> {
    return toDetail(await this.findByIdOrThrow(id, currentUser.tenantId));
  }

  async update(
    id: string,
    updateBriefDto: UpdateBriefDto,
    currentUser: AuthenticatedUser,
  ): Promise<BriefDetailDto> {
    const changes: Partial<Pick<Brief, 'title' | 'brief'>> = {};

    if (updateBriefDto.title !== undefined)
      changes.title = updateBriefDto.title;
    if (updateBriefDto.brief !== undefined)
      changes.brief = updateBriefDto.brief;

    if (Object.keys(changes).length === 0) {
      throw new BadRequestException(
        'At least one of title or brief must be provided',
      );
    }

    const updatedBrief = await this.briefModel
      .findOneAndUpdate(
        { _id: id, tenantId: new Types.ObjectId(currentUser.tenantId) },
        { $set: changes },
        { returnDocument: 'after', runValidators: true },
      )
      .exec();

    if (!updatedBrief) throw new NotFoundException('Brief not found');

    return toDetail(updatedBrief);
  }

  async remove(id: string, currentUser: AuthenticatedUser): Promise<void> {
    const deletedBrief = await this.briefModel
      .findOneAndDelete({
        _id: id,
        tenantId: new Types.ObjectId(currentUser.tenantId),
      })
      .exec();

    if (!deletedBrief) throw new NotFoundException('Brief not found');
  }

  private createBaseFilter(
    query: BriefQueryDto,
    tenantId: Types.ObjectId,
  ): BriefFilter {
    const filter: BriefFilter = { tenantId };

    if (query.search) {
      const search = new RegExp(escapeRegExp(query.search), 'i');
      filter.$or = [{ title: search }, { brief: search }];
    }

    if (query.dateFrom || query.dateTo) {
      const createdAt: { $gte?: Date; $lte?: Date } = {};
      if (query.dateFrom) createdAt.$gte = new Date(query.dateFrom);
      if (query.dateTo) createdAt.$lte = new Date(query.dateTo);
      filter.createdAt = createdAt;
    }

    return filter;
  }

  private async findByIdOrThrow(
    id: string,
    tenantId: string,
  ): Promise<BriefDocument> {
    const brief = await this.briefModel
      .findOne({ _id: id, tenantId: new Types.ObjectId(tenantId) })
      .exec();

    if (!brief) throw new NotFoundException('Brief not found');
    return brief;
  }
}
