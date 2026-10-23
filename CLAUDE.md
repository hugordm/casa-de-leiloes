# Casa de Leilões — Teste técnico Elite Dev Verzel

## Contexto
Projeto de teste técnico. O autor (Hugo) precisa ENTENDER e conseguir EXPLICAR todo o código em entrevista.
Por isso, ao trabalhar neste projeto:
- Trabalhe UMA fase por vez (ver "Fases"). Não avance sem o Hugo pedir.
- Ao terminar cada tarefa, explique em português, de forma simples: o que foi criado, por quê, e como se conecta ao resto.
- Prefira código simples e legível a soluções "espertas". Comente em português as partes de regra de negócio.
- Ao final de cada fase, registre em `AI_USAGE.md` o que foi gerado com IA nessa fase (o Hugo completa com o que revisou/ajustou).

## Stack
- Monorepo: `backend/` e `frontend/` no mesmo repositório.
- Back-end: Node.js + Express + Prisma + PostgreSQL. JavaScript (CommonJS ou ESM, manter consistente).
- Front-end: React + Vite + React Router.
- Auth: JWT (header `Authorization: Bearer <token>`) + bcrypt para senhas.
- Testes: Jest + Supertest (backend).
- Deploy: frontend na Vercel, backend + PostgreSQL no Render.
- Local: Docker Compose (postgres + backend + frontend).
- SO de desenvolvimento: Linux.

