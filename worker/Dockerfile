FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
COPY worker/package.json worker/package.json

RUN npm ci

COPY shared shared
COPY worker worker

RUN npm run build --workspace shared && npm run build --workspace worker

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY shared/package.json shared/package.json
COPY worker/package.json worker/package.json

RUN npm ci --omit=dev --workspace shared --workspace worker

COPY --from=build --chown=node:node /app/shared/dist shared/dist
COPY --from=build --chown=node:node /app/worker/dist worker/dist

USER node

CMD ["node", "worker/dist/main.js"]
