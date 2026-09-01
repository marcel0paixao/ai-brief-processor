import { Transform } from 'class-transformer';
import { IsString, Length, ValidateIf } from 'class-validator';
import { IsMeaningfulBrief } from './is-meaningful-brief.validator';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateBriefDto {
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @Length(3, 120)
  title?: string;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @Transform(trimString)
  @IsString()
  @Length(20, 10_000)
  @IsMeaningfulBrief()
  brief?: string;
}
