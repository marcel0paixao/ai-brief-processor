import { briefAnalysisSchema } from './analysis-schema';

const valid = {
  summary: 'Resumo executivo do briefing.',
  mainObjective: 'Lancar o produto para PMEs.',
  targetAudience: ['Donos de pequenas empresas'],
  communicationPillars: ['Confianca', 'Simplicidade'],
  suggestedActions: ['Campanha de email'],
  risks: ['Prazo curto'],
};

const missingField = {
  summary: 'Resumo executivo do briefing.',
  targetAudience: ['Donos de pequenas empresas'],
  communicationPillars: ['Confianca'],
  suggestedActions: ['Campanha de email'],
  risks: ['Prazo curto'],
};

const extraField = {
  ...valid,
  unexpected: 'nao deveria passar',
};

const cases = [
  ['valid', valid],
  ['missingField (sem mainObjective)', missingField],
  ['extraField (unexpected)', extraField],
] as const;

for (const [name, value] of cases) {
  const result = briefAnalysisSchema.safeParse(value);
  console.log('---', name, '---');
  console.log('success:', result.success);
  if (!result.success) {
    console.log(
      'issues:',
      result.error.issues.map((issue) => ({
        path: issue.path,
        code: issue.code,
        message: issue.message,
      })),
    );
  }
}