## API externa
Art Institute of Chicago API (https://api.artic.edu/docs/) — gratuita, sem chave.
- Busca: `GET https://api.artic.edu/api/v1/artworks/search?q=...&fields=id,title,artist_display,date_display,medium_display,image_id`
- Imagem: `https://www.artic.edu/iiif/2/{image_id}/full/843,/0/default.jpg`
- Toda chamada externa com timeout (ex.: 5s) e erro tratado com mensagem amigável.
- Ao criar um lote, COPIAR título, imagem (URL), artista e atributos para o banco (snapshot).
  Depois disso o lote nunca depende da API externa (vitrine, sala, auditoria e comprovante funcionam se a API cair).

## Papéis
- AUCTIONEER (leiloeiro): cria/cancela os próprios lotes, vê resultados e total recebido. NÃO pode dar lances.
- BIDDER (licitante): deposita saldo simulado, dá lances, arremata.
- Visitante (sem login): vê vitrine, sala (sem dar lance), auditoria e comprovantes.
- O front esconde ações por papel, mas QUEM BLOQUEIA é o back-end (middlewares `auth` + `requireRole`).

## Convenções importantes
- Dinheiro SEMPRE em centavos (inteiro). Formatar para R$ só no front.
- Datas em UTC no banco; front exibe no fuso local.
- Mensagens de erro para o usuário em português.
- Erros de negócio: classe `AppError(statusCode, code, message)`, tratada por um middleware central.

## Modelo de dados (Prisma)
- User: id, name, email (único), passwordHash, role (AUCTIONEER|BIDDER), balanceCents (saldo total), createdAt.
- Lot: id, auctioneerId, externalId, title, artist, imageUrl, attributes (Json), startingBidCents, minIncrementCents,
  startsAt, endsAt, status (ACTIVE|CANCELLED|SETTLED), currentBidCents (nullable), leaderId (nullable),
  winnerId (nullable), finalPriceCents (nullable), bidCount, lastHash, seal, createdAt.
- Bid: id, lotId, bidderId, amountCents, seq (1,2,3... por lote, único com lotId), bidderAlias, createdAt, prevHash, hash.
- Receipt: id, code (aleatório, único, usado no link público), lotId (único), winnerId, amountCents, createdAt.
- WalletTransaction: id, userId, type (DEPOSIT|DEBIT|CREDIT|REFUND), amountCents, lotId (nullable), createdAt.

Status exibido do lote (calculado, não gravado):
- CANCELLED → não aparece na vitrine.
- agora < startsAt → "agendado"; startsAt ≤ agora < endsAt → "ao vivo"; agora ≥ endsAt → "encerrado".

## Regras de negócio (o que mais pesa na avaliação)

### Lance — `bid.service.js`
Tudo dentro de `prisma.$transaction`, travando a linha do lote (`SELECT ... FOR UPDATE` via `$queryRaw`)
e a do usuário, para evitar condição de corrida. Ordem de validação e mensagens:
1. Lote inexistente ou cancelado → 404 "Lote não encontrado".
2. agora < startsAt → "Lote ainda não iniciado".
3. agora ≥ endsAt → "Lote encerrado".
4. Usuário não é BIDDER → 403 (leiloeiro não dá lance).
5. Usuário já é o líder → "Você já está ganhando".
6. Mínimo: sem lances → amount ≥ startingBid; com lances → amount ≥ currentBid + minIncrement.
   Senão → "Lance abaixo do mínimo (mínimo: R$ X)".
7. amount > saldo disponível → "Saldo insuficiente".
Se aceito:
- Cria Bid com seq = bidCount + 1, alias, prevHash = lastHash, hash encadeado (ver Auditoria).
- Atualiza lote: currentBid, leaderId, bidCount, lastHash, seal.
- Anti-sniping: se (endsAt - agora) < 2 min → endsAt = endsAt + 2 min.

### Carteira — `wallet.service.js`
- comprometido = soma de currentBidCents dos lotes ACTIVE (não liquidados, não cancelados) onde leaderId = usuário.
- disponível = balanceCents - comprometido.
- NÃO guardar "comprometido" em coluna: é calculado, então nunca dessincroniza.
- Ao ser superado, o valor volta ao disponível automaticamente (porque deixou de ser líder).
- Depósito simulado: valor > 0 e com limite razoável; cria WalletTransaction DEPOSIT.

### Liquidação — `settlement.service.js` + `jobs/settlement.job.js`
- Job a cada ~15s busca lotes ACTIVE com endsAt ≤ agora. Liquidar cada um em transação:
  - Com vencedor: debita vencedor (DEBIT), credita leiloeiro (CREDIT), cria Receipt, status SETTLED, winnerId, finalPrice.
  - Sem lances: status SETTLED sem vencedor.
- Deve ser idempotente (rodar duas vezes não liquida duas vezes).
- Também liquidar "sob demanda" ao consultar um lote vencido (garante consistência se o servidor dormiu no Render).

### Cancelamento
- Base: leiloeiro dono pode cancelar lote sem lances.
- Opcional (implementar na fase de opcionais): cancelar COM lances → status CANCELLED; o comprometido do líder
  é liberado automaticamente (lote deixa de ser ACTIVE); registrar WalletTransaction REFUND informativa (valor 0
  no saldo total, pois nada foi debitado) e exibir aviso ao licitante.

### Auditoria à prova de adulteração — `hashChain.service.js`
- Segredo `AUDIT_SECRET` em variável de ambiente (nunca no banco).
- hash_n = HMAC-SHA256(AUDIT_SECRET, prevHash | lotId | seq | bidderAlias | amountCents | createdAt ISO).
- prevHash do primeiro lance = "GENESIS:" + lotId.
- seal do lote = HMAC(AUDIT_SECRET, lotId | bidCount | lastHash) → detecta remoção/inserção no fim da corrente.
- Verificação (pública, `GET /audit/:lotId`): recalcula a corrente na ordem de seq, checa seq contíguo, prevHash,
  hash e seal. Retorna { intact: boolean, brokenAtSeq?: number, bids: [...] }.
- Explicar a técnica no README (corrente de hashes + HMAC, por que o segredo fora do banco impede forjar).

### Privacidade
- bidderAlias = "Licitante #" + 4-6 caracteres de HMAC(AUDIT_SECRET, lotId | bidderId).
  Mesmo licitante tem o mesmo apelido dentro do lote, mas apelidos diferentes entre lotes.
- Auditoria e comprovante NUNCA expõem nome ou e-mail.

## Endpoints
- POST /auth/register, POST /auth/login, GET /auth/me
- GET /lots (filtros: status=live|scheduled|ended, search, minPrice, maxPrice), GET /lots/:id
- POST /lots (AUCTIONEER), POST /lots/:id/cancel (AUCTIONEER dono)
- GET /catalog/search?q= (AUCTIONEER)
- POST /lots/:id/bids (BIDDER)
- GET /wallet, POST /wallet/deposit (BIDDER)
- GET /me/bids (BIDDER), GET /me/lots (AUCTIONEER, com resultados e total recebido)
- GET /audit/:lotId (público), GET /receipts/:code (público)

## Front-end (rotas)
- / vitrine (abas ao vivo/agendados/encerrados + busca/filtro)
- /lotes/:id sala (polling a cada 2s em GET /lots/:id; cronômetro; "você está ganhando"/"você foi superado"; posição do usuário)
- /auditoria/:id, /comprovante/:code (públicas)
- /login, /cadastro
- /carteira, /meus-arremates (BIDDER)
- /painel, /painel/novo-lote (AUCTIONEER)
- Dark mode: variáveis CSS + toggle salvo em localStorage.
- Exibir a mensagem exata de erro de cada lance recusado.

### Padrões de interface (obrigatórios em todas as páginas)
- NUNCA usar window.alert, window.confirm ou window.prompt.
- Ações destrutivas ou irreversíveis (cancelar lote, dar lance, depositar,
  sair) pedem confirmação num componente <ConfirmDialog> próprio:
  título, mensagem explicando a consequência, botão "Cancelar" e botão
  de confirmar (vermelho quando destrutivo). Fecha com Esc ou clique fora,
  prende o foco dentro do modal enquanto aberto e devolve o foco ao botão
  de origem ao fechar (acessibilidade).
- Mensagens de sucesso e erro aparecem em toasts estilizados (canto da tela,
  somem sozinhos), nunca em alert. Erros de lance mostram a mensagem exata
  da API.
- Botões mostram estado de carregamento e ficam desabilitados enquanto a
  requisição está em andamento (evita clique duplo).
- Dark mode: todas as cores em variáveis CSS (:root e [data-theme="dark"]),
  toggle no cabeçalho, escolha salva no localStorage e, na primeira visita,
  seguir a preferência do sistema (prefers-color-scheme). O modal, os toasts
  e todos os componentes precisam funcionar bem nos dois temas.

  - Campos de senha têm botão "olho" para mostrar/ocultar (type="button",
  aria-label "Mostrar senha"/"Ocultar senha"), no login, cadastro e
  redefinição de senha.
  - Senha com no mínimo 8 caracteres: validar no front (mensagem antes de
  enviar) e no back (regra que vale de verdade).

## Seed (`prisma/seed.js`)
- 1 leiloeiro, 2 licitantes com saldo, ao menos 1 lote AO VIVO com lances abertos (com corrente de hashes válida),
  1 agendado e 1 encerrado. Credenciais documentadas no README.

## Testes (Jest + Supertest)
Cobrir no mínimo: lance abaixo do mínimo, saldo insuficiente, líder não cobre o próprio lance, lote não iniciado,
lote encerrado, leiloeiro não pode dar lance, anti-sniping, liberação do comprometido ao ser superado,
liquidação (débito/crédito/comprovante), auditoria detecta alteração/remoção/inserção.

## Fases
1. Setup: monorepo, Express, Prisma, schema, Docker Compose do Postgres, seed básico.
2. Auth + middlewares + papéis.
3. Catálogo (API externa) + criação/cancelamento de lotes + listagem com filtros.
4. Lances + carteira + anti-sniping (com testes).
5. Liquidação + comprovante + corrente de hashes + auditoria (com testes).
6. Front-end: todas as páginas.
7. - Deploy: frontend na Vercel, API no Render (web service), banco no Neon
  (PostgreSQL gratuito permanente; o banco gratuito do Render expira em
  30 dias). Prisma com DATABASE_URL (pooler) e DIRECT_URL (direta, para
  migrations).
8. Opcionais restantes + README completo + AI_USAGE.md.

## README deve conter
Visão geral, arquitetura, como rodar local (com e sem Docker), variáveis de ambiente, seed e credenciais,
como rodar os testes, links de deploy, explicação das regras de lance e da técnica de auditoria,
decisões técnicas, limitações conhecidas (ex.: Render gratuito "dorme" e o primeiro acesso demora).

## Extras (Fase 8, só depois do deploy funcionando)

### Assistente (chat flutuante)
- Back-end: POST /assistant/chat chama a API da Anthropic com o modelo
  Claude Haiku (confirmar o identificador atual na documentação).
  ANTHROPIC_API_KEY só no env do back-end. NUNCA no front.
- Limite por IP (ex.: 10 mensagens/min), mensagem de até 500 caracteres,
  histórico curto (últimas ~6 mensagens), max_tokens baixo, timeout.
- System prompt: assistente da Casa de Leilões; só explica regras e uso do
  site (lances, carteira, anti-sniping, liquidação, auditoria); respostas
  curtas, em português, em texto puro SEM markdown; não executa ações nem
  acessa dados de usuários.
- Sem chave ou com a API fora: responde 503 e o widget mostra
  "Assistente indisponível no momento"; o resto do site segue normal.
- Front: botão flutuante no canto, painel de chat estilizado nos dois
  temas, respostas exibidas como texto puro.
- Testes com a API da Anthropic simulada (mock), sem gastar créditos.

### Swagger
- swagger-ui-express em GET /docs, com openapi.yaml cobrindo todos os
  endpoints, autenticação Bearer, exemplos de requisição/resposta e o
  formato padrão de erro.

### E-mails transacionais (Resend)
- RESEND_API_KEY e EMAIL_FROM (domínio verificado) só no env do back-end.
  EMAIL_ENABLED=false por padrão; sem chave, os envios são ignorados.
- Enviar: "Você venceu" (com link do comprovante) e "Seu lote foi
  encerrado" (para o leiloeiro, com o resultado) na liquidação;
  "Você foi superado" (com link da sala) quando o líder é coberto.
- Envio SEMPRE depois do commit da transação e sem bloquear a resposta
  (fire-and-forget com log de erro). Falha no e-mail nunca afeta lance
  ou liquidação.
- Não enviar para domínios de demonstração (@demo.com).
- Não revelar quem deu o lance no e-mail de "superado".
- HTML simples e responsivo, com versão em texto puro.
- Testes com o cliente do Resend simulado (mock).

