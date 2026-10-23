#!/bin/sh
# Subida da API no Docker: migrations → seed (só com banco vazio) → API.
set -e

echo "[docker] aplicando migrations..."
npx prisma migrate deploy

echo "[docker] seed (só na primeira subida, com o banco vazio)..."
SEED_IF_EMPTY=true node prisma/seed.js

echo "[docker] iniciando a API..."
exec node src/server.js
