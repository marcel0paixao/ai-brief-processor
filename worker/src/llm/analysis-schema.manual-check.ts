import { BriefAnalysisOutcome } from '@ai-brief/shared';
import { briefAnalysisSchema } from './analysis-schema';

const valid = {
  outcome: BriefAnalysisOutcome.ANALYZED,
  summary:
    'O briefing propõe o lançamento de uma solução para pequenas empresas que precisam simplificar sua rotina operacional. A comunicação deve demonstrar valor prático e confiança, mantendo as decisões de canal condicionadas às informações ainda ausentes.',
  mainObjective:
    'Apresentar a solução como uma alternativa simples e confiável para pequenas empresas, transformando seus benefícios operacionais em uma proposta de valor clara e capaz de orientar a campanha de lançamento.',
  targetAudience: ['Donos de pequenas empresas'],
  communicationPillars: [
    'Simplicidade — demonstrar como a solução reduz complexidade na rotina.',
    'Confiança — apresentar benefícios verificáveis sem promessas não sustentadas.',
  ],
  suggestedActions: [
    'Definir uma mensagem central que conecte a solução aos desafios operacionais descritos para pequenas empresas.',
    'Organizar os benefícios disponíveis em uma hierarquia de mensagens para orientar todas as peças da campanha.',
    'Criar um cronograma de lançamento com etapas de preparação, apresentação da solução e continuidade da comunicação.',
    'Validar orçamento, canais e métricas antes de transformar a estratégia em um plano de mídia definitivo.',
  ],
  risks: [
    'A ausência de orçamento impede dimensionar o alcance e priorizar formatos de comunicação viáveis.',
    'A falta de canais definidos dificulta adaptar mensagens e entregáveis aos contextos de distribuição.',
    'Sem métricas de sucesso, a equipe não consegue avaliar objetivamente o desempenho do lançamento.',
  ],
};

const missingField = {
  summary: valid.summary,
  targetAudience: valid.targetAudience,
  communicationPillars: valid.communicationPillars,
  suggestedActions: valid.suggestedActions,
  risks: valid.risks,
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
