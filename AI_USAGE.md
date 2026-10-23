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

## Fase 5 — Liquidação + comprovante + corrente de hashes + auditoria (com testes)

**Gerado com IA:**
- `src/services/settlement.service.js`: `settleLot` em transação com a mesma trava `FOR UPDATE` dos
  lances; após travar, reconfere status (idempotência) e `endsAt` (anti-sniping pode ter estendido);
  débito/crédito com `WalletTransaction` DEBIT/CREDIT, `Receipt` com código aleatório, lote SETTLED.
  `settleDueLots` (lote com erro não bloqueia os demais) e `settleIfDue` (sob demanda).
- `src/jobs/settlement.job.js`: roda na subida e a cada 15s, sem rodadas sobrepostas; iniciado só
  pelo `server.js` (nunca nos testes).
- `hashChain.verifyChain`: verificação pura da corrente (seq contíguo, prevHash, HMAC, autor via
  apelido, fim da corrente, selo e coerência do estado do lote). Selo gravado já na criação do lote.
- `src/services/audit.service.js`, `src/services/receipt.service.js`, `src/routes/public.routes.js`
  (`GET /audit/:lotId`, `GET /receipts/:code`), `GET /me/lots` (resultado + total recebido),
  `receiptCode` em `/me/bids` e estados `won`/`lost` na sala.
- `env.js`: `JWT_SECRET` e `AUDIT_SECRET` obrigatórios com no mínimo 16 caracteres.
- Seed refeito com o código real de hash e de liquidação (lote ao vivo de 30 dias com lances,
  lote que termina em 5 min, agendado e lote liquidado com comprovante), ids previsíveis.
- README inicial (execução, variáveis, seed/credenciais, testes, endpoints, regras e auditoria).
- Testes: `settlement.test.js` e `audit.test.js` (28 novos; 55 no total). Validados por mutação:
  removendo a reconferência do `endsAt`, a checagem de status, a trava do lote ou a verificação do
  selo, os testes correspondentes falham.

**Revisado/ajustado por mim:**
- _(a preencher)_

## Fase 6 — Front-end (React + Vite + React Router)

**Gerado com IA:**
- Projeto `frontend/` (Vite 7, React 19, React Router 7), `VITE_API_URL` com `.env.example`.
- `src/api/client.js` (fetch central: token, erros da API, 401 → sessão expirada, relógio do
  servidor) e `src/api/endpoints.js`.
- Contextos: `AuthContext` (sessão, logout intencional × expirado), `ThemeContext` (tema + script
  anti-"piscar" no `index.html`), `ToastContext`, `ConfirmContext` + `ConfirmDialog` acessível.
- Hooks `usePolling` (pausa com aba oculta, para ao sair) e `useServerNow`; `utils/serverClock.js`.
- Componentes (Header responsivo, Button com loading, Countdown, LotCard, MoneyInput, LotImage...)
  e as 11 páginas: vitrine, sala, auditoria, comprovante, login, cadastro, carteira, meus arremates,
  painel, novo lote e 404.
- CSS em `styles/` (tokens dos dois temas, base, componentes, páginas), responsivo.
- Back-end: `serverTime` em `GET /lots` e `/lots/:id`, `me.alias` na sala, e **proxy de imagens**
  `GET /images/aic/:imageId` (a AIC passou a bloquear com 403 o acesso direto às imagens), com testes.
- Verificação com navegador real (Playwright + Chromium headless, fora do repositório): 47 checagens
  de ponta a ponta nos dois temas e no celular. Bugs encontrados e corrigidos nesse processo:
  logout numa página protegida levava ao login em vez da vitrine; imagens bloqueadas pela AIC;
  cronômetro quebrando linha; histórico de lances apertado no celular.

**Revisado/ajustado por mim:**
- _(a preencher)_

## Fase 7 — Deploy (Neon + Render + Vercel)

**Gerado com IA:**
- Passo a passo dos painéis do Neon, Render e Vercel, lista de variáveis de cada serviço e checklist
  de ponta a ponta (no README, seção Deploy).
- `schema.prisma` com `directUrl` (`DATABASE_URL` = pooler do Neon, `DIRECT_URL` = direta para migrations);
  `DIRECT_URL` no `.env`, `.env.example` e nos testes.
