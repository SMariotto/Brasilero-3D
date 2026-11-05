# Brasilero 3D num link só: o servidor da partida (WebSocket) + o site compilado (telão e controle), na mesma origem.
# O contexto do build é a RAIZ do repositório (a pasta projeto/):
#   docker build -f apps/server/Dockerfile -t brasilero3d .

# ---- Etapa 1: compila o site (precisa das dependências de desenvolvimento: Vite, TypeScript) ----
FROM node:24-slim AS site
WORKDIR /app

# Primeiro só os package.json: a instalação fica em cache enquanto as dependências não mudam.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci

COPY packages/core packages/core
COPY apps/web apps/web
RUN npm run build -w @b3d/web

# ---- Etapa 2: a imagem final, só com o que o servidor precisa para rodar ----
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787
# O servidor serve o site daqui: o telão, o controle e o WebSocket ficam no mesmo endereço (ORIGENS não é necessária).
ENV SITE_DIR=/app/apps/web/dist

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev -w @b3d/server

COPY packages/core packages/core
COPY apps/server apps/server
COPY --from=site /app/apps/web/dist apps/web/dist

EXPOSE 8787
USER node
# ORIGENS é opcional: só serve para deixar OUTRO site (por exemplo, o da Vercel) abrir o WebSocket deste servidor.
CMD ["node", "node_modules/tsx/dist/cli.mjs", "apps/server/src/index.ts"]
