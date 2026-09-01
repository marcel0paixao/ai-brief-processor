# AI Brief Processor

Aplicação do desafio técnico Full Stack Developer — Platform & AI da Maestria.

Esta documentação descreve o estado atual e executável do projeto.

## Estado atual

Já estão disponíveis:

- API NestJS com criação e CRUD de briefs;
- autenticação por e-mail e senha com hash `scrypt` e sessão JWT;
- RBAC com os papéis `ADMIN` e `MEMBER`;
- multi-tenancy com tenant resolvido no servidor e isolamento em todas as consultas;
- persistência de briefs e status no MongoDB;
- publicação de jobs no BullMQ;
- Redis com persistência AOF;
- contratos compartilhados entre API e worker;
- frontend funcional com login, criação de workspace, gestão de equipe, filtros,
  paginação, criação, detalhe, edição administrativa, retry e atualização em
  tempo real com fallback de polling;
- frontend, backend e worker como serviços Docker separados;
- consumidor BullMQ com OpenRouter, timeout, validação de schema, retries e
  persistência de erros classificados;
- testes unitários e end-to-end do backend e testes unitários do worker.

## Arquitetura atual

```text
React/Vite + Nginx
    |
    | /api
    v
NestJS API ----> MongoDB
    |
    | job { briefId, tenantId }
    v
Redis/BullMQ ----> Node.js Worker
                         |
                         +----> OpenRouter / LLM
                         |
                         +----> Redis Pub/Sub ----> NestJS WebSocket
                                                       |
                                                       v
                                                  React UI
```

O MongoDB armazena tenants, usuários, briefs, status, resultado e erro. O Redis
transporta os identificadores do brief e do tenant. O cliente nunca informa o
tenant nas operações: a API sempre o deriva do usuário autenticado.

## Stack

- Frontend: React, Vite, TypeScript e Tailwind CSS
- API: NestJS e TypeScript
- Worker: Node.js, TypeScript, BullMQ e Mongoose
- Dados: MongoDB
- Fila: BullMQ e Redis
- LLM: OpenRouter, com modelo configurável por ambiente
- Monorepo: NPM Workspaces
- Infraestrutura local: Docker Compose

## Estrutura

```text
frontend/            aplicação React + Vite, autenticação e imagem Nginx
backend/             API HTTP NestJS, JWT, RBAC e escopo multi-tenant
worker/              consumidor BullMQ, integração LLM e persistência de estado
shared/              contratos de domínio e da fila
docker-compose.yml   MongoDB, Redis, backend e worker
```

O pacote `shared` não possui dependências de NestJS, Mongoose ou BullMQ. Ele contém apenas nomes da fila/job, payload do job, estados e formatos compartilhados.

## Pré-requisitos

Ambiente usado durante o desenvolvimento:

- WSL 2 com Debian 13
- Node.js 22.23.2 via nvm
- npm 10.9.8
- Docker Desktop com integração ao WSL habilitada

Na raiz do projeto:

```bash
nvm use
```

## Inicialização completa com Docker

Este modo inicia frontend, MongoDB, Redis, API e worker.

Na primeira execução, prepare o ambiente. O comando preserva valores existentes,
cria arquivos ausentes e gera `JWT_SECRET` sem exibir seu valor:

```bash
npm run env:setup
npm run docker:up
```

Confira os serviços:

```bash
docker compose ps
npm run docker:logs
```

- Frontend: <http://localhost:5173>
- API: <http://localhost:3000>

No container, o Nginx do frontend encaminha `/api` para o backend. Assim, o
navegador acessa a interface e a API pela mesma origem.

Para encerrar toda a stack Docker:

```bash
npm run docker:down
```

Escolha entre a stack Docker ou os processos diretos no WSL. Executar os dois
modos ao mesmo tempo causa conflito nas portas `3000` e `5173`.

## Desenvolvimento no WSL

Instale as dependências:

```bash
npm install
```

Crie os arquivos locais de ambiente na primeira execução:

```bash
npm run env:setup
```

