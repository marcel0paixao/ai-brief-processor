import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BriefAnalysisOutcome } from '@ai-brief/shared';
import { briefAnalysisSchema } from '../src/llm/analysis-schema';

const deepAnalysis = {
  outcome: BriefAnalysisOutcome.ANALYZED,
  summary:
    'O briefing apresenta o lançamento de um veículo elétrico para jovens adultos, apoiado por sustentabilidade, tecnologia e mobilidade urbana. A análise deve transformar esses pilares em uma proposta coerente, mantendo decisões de execução condicionadas aos dados ainda não informados.',
  mainObjective:
    'Estruturar uma campanha de lançamento que apresente o veículo elétrico de forma relevante para jovens adultos e conecte seus três pilares declarados a uma mensagem clara, consistente e aplicável às futuras peças de comunicação.',
  targetAudience: ['Jovens adultos'],
  communicationPillars: [
    'Sustentabilidade — traduzir o tema em benefícios compreensíveis sem criar afirmações ambientais não comprovadas.',
    'Tecnologia — organizar as características confirmadas do veículo em uma narrativa acessível ao público definido.',
    'Mobilidade urbana — relacionar o lançamento ao contexto de deslocamento nas cidades sem presumir hábitos específicos.',
  ],
  suggestedActions: [
    'Definir uma mensagem central que conecte os três pilares ao lançamento e sirva como referência para todas as peças.',
    'Organizar um plano editorial com conteúdos separados para sustentabilidade, tecnologia e mobilidade urbana.',
    'Construir um cronograma de pré-lançamento e lançamento para setembro, indicando entregáveis e responsáveis por etapa.',
    'Solicitar orçamento, canais, abrangência geográfica e métricas antes de consolidar o plano de mídia da campanha.',
  ],
  risks: [
    'A ausência de orçamento impede estimar alcance, volume de produção e combinação de formatos compatíveis.',
    'Sem canais definidos, as mensagens podem não considerar corretamente linguagem, formato e jornada de distribuição.',
    'A falta de métricas de sucesso impede avaliar se o lançamento alcançou os resultados esperados pela equipe.',
  ],
};

test('aceita uma análise suficientemente profunda', () => {
  assert.equal(briefAnalysisSchema.safeParse(deepAnalysis).success, true);
});

test('rejeita resumo superficial', () => {
  const result = briefAnalysisSchema.safeParse({
    ...deepAnalysis,
    summary: 'Campanha de lançamento para um veículo elétrico.',
  });

  assert.equal(result.success, false);
});

test('exige pelo menos uma ação concreta', () => {
  const result = briefAnalysisSchema.safeParse({
    ...deepAnalysis,
    suggestedActions: [],
  });

  assert.equal(result.success, false);
});

test('exige pelo menos um risco fundamentado', () => {
  const result = briefAnalysisSchema.safeParse({
    ...deepAnalysis,
    risks: [],
  });

  assert.equal(result.success, false);
});

test('continua rejeitando campos adicionais', () => {
  const result = briefAnalysisSchema.safeParse({
    ...deepAnalysis,
    inventedInsight: 'Campo fora do contrato.',
  });

  assert.equal(result.success, false);
});

test('aceita resposta de briefing insuficiente sem inventar análise', () => {
  const result = briefAnalysisSchema.safeParse({
    outcome: BriefAnalysisOutcome.INSUFFICIENT_BRIEF,
    reason:
      'O conteúdo fornecido é composto por caracteres aleatórios e não permite identificar um contexto analisável.',
    missingInformation: [
      'Descrição compreensível da iniciativa ou problema',
      'Objetivo esperado para a análise',
    ],
  });

  assert.equal(result.success, true);
});

test('rejeita resposta insuficiente misturada com pilares inventados', () => {
  const result = briefAnalysisSchema.safeParse({
    outcome: BriefAnalysisOutcome.INSUFFICIENT_BRIEF,
    reason:
      'O conteúdo fornecido é composto por caracteres aleatórios e não permite identificar um contexto analisável.',
    missingInformation: ['Descrição compreensível da iniciativa'],
    communicationPillars: ['Clareza — manter uma mensagem consistente.'],
  });

  assert.equal(result.success, false);
});
