import { assessBriefInputQuality } from '@ai-brief/shared';
import { ValidateBy, type ValidationOptions } from 'class-validator';

export const IS_MEANINGFUL_BRIEF = 'isMeaningfulBrief';

export function IsMeaningfulBrief(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: IS_MEANINGFUL_BRIEF,
      validator: {
        validate: (value: unknown) =>
          typeof value === 'string' &&
          assessBriefInputQuality(value).sufficient,
        defaultMessage: () =>
          'O briefing deve conter palavras coerentes que descrevam uma iniciativa, contexto ou objetivo.',
      },
    },
    validationOptions,
  );
}