Inicie somente MongoDB e Redis:

```bash
npm run infra:up
```

Depois execute cada processo em um terminal separado:

```bash
npm run dev:backend
npm run dev:worker
npm run dev:frontend
```

- API: <http://localhost:3000>
- Frontend: <http://localhost:5173>
- MongoDB: `localhost:27017`
- Redis: `localhost:6379`

O comando `dev:worker` inicia o consumidor BullMQ, que processa os briefs com o
OpenRouter e persiste o resultado validado no MongoDB.

Para encerrar somente a infraestrutura:

```bash
npm run infra:down
```

## Variáveis de ambiente

`npm run env:setup` cria e preserva arquivos separados por responsabilidade:

- `.env`: valores gerais usados pelo Docker Compose;
- `backend/.env`: autenticação e conexões do backend no modo de desenvolvimento;
- `worker/.env`: OpenRouter, timeout e concorrência do worker em qualquer modo;
- `frontend/.env`: URL da API usada pelo Vite.

O worker local carrega `worker/.env` para as opções exclusivas de IA e o `.env`
da raiz para MongoDB e Redis. O arquivo do worker é carregado primeiro, sem
sobrescrever variáveis já definidas pelo sistema. No Docker, o Compose injeta
`worker/.env` por meio de `env_file` e fornece as conexões internas dos serviços
separadamente. Assim, nenhuma variável é repetida entre os dois arquivos.

Configuração geral e do backend:

```env
MONGODB_URI=mongodb://localhost:27017/ai_brief_processor
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
JWT_SECRET=replace-with-a-long-random-secret
JWT_EXPIRES_IN_SECONDS=28800
VITE_API_URL=http://localhost:3000
```

Configuração exclusiva de `worker/.env`:

```env
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
LLM_TIMEOUT_MS=30000
WORKER_CONCURRENCY=2
```

Dentro do Compose, os hosts são os nomes dos serviços:

```env
MONGODB_URI=mongodb://mongodb:27017/ai_brief_processor
REDIS_HOST=redis
```

Nenhuma chave real deve ser enviada ao repositório.

Em produção, `JWT_SECRET` é obrigatório. Use um valor longo, aleatório e
exclusivo por ambiente. Alterar esse segredo invalida todas as sessões ativas.

## Autenticação, papéis e tenants

O cadastro público (`POST /auth/register`) cria atomicamente do ponto de vista
da aplicação um tenant e seu primeiro administrador. Em caso de falha ao criar
o usuário, o tenant recém-criado é compensado e removido. O login retorna um
Bearer token com validade configurável; `GET /auth/me` restaura a sessão.

O token contém somente o identificador do usuário. Em cada request, a API busca
o usuário ativo e seu tenant no MongoDB. Portanto, mudanças de papel e
desativação têm efeito imediato, sem confiar em `tenantId` ou `role` enviados
pelo navegador.

Permissões atuais:

| Operação | MEMBER | ADMIN |
| --- | :---: | :---: |
| Criar, listar e consultar briefs do tenant | Sim | Sim |
| Editar ou excluir briefs do tenant | Não | Sim |
| Listar, criar, promover e desativar usuários | Não | Sim |

O administrador não pode desativar nem rebaixar a própria conta. Usuários e
briefs de outro tenant não são retornados, inclusive quando um ID válido é
informado diretamente.

### Endpoints principais

```text
POST   /auth/register       cria tenant + primeiro ADMIN
POST   /auth/login          autentica por e-mail e senha
GET    /auth/me             retorna a sessão atual
GET    /users               lista usuários do tenant (ADMIN)
POST   /users               cria usuário no tenant (ADMIN)
PATCH  /users/:id           altera papel/estado/nome (ADMIN)
POST   /briefs              cria e agenda um brief
GET    /briefs              lista filtrada e paginada
GET    /briefs/:id          detalhe do tenant atual
POST   /briefs/:id/retry    reenvia falha recuperável ou brief insuficiente corrigido
PATCH  /briefs/:id          edição (ADMIN)
DELETE /briefs/:id          exclusão (ADMIN)
```

