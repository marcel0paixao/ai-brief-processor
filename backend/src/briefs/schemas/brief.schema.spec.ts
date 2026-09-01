import { deleteModel, model, Types } from 'mongoose';
import { BriefAnalysisOutcome } from '@ai-brief/shared';
import {
  Brief,
  BriefAnalysisResult,
  BriefSchema,
  BriefStatus,
} from './brief.schema';

const modelName = 'BriefSchemaTest';
const BriefModel = model<Brief>(modelName, BriefSchema);

const validInput = {
  title: 'Product launch campaign',
  brief: 'We need to introduce the new product to small business owners.',
  tenantId: new Types.ObjectId(),
  createdBy: new Types.ObjectId(),
};

const validResult: BriefAnalysisResult = {
  outcome: BriefAnalysisOutcome.ANALYZED,
  summary: 'A launch campaign focused on small businesses.',
  mainObjective: 'Introduce the product and generate qualified leads.',
  targetAudience: ['Small business owners'],
  communicationPillars: ['Simplicity', 'Productivity'],
  suggestedActions: ['Publish educational content', 'Run a product demo'],
  risks: ['Low initial awareness'],
};

describe('BriefSchema', () => {
  afterAll(() => {
    deleteModel(modelName);
  });

  it('sets the initial processing defaults', async () => {
    const brief = new BriefModel(validInput);

    await expect(brief.validate()).resolves.toBeUndefined();
    expect(brief.status).toBe(BriefStatus.PENDING);
    expect(brief.attemptCount).toBe(0);
    expect(brief.result).toBeUndefined();
    expect(brief.error).toBeUndefined();
  });

  it('accepts a complete structured result', async () => {
    const brief = new BriefModel({
      ...validInput,
      status: BriefStatus.COMPLETED,
      result: validResult,
      attemptCount: 1,
      processingStartedAt: new Date(),
      completedAt: new Date(),
    });

    await expect(brief.validate()).resolves.toBeUndefined();
  });

  it('rejects an incomplete structured result', async () => {
    const brief = new BriefModel({
      ...validInput,
      status: BriefStatus.COMPLETED,
      result: {
        summary: 'Incomplete result',
      },
    });

    await expect(brief.validate()).rejects.toThrow();
  });

  it('accepts a structured insufficient-brief result without invented fields', async () => {
    const brief = new BriefModel({
      ...validInput,
      status: BriefStatus.COMPLETED,
      result: {
        outcome: BriefAnalysisOutcome.INSUFFICIENT_BRIEF,
        reason:
          'The input contains random characters and cannot support a grounded analysis.',
        missingInformation: ['A comprehensible initiative description'],
      },
      attemptCount: 1,
      processingStartedAt: new Date(),
      completedAt: new Date(),
    });

    await expect(brief.validate()).resolves.toBeUndefined();
    expect(brief.result?.summary).toBeUndefined();
  });

  it('keeps legacy analyzed results readable without an outcome field', async () => {
    const legacyResult = {
      summary: validResult.summary,
      mainObjective: validResult.mainObjective,
      targetAudience: validResult.targetAudience,
      communicationPillars: validResult.communicationPillars,
      suggestedActions: validResult.suggestedActions,
      risks: validResult.risks,
    };
    const brief = new BriefModel({
      ...validInput,
      status: BriefStatus.COMPLETED,
      result: legacyResult,
      attemptCount: 1,
    });

    await expect(brief.validate()).resolves.toBeUndefined();
  });

  it('accepts a structured processing error', async () => {
    const brief = new BriefModel({
      ...validInput,
      status: BriefStatus.FAILED,
      error: {
        code: 'PROVIDER_TIMEOUT',
        message: 'The analysis provider did not respond in time.',
        retryable: true,
      },
      attemptCount: 3,
    });

    await expect(brief.validate()).resolves.toBeUndefined();
  });
});
