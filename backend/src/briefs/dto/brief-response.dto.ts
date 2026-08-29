import { BriefStatus } from '../schemas/brief.schema';

export class CreateBriefResponseDto {
  id!: string;
  status!: BriefStatus;
}

export class BriefListItemDto {
  id!: string;
  title!: string;
  status!: BriefStatus;
  createdAt!: Date;
  updatedAt!: Date;
}

export class BriefDetailDto extends BriefListItemDto {
  brief!: string;
}
