# Casa de Leilões

Plataforma de leilões de obras de arte (catálogo do Art Institute of Chicago), com lances em tempo real
por polling, carteira simulada, liquidação automática, comprovante público e **auditoria à prova de
adulteração** dos lances.

> Teste técnico Elite Dev — Verzel.

**Produção:** front <https://SEU-PROJETO.vercel.app> · API <https://SUA-API.onrender.com/health> ·
**Documentação da API (Swagger):** <https://SUA-API.onrender.com/docs>
_(links preenchidos após o deploy; veja [Deploy](#deploy))_

## Stack

| Camada | Tecnologias |
|---|---|
| Back-end | Node.js 20, Express 5, Prisma 5, PostgreSQL 16, JWT + bcrypt |
| Testes | Jest + Supertest (banco de testes separado) |
| Front-end | React 19, Vite 7, React Router 7, CSS puro com variáveis (tema claro/escuro) |
| Local | Docker Compose (PostgreSQL) |

Monorepo: `backend/` e `frontend/`.

## Como rodar localmente

Pré-requisitos: Node.js 20+, Docker e Docker Compose.

```bash
# 1. Banco (PostgreSQL na porta 5434)
docker-compose up -d

# 2. Back-end
cd backend
cp .env.example .env        # e troque JWT_SECRET e AUDIT_SECRET (veja abaixo)
npm install
npx prisma migrate dev      # cria as tabelas
npm run db:seed             # dados de demonstração
npm run dev                 # API em http://localhost:3333 (+ job de liquidação)
```

Teste rápido: `curl localhost:3333/health` → `{"status":"ok","database":"ok",...}`

```bash
# 3. Front-end (em outro terminal)
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:3333
npm install
npm run dev                 # http://localhost:5173
```

Com os dois rodando, abra http://localhost:5173 e entre com uma das contas do seed.
O `CORS_ORIGIN` padrão da API já libera `http://localhost:5173`.

## Variáveis de ambiente

Front-end (`frontend/.env`): `VITE_API_URL`, o endereço da API (padrão `http://localhost:3333`).

Back-end (`backend/.env`):

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Conexão PostgreSQL usada pela aplicação (no Neon: a do **pooler**, com `&pgbouncer=true`) |
| `DIRECT_URL` | sim | Conexão direta, usada só pelas migrations (local: igual à `DATABASE_URL`) |
| `JWT_SECRET` | sim (≥ 16 caracteres) | Assina os tokens de login |
| `AUDIT_SECRET` | sim (≥ 16 caracteres) | Chave do HMAC da auditoria e dos apelidos. **Nunca** vai para o banco. A API não inicia sem ela |
| `JWT_EXPIRES_IN` | não (`1d`) | Validade do token |
| `PORT` | não (`3333`) | Porta da API |
| `CORS_ORIGIN` | **em produção, sim** (local: `http://localhost:5173`) | Origem(ns) do front, separadas por vírgula, sem `/` final |
| `AIC_API_URL` / `AIC_USER_AGENT` | não | API do Art Institute (a AIC exige o cabeçalho `AIC-User-Agent`) |

Gerar um segredo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
(use valores **diferentes** para `JWT_SECRET` e `AUDIT_SECRET`).

## Seed e credenciais

`npm run db:seed` **apaga tudo** e recria os dados com ids previsíveis. Senha de todos: **`senha123`**.

**Trava de segurança:** se o banco já tiver usuários, o seed se recusa a rodar, para não apagar
dados de produção por engano. Para recriar de propósito (ex.: no banco local):
`SEED_FORCE=true npm run db:seed`.

| Usuário | Papel | Situação após o seed |
|---|---|---|
| `leiloeiro@demo.com` | Leiloeiro | Dono dos 4 lotes; já recebeu R$ 1.600,00 (lote #4) |
| `ana@demo.com` | Licitante | Saldo R$ 3.400,00; lidera o lote #1 (R$ 1.200,00 comprometidos); **venceu o lote #4** |
| `bruno@demo.com` | Licitante | Saldo R$ 3.000,00; lidera o lote #2 (R$ 350,00 comprometidos) |

| Lote | Obra | Situação |
|---|---|---|
| #1 | Nighthawks (Hopper) | **Ao vivo**, termina em **30 dias**, 3 lances com corrente de hashes válida |
| #2 | Water Lilies (Monet) | **Termina 5 minutos após o seed**, 2 lances — o job o liquida sozinho (Bruno vence) |
| #3 | The Bedroom (Van Gogh) | **Agendado** (começa amanhã) |
| #4 | La Grande Jatte (Seurat) | **Liquidado**: Ana venceu por R$ 1.600,00, com comprovante |

O seed imprime o código do comprovante do lote #4 (ex.: `GET /receipts/<código>`).

Observações:
- O seed usa o mesmo código da aplicação para gerar a corrente de hashes e para liquidar, então
  `GET /audit/1` … `/audit/4` dão **íntegro**. Por isso ele precisa rodar com o **mesmo `AUDIT_SECRET`** da API.
- Para rever a liquidação do lote #2, rode o seed de novo com `SEED_FORCE=true` (o fim é sempre "agora + 5 min").

## Testes

```bash
cd backend
npm test
```

Os testes usam um banco separado, `leiloes_test`, no mesmo container. Ele é recriado a cada execução,
e há uma trava que impede rodar os testes contra um banco cujo nome não termine em `_test`.
O job de liquidação não roda nos testes: só o `server.js` o inicia, e os testes importam apenas o `app.js`.

Cobertura: lances (todas as regras de recusa, anti-sniping, concorrência com `FOR UPDATE`), carteira
(comprometido e liberação ao ser superado), liquidação (com e sem lances, débito/crédito, comprovante,
idempotência, lance × liquidação simultâneos), auditoria (alteração, remoção e inserção direto no banco)
e privacidade.

## Endpoints

📖 **Documentação interativa (Swagger UI): `GET /docs`**, em <http://localhost:3333/docs> no ambiente local.
- Gerada de `backend/docs/openapi.yaml` (OpenAPI 3.0): todos os endpoints, autenticação Bearer,
  exemplos de requisição e resposta (inclusive cada recusa de lance com a mensagem real) e o
  formato padrão de erro.
- Para testar rotas protegidas: faça `POST /auth/login`, copie o `token` e clique em **Authorize**.
- O documento bruto fica em `GET /docs/openapi.json`.
- Um teste (`tests/docs.test.js`) valida o arquivo e falha se alguma rota real não estiver
  documentada, ou se algo documentado deixar de existir.

| Método e rota | Acesso | Descrição |
|---|---|---|
| `POST /auth/register`, `POST /auth/login` | público | Cadastro / login → `{ token, user }` |
| `GET /auth/me` | logado | Usuário atual |
| `GET /lots?status=live\|scheduled\|ended&search=&minPrice=&maxPrice=` | público | Vitrine (preços em centavos) |
| `GET /lots/:id` | público | Sala do lote; para licitante logado inclui `me` (ganhando/superado/venceu, posição) |
| `POST /lots` | leiloeiro | Cria lote a partir de uma obra do catálogo (`externalId`) |
| `POST /lots/:id/cancel` | leiloeiro dono | Cancela lote sem lances |
| `GET /catalog/search?q=` | leiloeiro | Busca obras na API do Art Institute |
| `POST /lots/:id/bids` | licitante | Dá um lance `{ amountCents }` |
| `GET /wallet`, `POST /wallet/deposit` | licitante | Carteira (total, comprometido, disponível, extrato) / depósito simulado |
| `GET /me/bids` | licitante | Meus lances e arremates (com código do comprovante) |
| `GET /me/lots` | leiloeiro | Meus lotes, resultado de cada um e total recebido |
| `GET /audit/:lotId` | público | Verificação da corrente de lances |
| `GET /receipts/:code` | público | Comprovante de arremate |
| `GET /images/aic/:imageId` | público | Proxy das imagens da AIC (ver abaixo) |

Erros seguem o formato `{ "error": { "code": "...", "message": "mensagem em português" } }`.
Dinheiro trafega **sempre em centavos** (inteiros).

## Regras de lance

Tudo em uma transação, com a linha do lote e a do usuário travadas (`SELECT ... FOR UPDATE`, sempre
na ordem lote → usuário). As validações, nesta ordem:

1. Lote inexistente ou cancelado → "Lote não encontrado"
2. Antes do início → "Lote ainda não iniciado"
3. Depois do fim → "Lote encerrado"
4. Usuário não é licitante → 403
5. Já é o líder → "Você já está ganhando"
6. Valor mínimo: lance inicial (sem lances) ou lance atual + incremento → "Lance abaixo do mínimo (mínimo: R$ X)"
7. Valor maior que o saldo disponível → "Saldo insuficiente"

- **Saldo disponível** = saldo total − comprometido. O comprometido é a soma dos lances em que o
  usuário lidera lotes ativos. Ele é **calculado, nunca gravado**: quando o licitante é superado,
  o valor volta ao disponível sozinho.
- **Anti-sniping**: um lance feito com menos de 2 min restantes estende o fim em +2 min.
- **Liquidação**:
  - Quem dispara: um job a cada 15s (e na subida do servidor), mais uma liquidação sob demanda ao
    abrir um lote vencido. Isso cobre o caso do servidor ter "dormido".
  - Trava: a mesma linha do lote usada pelos lances. Depois de travar, a liquidação **reconfere o
    status e o `endsAt`**, porque o anti-sniping pode ter estendido o fim.
  - É idempotente, e o `Receipt.lotId` único funciona como segunda barreira.

## Auditoria à prova de adulteração

Cada lance guarda um hash que depende do lance anterior, formando uma **corrente**:

```
prevHash₁ = "GENESIS:<lotId>"
hashₙ     = HMAC-SHA256(AUDIT_SECRET, prevHashₙ | lotId | seq | apelido | valor | data ISO)
prevHashₙ = hashₙ₋₁
selo      = HMAC-SHA256(AUDIT_SECRET, lotId | bidCount | lastHash)   (gravado no lote)
```

`GET /audit/:lotId` recalcula tudo na ordem de `seq` e retorna `{ intact, brokenAtSeq, reason, message, bids }`.

| Adulteração direto no banco | Como é detectada |
|---|---|
| Alterar valor, data ou apelido de um lance | o HMAC recalculado não bate (`HASH_MISMATCH`) |
| Trocar o autor (`bidderId`) | o apelido é derivado do `bidderId` via HMAC (`BIDDER_MISMATCH`) |
| Remover um lance do meio | buraco na sequência `seq` (`SEQ_GAP`) |
| Remover o último lance | `bidCount`/`lastHash` do lote não batem (`CHAIN_TAIL_MISMATCH`) |
| Remover o último e "consertar" o lote | o selo não bate (`SEAL_MISMATCH`) |
| Inserir lance falso | o hash dele não bate (`HASH_MISMATCH`) |
| Mudar lance atual ou vencedor do lote | incoerente com o último lance (`LOT_STATE_MISMATCH`) |

**Por que o segredo fora do banco impede forjar.** Com um SHA-256 comum, quem altera um lance poderia
simplesmente recalcular os hashes seguintes e o selo, e a corrente "consertada" passaria na verificação.
Com HMAC, recalcular exige o `AUDIT_SECRET`. Ele fica só na variável de ambiente do servidor, nunca no
banco. Assim, quem tem acesso ao banco (um dump vazado, um DBA, uma injeção de SQL) consegue alterar os
dados, mas não consegue produzir hashes válidos, e a adulteração aparece na auditoria pública.

O selo nasce junto com o lote (com 0 lances), então nem apagar **todos** os lances passa despercebido.

## Privacidade

O licitante aparece como `Licitante #XXXXXX`, onde `XXXXXX` = HMAC(`AUDIT_SECRET`, lotId | bidderId).
O apelido é o mesmo dentro de um lote e diferente entre lotes, então não dá para rastrear a mesma pessoa
de um lote para outro. Sala, auditoria e comprovante nunca expõem nome, e-mail ou id do licitante.

## Front-end

| Rota | Página |
|---|---|
| `/` | Vitrine: abas ao vivo/agendados/encerrados, busca e filtro de preço (filtros na URL) |
| `/lotes/:id` | Sala: polling de 2 s, cronômetro, "você está ganhando/foi superado", posição, lance |
| `/auditoria/:id` | Selo "Íntegro" / "Adulterado no lance #N" e a corrente em blocos |
| `/comprovante/:code` | Comprovante com botão de copiar o link |
| `/login`, `/cadastro` | Acesso (no cadastro se escolhe licitante ou leiloeiro) |
| `/carteira`, `/meus-arremates` | Licitante: saldo total/comprometido/disponível, depósito, extrato; arremates |
| `/painel`, `/painel/novo-lote` | Leiloeiro: resultados, total recebido, cancelar; criar lote buscando no catálogo |

Pontos principais:
- **Comunicação com a API**:
  - Todas as chamadas passam por `src/api/client.js`, que monta a URL, envia o token
    (`Authorization: Bearer`) e converte erros na mensagem em português da API.
  - O token fica no `localStorage`.
  - Se uma chamada com token recebe 401, a sessão é encerrada e o usuário vai para o login com um aviso.
- **Sala do lote**:
  - O polling encadeia `setTimeout`s e pausa quando a aba fica oculta; ao sair da página, ele para.
  - O cronômetro usa a **hora do servidor**: a API devolve `serverTime`, e o front calcula a
    diferença para o relógio local.
  - Quando o anti-sniping estende o fim, o cronômetro acompanha e aparece o aviso "+2 min".
- **Padrões de interface**:
  - Nenhum `alert`/`confirm`. Ações importantes passam por um `<ConfirmDialog>` acessível (Esc,
    clique fora, foco preso e devolvido ao botão de origem) e o resultado aparece em toasts.
  - Botões ficam desabilitados com spinner durante a requisição.
- **Tema**:
  - Todas as cores ficam em variáveis CSS (`src/styles/tokens.css`).
  - Na primeira visita, o site segue `prefers-color-scheme`; depois vale a escolha salva no `localStorage`.
  - O tema é aplicado antes do React carregar, para a tela não "piscar".

### Proxy de imagens

O servidor de imagens da AIC (IIIF) responde **403** (Cloudflare) a requisições sem o cabeçalho
`AIC-User-Agent`, e uma tag `<img>` não consegue enviar cabeçalhos. Por isso a API expõe
`GET /images/aic/:imageId`: ela busca a imagem com o cabeçalho, com timeout de 5 s, e devolve com
cache de 7 dias.

A rota só aceita ids no formato UUID e sempre monta a URL do artic.edu, então não funciona como
proxy aberto (SSRF). O banco guarda a URL original da AIC (snapshot), e a API troca pelo endereço
do proxy só na resposta.

## Deploy

| Parte | Serviço | Configuração |
|---|---|---|
| Banco | **Neon** (PostgreSQL 16, região AWS `us-east-1`) | Duas strings: pooler (app) e direta (migrations) |
| API | **Render**, Web Service gratuito (região Virginia) | Root `backend` · Build `npm ci && npm run render-build` · Start `npm start` · Health check `/health` |
| Front | **Vercel** | Root `frontend` · Vite · `vercel.json` com rewrite para `index.html` |

**Build da API (`render-build`):** `prisma generate && prisma migrate deploy`.
- `migrate deploy` só aplica migrations já versionadas, nunca cria nem apaga nada; num redeploy
  sem mudanças, ele responde "No pending migrations".
- Ele usa a `DIRECT_URL`, porque o pooler (PgBouncer) não suporta os comandos de migração.
- O CLI `prisma` fica em `dependencies`: com `NODE_ENV=production`, o `npm ci` não instala
  `devDependencies`, e o build falharia sem ele.

**Rotas do React Router na Vercel:** o `frontend/vercel.json` reescreve qualquer caminho para
`/index.html`. A Vercel entrega primeiro os arquivos que existem (JS, CSS, favicon) e só cai no
rewrite para rotas como `/lotes/1`. Assim, um F5 em qualquer página não dá 404.

### Variáveis de ambiente em produção

**Render (API):** `NODE_ENV=production`, `NODE_VERSION=22`, `DATABASE_URL` (pooler +
`&pgbouncer=true&connect_timeout=15`), `DIRECT_URL` (direta + `&connect_timeout=15`), `JWT_SECRET`,
`AUDIT_SECRET`, `JWT_EXPIRES_IN=1d`, `CORS_ORIGIN` (domínio da Vercel) e `AIC_USER_AGENT`
(opcional). O `PORT` não deve ser definido: o próprio Render informa a porta.

**Vercel (front):** `VITE_API_URL` = URL do Render, sem `/` final. O valor entra no **build**:
se mudar, é preciso fazer um *Redeploy*.

Os segredos de produção são **novos** (diferentes dos locais e diferentes entre si), gerados com
`crypto.randomBytes(32)`. Eles ficam fora do git, em `backend/.env.production.local`.

⚠️ **Nunca troque o `AUDIT_SECRET` depois de existirem lances:** todas as correntes passariam a
aparecer como adulteradas, porque os hashes foram calculados com o segredo antigo.

### Seed em produção (uma vez, manual)

O Render gratuito não tem Shell, então o seed roda da máquina local, apontando para o Neon e com
as **mesmas** variáveis da API (principalmente o `AUDIT_SECRET`):

```bash
cd backend
set -a; source .env.production.local; set +a
npm run db:seed        # a trava impede rodar de novo com o banco populado
```

### Checklist pós-deploy

1. `GET /health` responde `{"status":"ok","database":"ok"}`. A 1ª chamada pode levar ~50 s,
   porque o servidor estava dormindo.
2. `GET /lots` lista os 2 lotes ao vivo.
3. `GET /audit/1` responde `"intact": true` (o seed e a API usam o mesmo `AUDIT_SECRET`).
4. `GET /images/aic/831a05de-d3f6-f4fa-a460-23008dd58dda` responde `200 image/jpeg`.
5. A vitrine carrega com imagens e sem erro de CORS no console; F5 em `/lotes/1`, `/auditoria/1`
   e `/painel` não dá 404.
6. Ana (sala do lote 1) vê "Você foi superado" em até ~2 s depois de um lance do Bruno.
7. Um depósito na carteira com confirmação funciona.
8. O lote 2 é liquidado pelo job ~5 min após o seed; o comprovante aparece em "Meus arremates"
   e o link copiado abre numa aba anônima.
9. O painel do leiloeiro soma os lotes #2 e #4 no total recebido; a busca no catálogo funciona.
10. Trocar o token no DevTools e fazer uma ação leva ao login com o aviso de sessão expirada.

## Limitações conhecidas

- Atualização da sala por polling (2s), e não por WebSocket.
- O token JWT fica no `localStorage`: é simples e funciona entre domínios (Vercel + Render), mas um
  XSS conseguiria lê-lo. A alternativa seria um cookie `httpOnly`, que exige cuidados de CSRF e
  `SameSite` entre domínios.
- As imagens dependem da AIC pelo proxy: se a AIC cair, as imagens novas falham (o site mostra
  "Imagem indisponível"), mas todo o resto continua funcionando.
- O job de liquidação roda dentro do processo da API. Com várias instâncias, a trava + idempotência
  evitam liquidação dupla, mas o trabalho seria repetido.
- No Render gratuito o servidor "dorme" após ~15 min sem acesso: o primeiro acesso demora (~50 s),
  e a liquidação acontece na subida ou sob demanda. O Neon gratuito também suspende o banco
  quando ocioso (alguns décimos de segundo a mais na primeira consulta).
- O CORS aceita só as origens listadas em `CORS_ORIGIN`: os *preview deployments* da Vercel
  (URLs por branch) não acessam a API, a menos que sejam adicionados à lista.