`GET /briefs` aceita `search`, `status`, `dateFrom`, `dateTo`, `sortBy`,
`sortOrder`, `page` e `limit` (máximo 50). A resposta inclui totais por status e
metadados de paginação.

### Teste de falhas do worker no Docker

Alterações em `worker/.env` exigem recriar o container. `docker compose restart`
reinicia o mesmo container e não relê o `env_file`; use:

```bash
docker compose up -d --force-recreate --no-deps worker
docker compose exec -T worker printenv LLM_TIMEOUT_MS
```

O último comando confere apenas o timeout. Nunca imprima
`OPENROUTER_API_KEY` no terminal ou nos logs.

Um `docker compose stop worker` envia `SIGTERM`. O encerramento é gracioso e
aguarda a chamada ativa; portanto, essa chamada ainda pode terminar ou atingir
o timeout configurado. Para simular crash no cenário 12.6, use somente em
ambiente de teste:

```bash
docker compose kill --signal KILL worker
docker compose up -d worker
```

Nesse caso, o BullMQ retoma o job depois que o lock expira e o identifica como
stalled. O botão **Tentar novamente** aparece no detalhe apenas para erros
persistidos com `retryable: true`.

## Comandos

```bash
npm run build          # build de shared, backend, worker e frontend
npm run lint           # valida os quatro workspaces
npm test               # testes unitários do backend
npm run test:e2e       # testes HTTP com MongoDB e Redis ativos
npm run env:setup      # cria .envs e gera JWT_SECRET sem sobrescrever valores

npm run infra:up       # inicia apenas MongoDB e Redis
npm run infra:logs
npm run infra:down

npm run docker:up      # constrói e inicia frontend, backend, worker, MongoDB e Redis
npm run docker:logs
npm run docker:down
```

## Decisões e trade-offs atuais

### API em NestJS e worker em Node.js

NestJS foi mantido na API por causa de controllers, DTOs, validação, módulos e injeção de dependências.

O worker usa Node.js e BullMQ diretamente. Para um único fluxo assíncrono, isso deixa criação do consumidor, conexões e encerramento mais explícitos e evita módulos e decorators Nest que não trariam valor suficiente.

### API e worker separados

Backend e worker possuem pacotes, builds, imagens e ciclos de vida próprios. Isso permite reinício e escala independentes.

O custo é manter mais um workspace e decidir conscientemente quais contratos pertencem ao `shared`.

### Persistência antes da fila

A API grava o brief no MongoDB antes de publicar seu ID no Redis. Assim o worker sempre recebe uma referência a um registro existente.

MongoDB e Redis não participam da mesma transação. Uma queda da API entre as duas operações pode deixar um brief `PENDING` sem job. Uma solução futura pode usar reconciliação ou Transactional Outbox; isso não está implementado.

### Sessão e isolamento multi-tenant

A autenticação usa access token JWT com duração padrão de oito horas. O logout
remove o token do navegador; não há refresh token persistido. Recuperação de
senha e convites por e-mail exigiriam um provedor de e-mail e ficam fora do
escopo atual.

O isolamento é feito por chave de tenant em todas as queries de briefs e
usuários, além de índices compostos por `tenantId`. IDs de tenant recebidos do
cliente são rejeitados pela validação global da API.

### Docker e desenvolvimento local

Docker Compose oferece uma execução reproduzível de frontend, API, worker,
MongoDB e Redis. O frontend também pode rodar pelo Vite durante o desenvolvimento.

## Worker

O worker consome a fila BullMQ, aplica transições atômicas por brief e tenant,
chama o OpenRouter com timeout, valida o envelope e o resultado com Zod e
persiste erros estáveis. Erros temporários usam as três tentativas da fila;
erros de autenticação ou requisição são encerrados sem chamadas adicionais.
Registros `COMPLETED` são terminais, e atualizações tardias não conseguem
substituir o resultado persistido.

### Observabilidade