- `package.json`: CLI `prisma` movido para `dependencies` (o `npm ci` em produção não instala
  devDependencies) e script `render-build` (`prisma generate && prisma migrate deploy`).
- `env.js`: `CORS_ORIGIN` obrigatório em produção e normalizado (remove `/` final).
- `seed.js`: trava que impede apagar um banco já populado (`SEED_FORCE=true` para forçar).
- `frontend/vercel.json`: rewrite para `index.html` (F5 em rotas do React Router).
- Segredos de produção novos em `backend/.env.production.local` (fora do git).
- Validação local: testes também com `pgbouncer=true`; simulação do build do Render numa cópia limpa
  com `NODE_ENV=production` e banco vazio (migrate deploy, seed, segundo seed recusado, auditoria
  íntegra, redeploy sem migrations pendentes); CORS com origem permitida/negada e preflight.

**Revisado/ajustado por mim:**
- _(a preencher)_

## Fase 8 — Extras

### Extra 1 — Documentação da API (Swagger)

**Gerado com IA:**
- `backend/docs/openapi.yaml` (OpenAPI 3.0) com todos os endpoints, autenticação Bearer, formato
  padrão de erro e exemplos, incluindo cada recusa de lance com a mensagem real da API.
- `routes/docs.routes.js`: Swagger UI em `GET /docs` e o documento em `GET /docs/openapi.json`.
- `tests/docs.test.js`: valida o documento e compara as rotas reais do Express com as documentadas
  (uma rota nova sem documentação faz o teste falhar).
- Link "Documentação da API" no rodapé do front e no README.

**Revisado/ajustado por mim:**
- _(a preencher)_

### Extra 2 — E-mails transacionais (Resend)

**Gerado com IA:**
- `services/email/notification.service.js`: "Você foi superado", "Você venceu" e "Seu lote foi
  encerrado", disparados depois do commit da transação, em segundo plano, com falhas só no log.
  Envio ignorado (com log) sem chave, com `EMAIL_ENABLED=false` ou para `@demo.com`.
- `services/email/templates.js`: HTML responsivo no visual da Casa, com versão em texto puro e
  escape de títulos.
- `lib/resendClient.js` (cliente isolado para o mock), `APP_URL` no `env.js`.
- `tests/email.test.js` com o cliente do Resend simulado.

**Revisado/ajustado por mim:**
- _(a preencher)_

### Extra 3 — Assistente (chat flutuante)

**Gerado com IA:**
- Consulta à documentação oficial da Anthropic (platform.claude.com, antigo docs.claude.com) para
  confirmar o identificador `claude-haiku-5-5` e o comportamento do modelo. O Haiku 5.5 raciocina
  por padrão (*adaptive thinking*), esse raciocínio conta no `max_tokens` e a resposta pode vir
  com um bloco `thinking` antes do texto. Também não aceita `temperature`. Daí `effort: low`,
  `max_tokens: 800` e a leitura dos blocos pelo `type`.
- `lib/anthropicClient.js`, `services/assistant/systemPrompt.js` (regras reais do sistema),
  `services/assistant/assistant.service.js` (validação, histórico, 503, limpeza de markdown) e
  `routes/assistant.routes.js` (limite de 10/min por IP); `trust proxy` em produção.
- `ANTHROPIC_API_KEY` e `ANTHROPIC_CHAT_MODEL` no `env.js` e no `.env.example`; rota no Swagger.
- `frontend/src/components/AssistantWidget.jsx` e os estilos em `components.css`.
- `tests/assistant.test.js` (13 testes, SDK simulado).
- Verificação visual com Playwright (tema claro, escuro, celular e o estado "indisponível"), com a
  resposta da IA simulada no navegador para não gastar créditos.

**Revisado/ajustado por mim:**
- _(a preencher)_

### Ajuste — regra de senha (8 a 72 caracteres) e botão mostrar/ocultar

**Gerado com IA:**
- `auth.service.js`: cadastro exige de 8 a 72 caracteres (constantes `PASSWORD_MIN`/`PASSWORD_MAX`).
  O login, de propósito, não valida tamanho: contas antigas com 6 ou 7 caracteres continuam entrando.
