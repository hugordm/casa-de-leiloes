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
