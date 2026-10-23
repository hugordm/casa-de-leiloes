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

## Fase 3 — Catálogo + lotes + listagem

**Gerado com IA:**
- `src/services/catalog.service.js`: busca na API do Art Institute com `fetch` + timeout de 5s
  (`AbortSignal.timeout`), cabeçalho `AIC-User-Agent`, tratamento de timeout/rede/resposta não-JSON
  (502 com mensagem amigável) e obra inexistente (404). Converte para o formato do sistema.
- `src/services/lot.service.js`:
  - criação com validações (centavos inteiros, datas, duração 5 min–30 dias) e **snapshot**: o servidor
    busca a obra pelo `externalId` e copia título/artista/imagem/atributos (não confia no cliente);
  - cancelamento em transação com `SELECT ... FOR UPDATE` (dono, já cancelado, encerrado, com lances);
  - listagem com filtros `status`, `search`, `minPrice`/`maxPrice` (centavos, sobre o preço atual);
  - detalhe; serialização pública sem `leaderId`/`winnerId`.
- `src/utils/lot.js` (status exibido e lance mínimo) e `src/utils/validation.js`.
- `src/routes/catalog.routes.js` e `src/routes/lots.routes.js`; variáveis `AIC_API_URL` e `AIC_USER_AGENT`.
- Roteiro de testes com curl, incluindo timeout real (servidor apontado para IP que não responde)
  e vitrine funcionando com o catálogo fora do ar.

**Revisado/ajustado por mim:**
- _(a preencher)_

## Fase 4 — Lances + carteira + anti-sniping (com testes)

**Gerado com IA:**
- `src/services/bid.service.js`: `placeBid` em `prisma.$transaction` com `SELECT ... FOR UPDATE`
  no lote e no usuário (ordem fixa lote → usuário), validações na ordem do enunciado, criação do
  lance com `seq`/apelido/`prevHash`/`hash`, atualização do lote (lance atual, líder, contagem,
  `lastHash`, selo) e anti-sniping (+2 min se faltar menos de 2 min). `listMyBids` para `GET /me/bids`.
- `src/services/wallet.service.js`: comprometido calculado (soma dos lances liderados em lotes ACTIVE),
  disponível, extrato e depósito simulado com limites (transação + trava do usuário).
- `src/services/hashChain.service.js` (parte de geração): HMAC-SHA256 com `AUDIT_SECRET`,
  hash encadeado, selo do lote e apelido `Licitante #XXXXXX`. A verificação fica para a Fase 5.
- `src/middlewares/auth.js` refatorado: `auth` (obrigatório) e `optionalAuth` (sala do lote).
- `GET /lots/:id` com últimos lances (só apelidos), apelido do líder e bloco `me`
  (ganhando/superado, maior lance, posição) para licitante logado.
- Rotas `POST /lots/:id/bids`, `GET /wallet`, `POST /wallet/deposit`, `GET /me/bids`.
  Remoção das rotas temporárias `/dev/*`.
- `src/utils/money.js` (formatação R$ só para mensagens de erro).
- Testes Jest + Supertest em banco separado (`leiloes_test`, recriado a cada execução, com trava
  que impede rodar em banco que não termine em `_test`): 27 testes cobrindo lance aceito e corrente,
  todas as recusas, anti-sniping, liberação do comprometido, depósito, sala/privacidade e
  **concorrência** (validado removendo o `FOR UPDATE`: os testes de concorrência passam a falhar).

**Revisado/ajustado por mim:**
- _(a preencher)_
