# AI Brief Processor

Aplicação do desafio técnico Full Stack Developer — Platform & AI da Maestria.

## Estado atual

Este repositório contém somente o scaffold inicial e a infraestrutura local. As funcionalidades de criação, processamento e consulta de análises ainda não foram implementadas.

## Ambiente-alvo

- WSL 2 com Debian 13
- Node.js 22.23.2 via nvm
- npm 10.9.8
- Docker Desktop com integração ao WSL habilitada

## Stack definida

- Frontend: React, Vite, TypeScript e Tailwind CSS
- Backend: NestJS e TypeScript
- Dados: MongoDB
- Processamento assíncrono: BullMQ e Redis
- LLM: OpenRouter, com modelo configurável por variável de ambiente

## Estrutura

```text
frontend/           aplicação React + Vite
backend/            API e worker NestJS
docker-compose.yml  MongoDB e Redis locais
```

## Preparação inicial no WSL

```bash
nvm use
npm install
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
npm run infra:up
```

Execute frontend e backend em terminais separados:

```bash
npm run dev:backend
npm run dev:frontend
```

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:3000>

## Comandos disponíveis

```bash
npm run build
npm run lint
npm test
npm run test:e2e
npm run infra:logs
npm run infra:down
```

O README será ampliado conforme as decisões e funcionalidades forem implementadas e validadas.
