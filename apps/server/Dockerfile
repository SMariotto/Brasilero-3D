# Servidor da partida do Brasilero 3D (só o servidor, sem o site).
# O contexto do build é a RAIZ do repositório (a pasta projeto/):
#   docker build -f apps/server/Dockerfile -t brasilero3d-servidor .
FROM node:24-slim

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8787

# Primeiro só os package.json: a instalação das dependências fica em cache enquanto elas não mudam.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev -w @b3d/server

COPY packages/core packages/core
COPY apps/server apps/server

EXPOSE 8787
USER node
# ORIGENS (obrigatória em produção): os sites que podem abrir o WebSocket, por exemplo https://brasilero3d.vercel.app
CMD ["node", "node_modules/tsx/dist/cli.mjs", "apps/server/src/index.ts"]
