# Imagem da API (usada pelo docker-compose.yml da raiz).
FROM node:22-slim

# O Prisma precisa do OpenSSL para se conectar ao PostgreSQL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependências primeiro: enquanto o package*.json não mudar, o Docker reaproveita esta camada.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY docs ./docs
COPY docker-entrypoint.sh ./

EXPOSE 3333
CMD ["sh", "docker-entrypoint.sh"]