- `PasswordInput.jsx`: campo com botão "olho" (`type="button"`, aria-label "Mostrar senha"/"Ocultar
  senha"), usado no login e no cadastro. No cadastro, aviso no campo antes de enviar (sem requisição).
- `openapi.yaml` e system prompt do assistente atualizados.
- `tests/auth.test.js` (10 testes: limites 7/8/72/73, senha vazia ou ausente, hash bcrypt, login e
  conta antiga). Validado por mutação: voltando o mínimo para 6, 4 testes falham.
- Correção do Extra 3, achada na verificação visual: o botão flutuante cobria o link "Documentação
  da API" do rodapé em algumas larguras.

**Revisado/ajustado por mim:**
- _(a preencher)_

### Ajuste — e-mails de lances para o leiloeiro

**Gerado com IA:**
- Migration `auctioneer_bid_notifications`: `Lot.auctioneerNotifiedAt` e `auctioneerNotifiedBidCount`.
- `notification.service.js`: `notifyFirstBid` (1º lance, disparado pelo `placeBid` após o commit) e
  `sendDueBidDigests` (resumo de no máximo 1 a cada 15 min por lote, com "reserva" por `UPDATE`
  condicional contra envio duplicado). Chamado pelo job, em paralelo à liquidação.
- Templates "Seu lote começou a receber lances" e "Resumo de lances" (HTML + texto puro).
- 11 testes novos em `email.test.js` (Resend simulado e "agora" simulado para a janela de 15 min).
  Validados por mutação: com intervalo de 10 min ou sem a condição da reserva, os testes falham.

**Revisado/ajustado por mim:**
- _(a preencher)_

### Opcional — cancelamento com estorno automático

**Gerado com IA:**
- `lot.service.cancelLot`: permite cancelar lote agendado/ao vivo com lances, usando a mesma trava
  `FOR UPDATE` do lance; cria uma `WalletTransaction REFUND` informativa para o líder (o comprometido
  é liberado sozinho, porque só soma lotes `ACTIVE`); e-mail "Lote cancelado" aos licitantes após o
  commit.
- Front: `ConfirmDialog` do painel avisando o estorno (quantidade de lances e valor), extrato com
  "valor liberado" e aviso do estorno ao líder na sala.
- `tests/cancel.test.js` (12 testes). O de lance × cancelamento alterna a ordem de disparo: na
  primeira versão o lance sempre chegava antes, e o caminho "cancelamento primeiro" não era
  testado. Validado por mutação: sem o `FOR UPDATE`, o estorno vai para o licitante errado e o teste
  falha.
- Swagger, README e system prompt do assistente atualizados.

**Revisado/ajustado por mim:**
- _(a preencher)_

## Uso de IA no produto (não só no desenvolvimento)

Além de ajudar a escrever o código, a IA também faz parte do produto: o **assistente** do site
chama o modelo Claude Haiku (Anthropic) em tempo real para responder dúvidas dos usuários.

- **O que ele faz:** explica regras e o uso do site (lances, carteira, anti-sniping, liquidação,
  comprovante, auditoria, cadastro e papéis), em português e em texto puro.
- **O que ele NÃO faz:** não dá lances, não deposita, não cancela e não lê dados de ninguém. A
  chamada não tem ferramentas e o back-end não envia nenhum dado do banco para o modelo, só a
  pergunta, as últimas mensagens e o system prompt fixo.
- **Fonte de verdade:** as regras continuam no back-end (`bid.service`, `wallet.service`...). O
  assistente só as explica, e o prompt diz para não inventar e admitir quando não souber.
- **Custo e abuso:** Haiku (o modelo mais barato), `effort: low`, `max_tokens` baixo, histórico
  curto, mensagem de até 500 caracteres e 10 mensagens/min por IP.
- **Privacidade e segredos:** a chave fica só no back-end. As mensagens vão para a API da Anthropic,
  então o widget é para dúvidas gerais, não para dados pessoais.
- **Resiliência:** sem chave ou com a API fora, só o chat fica indisponível (503), e o resto do
  site funciona normalmente.
