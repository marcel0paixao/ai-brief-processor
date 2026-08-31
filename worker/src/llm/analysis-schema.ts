import type { BriefAnalysisResult } from '@ai-brief/shared';
import { z } from 'zod';

const summary = z
  .string()
  .min(160)
  .max(1_200)
  .describe(
    'Síntese executiva de 2 a 4 frases que conecte contexto, objetivo, público, proposta e limitações relevantes sem apenas copiar o briefing.',
  );

const mainObjective = z
  .string()
  .min(100)
  .max(700)
  .describe(
    'Objetivo principal em um parágrafo, formulado como resultado de comunicação ou negócio e fundamentado somente no briefing.',
  );

const audienceItem = z
  .string()
  .min(3)
  .max(280)
  .describe('Segmento de público explícito ou diretamente sustentado pelo briefing.');

const pillarItem = z
  .string()
  .min(15)
  .max(400)
  .describe('Território de mensagem acompanhado de uma justificativa breve.');

const actionItem = z
  .string()
  .min(50)
  .max(600)
  .describe(
    'Ação concreta iniciada por verbo, indicando o que produzir ou decidir e por que isso ajuda o objetivo.',
  );

const riskItem = z
  .string()
  .min(40)
  .max(600)
  .describe(
    'Uma única lacuna ou risco, acompanhado de seu impacto potencial; não combine riscos diferentes no mesmo item.',
  );

export const briefAnalysisSchema = z.strictObject({
  summary,
  mainObjective,
  targetAudience: z.array(audienceItem).min(1).max(6),
  communicationPillars: z.array(pillarItem).min(1).max(6),
  suggestedActions: z.array(actionItem).min(4).max(8),
  risks: z.array(riskItem).min(3).max(8),
}) satisfies z.ZodType<BriefAnalysisResult>;

export const briefAnalysisJsonSchema = z.toJSONSchema(briefAnalysisSchema);
