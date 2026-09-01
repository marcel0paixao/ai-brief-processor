import { assessBriefInputQuality } from '@ai-brief/shared';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface EvaluationCase {
  name: string;
  brief: string;
  preflightSufficient: boolean;
}

const cases = JSON.parse(
  readFileSync(new URL('../evals/brief-cases.json', import.meta.url), 'utf8'),
) as EvaluationCase[];

for (const evaluationCase of cases) {
  test(`gate de qualidade: ${evaluationCase.name}`, () => {
    const assessment = assessBriefInputQuality(evaluationCase.brief);
    assert.equal(assessment.sufficient, evaluationCase.preflightSufficient);
  });
}
