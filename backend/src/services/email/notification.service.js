// Notificações por e-mail (Resend).
//
// Regras:
//   - Só são disparadas DEPOIS do commit da transação (quem chama faz isso após o
//     `await prisma.$transaction(...)`), então nunca avisam algo que foi desfeito.
//   - Fire-and-forget: a resposta HTTP não espera o e-mail. Qualquer erro vira só log;
//     falha no e-mail nunca afeta lance ou liquidação.
//   - Desligado (EMAIL_ENABLED != true) ou sem chave: o envio é ignorado com log.
//   - Endereços @demo.com (contas do seed) nunca recebem e-mail.
const prisma = require('../../lib/prisma');
const env = require('../../config/env');
const { getResendClient } = require('../../lib/resendClient');
const { bidderAlias } = require('../hashChain.service');
const { getMinNextBidCents } = require('../../utils/lot');
const templates = require('./templates');

const DEMO_DOMAIN = '@demo.com';

// "ana.souza@gmail.com" → "a***@gmail.com" (o log não expõe o e-mail inteiro)
function maskEmail(email) {
  const [user, domain] = String(email).split('@');
  return `${user.slice(0, 1)}***@${domain}`;
}

async function sendEmail({ to, subject, html, text }) {
  if (to.toLowerCase().endsWith(DEMO_DOMAIN)) {
    console.info(`[email] conta de demonstração, não enviado: "${subject}" → ${maskEmail(to)}`);
    return { skipped: 'demo' };
  }
  if (!env.EMAIL_ENABLED || !env.RESEND_API_KEY) {
    console.info(`[email] envio desativado, não enviado: "${subject}" → ${maskEmail(to)}`);
    return { skipped: 'disabled' };
  }

  // O SDK do Resend devolve { data, error } em vez de lançar exceção em erros da API.
  const { data, error } = await getResendClient().emails.send({ from: env.EMAIL_FROM, to, subject, html, text });
  if (error) throw new Error(`Resend recusou o envio: ${error.message || error.name}`);
  console.info(`[email] enviado: "${subject}" → ${maskEmail(to)} (id ${data?.id})`);
  return { sent: true, id: data?.id };
}

// ---------- Disparo em segundo plano ----------

const pending = new Set();

// Agenda a tarefa para DEPOIS da resposta HTTP (setImmediate) e nunca deixa o erro escapar.
function dispatch(label, task) {
  const promise = new Promise((resolve) => setImmediate(resolve))
    .then(task)
    .catch((err) => console.error(`[email] falha ao enviar (${label}):`, err.message))
    .finally(() => pending.delete(promise));
  pending.add(promise);
}

// Usado por testes e pelo seed: espera os e-mails disparados até agora terminarem.
async function waitForPendingEmails() {
  while (pending.size > 0) await Promise.allSettled([...pending]);
}

// ---------- Notificações ----------

// Líder anterior foi coberto. Não revela quem cobriu.
function notifyOutbid({ lotId, previousLeaderId }) {
  dispatch('superado', async () => {
    const [user, lot] = await Promise.all([
      prisma.user.findUnique({ where: { id: previousLeaderId } }),
      prisma.lot.findUnique({ where: { id: lotId } }),
    ]);
    if (!user || !lot) return;
    const email = templates.outbidEmail({
      name: user.name,
      lot: { ...lot, minNextBidCents: getMinNextBidCents(lot) },
      roomUrl: `${env.APP_URL}/lotes/${lot.id}`,
    });
    await sendEmail({ to: user.email, ...email });
  });
}

// Lote liquidado: "Você venceu" para o vencedor e "Seu lote foi encerrado" para o leiloeiro.
function notifySettlement(lotId) {
  dispatch('liquidação', async () => {
    const lot = await prisma.lot.findUnique({
      where: { id: lotId },
      include: { auctioneer: true, winner: true, receipt: true },
    });
    if (!lot || lot.status !== 'SETTLED') return;

    const sold = Boolean(lot.winner && lot.receipt);
    const receiptUrl = sold ? `${env.APP_URL}/comprovante/${lot.receipt.code}` : null;
    const sends = [];

    if (sold) {
      const won = templates.wonEmail({
        name: lot.winner.name,
        lot,
        amountCents: lot.finalPriceCents,
        receiptCode: lot.receipt.code,
        receiptUrl,
      });
      sends.push(sendEmail({ to: lot.winner.email, ...won }));
    }

    const ended = templates.lotEndedEmail({
      name: lot.auctioneer.name,
      lot,
      sold,
      amountCents: lot.finalPriceCents,
      winnerAlias: sold ? bidderAlias(lot.id, lot.winner.id) : null,
      receiptUrl,
      dashboardUrl: `${env.APP_URL}/painel`,
    });
    sends.push(sendEmail({ to: lot.auctioneer.email, ...ended }));

    // Um e-mail falhar não impede o outro; as falhas vão para o log.
    const results = await Promise.allSettled(sends);
    for (const r of results) {
      if (r.status === 'rejected') console.error('[email] falha ao enviar (liquidação):', r.reason.message);
    }
  });
}

