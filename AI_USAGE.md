# Uso de IA no projeto

Registro, por fase, do que foi gerado com auxílio de IA e do que foi revisado/ajustado por mim.

**Como trabalhei:** usei o Claude (chat) para entender o desafio, planejar a arquitetura e escrever o `CLAUDE.md`, a especificação que guiou a implementação. A implementação foi feita com o Claude Code, uma fase por vez. Em cada fase, li o plano antes do código, testei manualmente (curl, Prisma Studio, navegador e o site no ar), conferi o resultado com o PDF do teste e só então fiz o commit. Também decidi o que entrava e o que ficava de fora (ver "Funcionalidade iniciada e descartada").

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
- Subi o banco com Docker Compose, testei `GET /health` e uma rota inexistente (404 com mensagem em português).
- Conferi os dados do seed no Prisma Studio (3 usuários, 3 lotes, 2 depósitos; valores em centavos e senhas só como hash).
- Revisei o schema contra os requisitos do PDF.

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
- Testei com curl: rota sem token (401), com token (200, sem `passwordHash` na resposta), papel errado (403) e senha errada (mensagem genérica).
- Inspecionei o JWT no jwt.io para confirmar que ele leva só o id e o papel.

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
- Testei a vitrine e a busca no catálogo com curl.
- Notei que o lote "ao vivo" do seed terminava em 2 horas e estaria encerrado quando o avaliador abrisse o deploy; pedi para ele durar 30 dias (feito na Fase 5).
- Pedi que `GET /lots/:id` aceitasse token opcional, para a sala mostrar "você está ganhando" e a posição sem expor outros licitantes.

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
- Rodei os testes (27 passando).
- Pedi um teste de dois lances simultâneos e a remoção das rotas temporárias `/dev/*`.
- Estudei a ordem das travas (lote → usuário) para entender por que ela evita deadlock.

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
- Defini requisitos extras: liquidação com a mesma trava dos lances e reconferência do fim, job fora dos testes, seed com lote ao vivo de 30 dias e lote já liquidado.
- Rodei os testes (55 passando).
- Testei a auditoria fraudando um lance direto no banco (`UPDATE` no valor do lance 2): a API respondeu `intact: false`, `brokenAtSeq: 2`. Depois restaurei os dados com o seed.

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
- Defini os padrões de interface: nenhum `alert`/`confirm` do navegador (modal próprio e toasts), botões desabilitados durante a requisição, dark mode seguindo a preferência do sistema.
- Resolvi um problema de ambiente: o disco do sistema estava 100% cheio; movi os dados do Docker para a partição `/home`, validei a auditoria e só então apaguei a cópia antiga.
- Teste no navegador: no site no ar, testei lances entre duas contas em janelas diferentes ("você foi superado" aparece sozinho), depósito na carteira, criação de lote pelo leiloeiro, dark mode e o layout no celular.

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
- Troquei o banco do Render pelo Neon, porque o banco gratuito do Render expira em 30 dias e não tem backup.
- Coloquei o banco na mesma região da API (EUA, Virginia), porque um lance faz várias consultas e a latência que importa é entre API e banco.
- Criei o repositório e configurei Neon, Render e Vercel nos painéis.
- Corrigi dois erros de build lendo o log do Render: o Build Command com texto grudado (`render-buildyarn`) e a URL do banco incompleta (erro P1013).
- Redefini a senha do banco no Neon depois de expô-la sem querer.
- Rodei o seed em produção e validei `/health`, `/audit/1` e `/audit/4` (íntegros) e a vitrine na Vercel.

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
- Abri o /docs em produção, fiz login, usei o "Authorize" com o token e testei um lance abaixo do mínimo (recusado com a mensagem certa).

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
- Testei em produção com contas reais (dois licitantes e um leiloeiro, usando alias do Gmail): "Você foi superado", "Você venceu" e "Seu lote foi encerrado" chegaram, sem nome nem e-mail de outros licitantes.
- Ajustei o `EMAIL_FROM` para exibir "Casa de Leilões" como remetente e marquei os primeiros e-mails como "não é spam" (domínio novo).

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
- Deixei o modelo configurável por variável (`ANTHROPIC_CHAT_MODEL`).
- Testes do assistente: perguntei por que o saldo disponível diminui após um lance (explicou o saldo comprometido, sem markdown) e perguntei a capital da França (recusou e voltou ao assunto do site).

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
- Pedi a regra de no mínimo 8 caracteres, que estava em 6, diferente da especificação.
- Cheguei a considerar um máximo de 15; mantive 72 depois de entender que senhas longas são mais seguras e que 72 é o limite do bcrypt.
- Pedi o botão de mostrar/ocultar senha e conferi os testes de limite (7 e 73 recusados, 8 e 72 aceitos).

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
- A ideia foi minha. Para não virar spam, defini: e-mail no 1º lance e, depois, no máximo um resumo a cada 15 minutos por lote, identificando licitantes só por apelido.
- Testei em produção: o aviso do 1º lance chegou às 17:54 e o resumo às 18:10, com o número de lances novos e o apelido de quem lidera.

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
- Pedi depois de conferir o projeto contra os opcionais do PDF.
- Teste em produção: _(a preencher)_

### Opcional — Docker Compose completo

**Gerado com IA:**
- `docker-compose.yml` com `postgres` + `backend` + `frontend`, healthchecks e `depends_on` por
  `service_healthy`; `backend/Dockerfile` (node:22-slim + openssl), `backend/docker-entrypoint.sh`
  (migrations → seed só com banco vazio → API), `frontend/Dockerfile` (build com `VITE_API_URL` +
  `vite preview`) e `.dockerignore`.
- `seed.js`: modo `SEED_IF_EMPTY=true` (banco já populado → avisa e sai com sucesso).
- Teste do zero como projeto separado (`-p casa_teste`), sem tocar no volume do banco local:
  1ª subida (migrations, seed, health, front, F5 em rota, CORS, auditoria íntegra, login e sala no
  navegador) e 2ª subida (dados mantidos, seed ignorado). Depois, tudo do teste foi removido.

**Revisado/ajustado por mim:**
- Pedi depois de conferir o projeto contra os opcionais do PDF (o compose subia só o banco).
- Teste local: rodei docker-compose up --build, abri o front em localhost:5173 e entrei com uma conta do seed.

## Funcionalidade iniciada e descartada

Comecei a implementar "Esqueci minha senha", mas parei ao reler o PDF: recuperação de senha está em "Não precisa fazer". Desfiz tudo antes de qualquer commit (`git restore` e remoção dos arquivos novos), regenerei o Prisma Client (os testes quebraram porque ele ainda refletia o schema da tarefa cancelada) e removi do banco local a migration que já tinha sido aplicada. Os testes voltaram a passar e nada chegou à produção.

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
