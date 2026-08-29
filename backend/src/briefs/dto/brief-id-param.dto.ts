import { IsMongoId } from 'class-validator';

export class BriefIdParamDto {
  @IsMongoId()
  id!: string;
}
