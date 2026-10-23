# Casa de Leilões

Plataforma de leilões de obras de arte (catálogo do Art Institute of Chicago), com lances em tempo real
por polling, carteira simulada, liquidação automática, comprovante público e **auditoria à prova de
adulteração** dos lances.

> Teste técnico Elite Dev — Verzel. _README em construção: front-end, deploy e decisões técnicas
> completas entram nas próximas fases._

## Stack

| Camada | Tecnologias |
|---|---|
| Back-end | Node.js 20, Express 5, Prisma 5, PostgreSQL 16, JWT + bcrypt |
| Testes | Jest + Supertest (banco de testes separado) |
| Front-end | React + Vite + React Router _(Fase 6)_ |
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

## Variáveis de ambiente (`backend/.env`)

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | sim | Conexão PostgreSQL |
| `JWT_SECRET` | sim (≥ 16 caracteres) | Assina os tokens de login |
| `AUDIT_SECRET` | sim (≥ 16 caracteres) | Chave do HMAC da auditoria e dos apelidos. **Nunca** vai para o banco. A API não inicia sem ela |
| `JWT_EXPIRES_IN` | não (`1d`) | Validade do token |
| `PORT` | não (`3333`) | Porta da API |
| `CORS_ORIGIN` | não (`http://localhost:5173`) | Origem(ns) do front, separadas por vírgula |
| `AIC_API_URL` / `AIC_USER_AGENT` | não | API do Art Institute (a AIC exige o cabeçalho `AIC-User-Agent`) |

Gerar um segredo: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
(use valores **diferentes** para `JWT_SECRET` e `AUDIT_SECRET`).

## Seed e credenciais

`npm run db:seed` **apaga tudo** e recria os dados com ids previsíveis. Senha de todos: **`senha123`**.

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
- Para rever a liquidação do lote #2, rode o seed de novo (o fim é sempre "agora + 5 min").

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

## Limitações conhecidas

- Atualização da sala por polling (2s), e não por WebSocket.
- O job de liquidação roda dentro do processo da API. Com várias instâncias, a trava + idempotência
  evitam liquidação dupla, mas o trabalho seria repetido.
- No Render gratuito o servidor "dorme": o primeiro acesso demora, e a liquidação acontece na subida
  ou sob demanda.