Cada job usa o próprio `briefId` como `jobId`, o que permite correlacionar API,
BullMQ, MongoDB e interface sem um identificador paralelo. A API registra a
publicação e a republicação na fila; o worker registra início, conclusão,
falha de tentativa e job stalled com `jobId`, `briefId`, `tenantId`, tentativa,
limite de tentativas, próximo estado e código/mensagem de erro quando aplicável.
Os logs nunca incluem o texto do briefing, respostas do LLM ou segredos.

No produto, o detalhe exibe status, quantidade de tentativas e o erro persistido
(`code`, `message` e `retryable`). Assim, o mesmo erro fica identificável tanto
para o usuário quanto para quem opera a stack com `npm run docker:logs`.

Para produção, os próximos passos seriam emitir JSON em linha para um coletor,
adicionar métricas de duração/taxa de falha por código e tracing distribuído.
Esses itens são conscientemente deixados fora do escopo local do desafio.

### Prompt, grounding e briefings insuficientes

O prompt separa instruções de sistema do título e do briefing delimitados,
trata o conteúdo enviado pelo usuário como dado não confiável e proíbe inventar
público, pilares, canais, métricas ou atributos. A temperatura é `0.2`, e o
provider recebe um JSON Schema estrito que depois é validado novamente com Zod.

O resultado é discriminado por `outcome`:

- `ANALYZED` contém resumo, objetivo, público, pilares, ações e riscos;
- `INSUFFICIENT_BRIEF` contém somente o motivo e as informações necessárias
  para tornar a entrada analisável.

Texto obviamente repetido ou sem diversidade mínima é recusado pela API e pelo
worker antes de consumir o provider. Conteúdo com palavras reconhecíveis, mas
sem contexto semântico suficiente, pode ser recusado pelo próprio modelo usando
`INSUFFICIENT_BRIEF`. Público e pilares podem ser listas vazias quando não
estiverem fundamentados; o schema não obriga o modelo a preenchê-los.

Structured output garante formato, não verdade factual. Em produção, a próxima
camada seria um conjunto versionado de avaliações de grounding e utilidade,
monitoramento da taxa de recusas e revisão periódica do prompt/modelo. RAG ou
checagem factual independente só seria necessário se a análise dependesse de
fontes externas, o que não faz parte deste briefing livre.

## Uso de ferramentas de IA

O Codex foi usado de forma extensiva como apoio para scaffold, tarefas mecânicas, CRUD inicial, configuração de MongoDB/BullMQ, testes, Dockerfiles e reorganização dos workspaces.

As decisões de stack, uso de WSL/NPM, prioridade do fluxo básico, separação entre API e worker e substituição de NestJS por Node.js no worker foram tomadas pelo candidato. A implementação central do processor e as decisões de confiabilidade correspondentes permanecem sob responsabilidade do candidato.

## Frontend

A interface oferece:

- formulário com validações alinhadas aos DTOs da API;
- login, cadastro do primeiro workspace e restauração de sessão;
- navegação e ações condicionadas ao papel do usuário;
- gestão de usuários para administradores;
- lista com busca, status, período, ordenação, paginação e atualização periódica;
- lista e detalhe atualizados por WebSocket, isolados por tenant, com polling
  usado somente quando a conexão em tempo real está indisponível;
- visualização do resultado estruturado, erros persistidos e briefings
  considerados insuficientes;
- retry manual para falhas recuperáveis;
- execução local pelo Vite ou conteinerizada com Nginx.

## Limitações conhecidas

- não existe reconciliação para briefs sem job;
- não existe cancelamento de job quando um brief em processamento é alterado ou excluído;
- o worker ainda não possui healthcheck próprio.
- disponibilidade e rate limit do modelo gratuito do OpenRouter são externos à aplicação;
- não existe verificador factual independente para conteúdo externo ao briefing;
- não há refresh token, recuperação de senha ou envio de convites por e-mail;

O fluxo funcional de ponta a ponta e o retry manual estão implementados; os
itens acima permanecem como evoluções de confiabilidade e operação.