// ---------- Lances no lote (para o leiloeiro) ----------
//
// - 1º lance: e-mail na hora (notifyFirstBid, chamado pelo placeBid depois do commit).
// - Lances seguintes: no máximo 1 resumo por lote a cada 15 min (sendDueBidDigests, chamado
//   pelo job a cada 15 s). O job, e não o lance, decide o envio: assim os lances feitos dentro
//   da janela entram no resumo mesmo que ninguém mais dê lance depois.
// - O controle fica no próprio lote: auctioneerNotifiedAt (quando foi o último aviso) e
//   auctioneerNotifiedBidCount (até qual lance o leiloeiro já foi avisado).
// - Quem deu lance aparece só pelo apelido (Licitante #XXXXXX), nunca nome ou e-mail.

const BID_DIGEST_INTERVAL_MS = 15 * 60 * 1000;

// "Reserva" o aviso: só grava se o lote ainda estiver no estado que lemos (mesmo
// auctioneerNotifiedBidCount). Se duas rodadas do job (ou duas instâncias) tentarem ao mesmo
// tempo, só uma consegue (count = 1) e só ela envia: nada de e-mail duplicado.
async function claimBidNotification(lot, now) {
  const { count } = await prisma.lot.updateMany({
    where: { id: lot.id, auctioneerNotifiedBidCount: lot.auctioneerNotifiedBidCount },
    data: { auctioneerNotifiedAt: now, auctioneerNotifiedBidCount: lot.bidCount },
  });
  return count === 1;
}

function notifyFirstBid(lotId) {
  dispatch('primeiro lance', async () => {
    const now = new Date();
    const lot = await prisma.lot.findUnique({ where: { id: lotId }, include: { auctioneer: true } });
    // Já avisado (ex.: o job chegou antes) ou lote sem lances/inativo: nada a fazer.
    if (!lot || lot.status !== 'ACTIVE' || lot.auctioneerNotifiedBidCount > 0 || lot.bidCount === 0) return;

    // O e-mail fala do 1º lance; se outros chegaram nesse meio-tempo, ficam para o resumo.
    const first = await prisma.bid.findUnique({ where: { lotId_seq: { lotId, seq: 1 } } });
    const claimed = await claimBidNotification({ ...lot, bidCount: 1 }, now);
    if (!claimed) return;

    const email = templates.firstBidEmail({
      name: lot.auctioneer.name,
      lot: { ...lot, currentBidCents: first.amountCents },
      bidderAlias: first.bidderAlias,
      now,
      roomUrl: `${env.APP_URL}/lotes/${lot.id}`,
    });
    await sendEmail({ to: lot.auctioneer.email, ...email });
  });
}

// Envia os resumos vencidos: lotes ao vivo com lances ainda não avisados e cujo último aviso
// foi há 15 min ou mais. Lotes já encerrados ficam de fora (o "Seu lote foi encerrado" cobre).
// Recebe `now` para os testes simularem a passagem do tempo.
async function sendDueBidDigests({ now = new Date() } = {}) {
  const lots = await prisma.lot.findMany({
    where: {
      status: 'ACTIVE',
      endsAt: { gt: now },
      bidCount: { gt: 0 },
      OR: [
        { auctioneerNotifiedAt: null },
        { auctioneerNotifiedAt: { lte: new Date(now.getTime() - BID_DIGEST_INTERVAL_MS) } },
      ],
    },
    include: { auctioneer: true },
    take: 50,
  });

  let sent = 0;
  for (const lot of lots) {
    const newBids = lot.bidCount - lot.auctioneerNotifiedBidCount;
    if (newBids <= 0) continue; // nenhum lance novo desde o último aviso
    try {
      if (!(await claimBidNotification(lot, now))) continue;
      const email = templates.bidDigestEmail({
        name: lot.auctioneer.name,
        lot,
        newBids,
        leaderAlias: bidderAlias(lot.id, lot.leaderId),
        now,
        roomUrl: `${env.APP_URL}/lotes/${lot.id}`,
      });
      const result = await sendEmail({ to: lot.auctioneer.email, ...email });
      if (result.sent) sent += 1;
    } catch (err) {
      // Um lote com erro não impede os outros; só log.
      console.error(`[email] falha ao enviar (resumo de lances, lote ${lot.id}):`, err.message);
    }
  }
  return { sent };
}

module.exports = {
  notifyOutbid,
  notifySettlement,
  notifyFirstBid,
  sendDueBidDigests,
  waitForPendingEmails,
  sendEmail,
  BID_DIGEST_INTERVAL_MS,
};
