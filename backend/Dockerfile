FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
COPY worker/package.json worker/package.json

RUN npm ci

COPY backend backend
COPY shared shared

RUN npm run build --workspace shared && npm run build --workspace backend

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
COPY worker/package.json worker/package.json

RUN npm ci --omit=dev --workspace shared --workspace backend

COPY --from=build --chown=node:node /app/shared/dist shared/dist
COPY --from=build --chown=node:node /app/backend/dist backend/dist

USER node

EXPOSE 3000

CMD ["node", "backend/dist/main.js"]
