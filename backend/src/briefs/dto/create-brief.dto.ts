import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

function trimString({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreateBriefDto {
  @Transform(trimString)
  @IsString()
  @Length(3, 120)
  title!: string;

  @Transform(trimString)
  @IsString()
  @Length(20, 10_000)
  brief!: string;
}
