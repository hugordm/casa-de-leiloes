# Uso de IA no projeto

Registro, por fase, do que foi gerado com auxílio de IA (Claude Code) e do que foi revisado/ajustado por mim.

## Fase 1 — Setup

**Gerado com IA:**
- Estrutura do monorepo (`backend/`, `frontend/`), `.gitignore`, `docker-compose.yml` (PostgreSQL 16 na porta 5434).
- `backend/package.json` com scripts (`dev`, `start`, `db:migrate`, `db:seed`, etc.).
- `backend/prisma/schema.prisma` com os models User, Lot, Bid, Receipt, WalletTransaction e enums.
- Esqueleto Express: `src/app.js`, `src/server.js`, `src/config/env.js`, `src/lib/prisma.js`,
  `src/errors/AppError.js`, `src/middlewares/errorHandler.js`, rota `GET /health`.
- `backend/prisma/seed.js` básico (1 leiloeiro, 2 licitantes com saldo, lotes ao vivo/agendado/encerrado).
- Observação levantada pela IA: a API do Art Institute bloqueia requisições sem o cabeçalho
  `AIC-User-Agent` (desafio do Cloudflare) — será tratado na Fase 3.

**Revisado/ajustado por mim:**
- _(a preencher)_

## Fase 2 — Auth + middlewares + papéis

**Gerado com IA:**
- `src/services/auth.service.js`: cadastro (validação de nome/e-mail/senha/papel, hash bcrypt,
  e-mail duplicado → 409, inclusive em cadastros simultâneos via erro P2002 do Prisma) e login
  (mensagem única "E-mail ou senha inválidos" para não revelar e-mails cadastrados); geração do JWT.
- `src/middlewares/auth.js`: lê `Authorization: Bearer`, valida o JWT (algoritmo fixo HS256)
  e busca o usuário no banco (token de usuário inexistente é recusado).
- `src/middlewares/requireRole.js`: bloqueio por papel (403).
- `src/routes/auth.routes.js`: `POST /auth/register`, `POST /auth/login`, `GET /auth/me`.
- `src/routes/dev.routes.js`: rotas temporárias (fora de produção) para testar papéis com curl.
- Variáveis `JWT_SECRET` e `JWT_EXPIRES_IN` em `env.js`, `.env` e `.env.example`.
- Roteiro de testes manuais com curl (15 cenários: sucesso, validações, sem token, token
  adulterado/expirado, usuário inexistente, papel errado).

**Revisado/ajustado por mim:**
- _(a preencher)_
