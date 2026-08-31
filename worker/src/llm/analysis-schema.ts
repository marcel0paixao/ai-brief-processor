import type { BriefAnalysisResult } from '@ai-brief/shared';
import { z } from 'zod';

const nonEmptyText = z.string().min(1).max(4_000);
const nonEmptyList = z.array(nonEmptyText).min(1).max(12);

export const briefAnalysisSchema = z.strictObject({
    summary: nonEmptyText,
    mainObjective: nonEmptyText,
    targetAudience: nonEmptyList,
    communicationPillars: nonEmptyList,
    suggestedActions: nonEmptyList,
    risks: nonEmptyList,
}) satisfies z.ZodType<BriefAnalysisResult>;

export const briefAnalysisJsonSchema = z.toJSONSchema(
    briefAnalysisSchema,
);