# Frontend

Interface React + Vite do AI Brief Processor.

## Funcionalidades

- lista de análises com status e atualização automática;
- login, cadastro de workspace e restauração de sessão JWT;
- isolamento visual por organização e navegação conforme o papel;
- busca, filtro por status/período, ordenação e paginação;
- gestão de usuários para administradores;
- criação de briefing com validações equivalentes às da API;
- detalhe com polling, edição e exclusão para administradores;
- exibição do resultado estruturado, do erro e dos metadados do job;
- layout responsivo e estados de carregamento, vazio e indisponibilidade.

## Desenvolvimento local

Com o backend disponível em `http://localhost:3000`:

```bash
cp -n frontend/.env.example frontend/.env
npm run dev:frontend
```

O Vite disponibiliza a interface em `http://localhost:5173`.

## Docker

A imagem usa Node.js para gerar o bundle e Nginx para servi-lo. No Compose, o
Nginx também encaminha `/api` para o serviço `backend`, evitando dependência de
um endereço de API conhecido pelo navegador.

```bash
npm run docker:up
```

Frontend: `http://localhost:5173`

## Variáveis

`VITE_API_URL` define a base pública da API. O desenvolvimento local usa
`http://localhost:3000`; a imagem Docker usa `/api` por padrão.
