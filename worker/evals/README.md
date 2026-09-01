# Casos de avaliação do briefing

Este conjunto pequeno evita transformar o desafio em uma plataforma de evals.
O teste automatizado verifica somente o gate determinístico anterior ao LLM.

`providerExpectation` serve como roteiro de revisão manual quando o modelo ou o
prompt mudar. A revisão deve conferir grounding, ausência de fatos inventados e
o uso correto de `INSUFFICIENT_BRIEF`. Ela não roda automaticamente para não
consumir a cota gratuita do OpenRouter nem tornar a suíte instável.
