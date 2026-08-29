# AI Brief Processor

Aplicação do desafio técnico Full Stack Developer — Platform & AI da Maestria.

Esta documentação descreve o estado atual do projeto. O fluxo de processamento por LLM ainda não está concluído.

## Estado atual

Já estão disponíveis:

- API NestJS com criação e CRUD de briefs;
- persistência de briefs e status no MongoDB;
- publicação de jobs no BullMQ;
- Redis com persistência AOF;
- contratos compartilhados entre API e worker;
- backend e worker como serviços Docker separados;
- testes unitários e end-to-end do backend.

O workspace do worker é intencionalmente apenas um scaffold Node.js. Ele inicia, conecta ao MongoDB e encerra a conexão de forma graciosa, mas ainda não registra um consumidor BullMQ. Enquanto essa implementação não existir, jobs publicados pela API permanecem aguardando no Redis e briefs permanecem em `PENDING`.

## Arquitetura atual

```text
React/Vite
    |
    | HTTP
    v
NestJS API ----> MongoDB
    |
    | job { briefId }
    v
Redis/BullMQ ----> Node.js Worker (processor pendente)
                         |
                         +----> LLM (integração pendente)
```

O MongoDB armazena o brief, status, resultado e erro. O Redis transporta apenas o identificador do brief.

## Stack

- Frontend: React, Vite, TypeScript e Tailwind CSS
- API: NestJS e TypeScript
- Worker: Node.js, TypeScript, BullMQ e Mongoose
- Dados: MongoDB
- Fila: BullMQ e Redis
- LLM planejado: OpenRouter, com modelo configurável por ambiente
- Monorepo: NPM Workspaces
- Infraestrutura local: Docker Compose

## Estrutura

```text
frontend/            aplicação React + Vite
backend/             API HTTP NestJS
worker/              processo Node.js separado; processor ainda pendente
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

Este modo inicia MongoDB, Redis, API e o scaffold do worker.

Na primeira execução, crie o arquivo de ambiente da raiz sem sobrescrever um arquivo já configurado:

```bash
cp -n .env.example .env
npm run docker:up
```

Confira os serviços:

```bash
docker compose ps
npm run docker:logs
```

A API ficará disponível em <http://localhost:3000>.

O frontend ainda é executado diretamente no WSL:

```bash
npm install
cp frontend/.env.example frontend/.env
npm run dev:frontend
```

Frontend: <http://localhost:5173>

Para encerrar toda a stack Docker:

```bash
npm run docker:down
```

Escolha entre backend no Docker ou backend direto no WSL. Executar os dois ao mesmo tempo causa conflito na porta `3000`.

## Desenvolvimento no WSL

Instale as dependências:

```bash
npm install
```

Crie os arquivos locais de ambiente na primeira execução:

```bash
cp -n backend/.env.example backend/.env
cp -n worker/.env.example worker/.env
cp -n frontend/.env.example frontend/.env
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

O comando `dev:worker` inicia apenas o scaffold. Ele não consome a fila até que o processor seja implementado.

Para encerrar somente a infraestrutura:

```bash
npm run infra:down
```

## Variáveis de ambiente

Principais variáveis:

```env
MONGODB_URI=mongodb://localhost:27017/ai_brief_processor
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_DB=0
OPENROUTER_API_KEY=
OPENROUTER_MODEL=openrouter/free
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
LLM_TIMEOUT_MS=30000
VITE_API_URL=http://localhost:3000
```

Dentro do Compose, os hosts são os nomes dos serviços:

```env
MONGODB_URI=mongodb://mongodb:27017/ai_brief_processor
REDIS_HOST=redis
```

Nenhuma chave real deve ser enviada ao repositório.

## Comandos

```bash
npm run build          # build de shared, backend, worker e frontend
npm run lint           # valida os quatro workspaces
npm test               # testes unitários do backend
npm run test:e2e       # testes HTTP com MongoDB e Redis ativos

npm run infra:up       # inicia apenas MongoDB e Redis
npm run infra:logs
npm run infra:down

npm run docker:up      # constrói e inicia backend, worker, MongoDB e Redis
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

### Docker e desenvolvimento local

Docker Compose oferece uma execução reproduzível da infraestrutura, API e worker. O frontend continua local para preservar um ciclo de desenvolvimento rápido.

## Worker: responsabilidades ainda pendentes

A implementação do worker deve definir e justificar:

1. criação da instância `Worker` do BullMQ;
2. acesso à collection de briefs;
3. transições `PENDING → PROCESSING → COMPLETED/FAILED`;
4. timeout e retries;
5. validação da resposta do LLM;
6. tratamento de execução duplicada;
7. recuperação após reinício;
8. logs e erros visíveis;
9. encerramento da conexão BullMQ;
10. testes do comportamento escolhido.

## Uso de ferramentas de IA

O Codex foi usado de forma extensiva como apoio para scaffold, tarefas mecânicas, CRUD inicial, configuração de MongoDB/BullMQ, testes, Dockerfiles e reorganização dos workspaces.

As decisões de stack, uso de WSL/NPM, prioridade do fluxo básico, separação entre API e worker e substituição de NestJS por Node.js no worker foram tomadas pelo candidato. A implementação central do processor e as decisões de confiabilidade correspondentes permanecem sob responsabilidade do candidato.

## Limitações conhecidas

- o worker ainda não consome jobs;
- não existe integração funcional com LLM;
- o frontend ainda não implementa o fluxo final;
- não existe endpoint manual de retry;
- não existe reconciliação para briefs sem job;
- o frontend não está no Compose;
- o worker ainda não possui healthcheck próprio.

A prioridade é concluir primeiro o fluxo funcional de ponta a ponta e somente depois avaliar bônus.
