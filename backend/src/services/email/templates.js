// Templates dos e-mails transacionais: cada função devolve { subject, html, text }.
//
// HTML de e-mail é diferente de HTML de site: clientes como Gmail e Outlook ignoram
// <style> externo e CSS moderno. Por isso: layout em <table>, estilos inline, largura
// máxima de 560px (fluida no celular) e fontes "seguras". Sempre com versão em texto puro.
const { formatBRL } = require('../../utils/money');

const COLORS = { bg: '#f6f2ea', card: '#fffdf9', ink: '#1d1a16', muted: '#6b6255', brass: '#8a6a2f', border: '#e3dacb' };
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// Títulos de obras vêm de API externa e nomes vêm de usuários: sempre escapar no HTML.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Datas no fuso de Brasília (o servidor roda em UTC).
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});
const formatDate = (date) => `${dateFormat.format(new Date(date))} (horário de Brasília)`;

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'olá';

function button(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
    <tr><td style="background:${COLORS.ink};border-radius:6px;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;font-family:${SANS};font-size:15px;font-weight:600;color:${COLORS.bg};text-decoration:none;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

function infoRow(label, value) {
  return `<tr>
    <td style="padding:6px 0;font-family:${SANS};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${COLORS.muted};">${escapeHtml(label)}</td>
    <td style="padding:6px 0;font-family:${SANS};font-size:15px;font-weight:600;color:${COLORS.ink};text-align:right;">${escapeHtml(value)}</td>
  </tr>`;
}

// Moldura comum: cabeçalho com a marca, cartão de conteúdo e rodapé.
// `preheader` é o texto de prévia que aparece na caixa de entrada (fica invisível no corpo).
function layout({ preheader, title, bodyHtml }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLORS.bg};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
        <tr><td style="padding:0 4px 16px;font-family:${SERIF};font-size:22px;font-weight:bold;color:${COLORS.ink};">
          Casa de Leilões
          <div style="font-family:${SANS};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${COLORS.brass};margin-top:4px;">Leilões de arte</div>
        </td></tr>
        <tr><td style="background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:12px;padding:28px 24px;">
          <h1 style="margin:0 0 16px;font-family:${SERIF};font-size:26px;line-height:1.2;font-weight:normal;color:${COLORS.ink};">${escapeHtml(title)}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:16px 4px;font-family:${SANS};font-size:12px;line-height:1.5;color:${COLORS.muted};">
          Você recebeu este e-mail porque participa de leilões na Casa de Leilões.
          Os lances são auditáveis publicamente por corrente de hashes.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

const paragraph = (html) =>
  `<p style="margin:0 0 12px;font-family:${SANS};font-size:15px;line-height:1.6;color:${COLORS.ink};">${html}</p>`;

const infoTable = (rows) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border-top:1px solid ${COLORS.border};border-bottom:1px solid ${COLORS.border};">${rows.join('')}</table>`;

// ---------- "Você foi superado" (para o líder anterior) ----------
// Não revela QUEM cobriu: nem nome, nem e-mail, nem apelido.
function outbidEmail({ name, lot, roomUrl }) {
  const title = `Você foi superado em "${lot.title}"`;
  const html = layout({
    preheader: `Alguém ofereceu ${formatBRL(lot.currentBidCents)}. Ainda dá tempo de voltar à liderança.`,
    title: 'Você foi superado',
    bodyHtml: [
      paragraph(`${escapeHtml(firstName(name))}, um novo lance passou o seu em <strong>${escapeHtml(lot.title)}</strong>, de ${escapeHtml(lot.artist)}.`),
      infoTable([
        infoRow('Lance atual', formatBRL(lot.currentBidCents)),
        infoRow('Lance mínimo para cobrir', formatBRL(lot.minNextBidCents)),
        infoRow('Termina em', formatDate(lot.endsAt)),
      ]),
      paragraph('O valor que estava reservado no seu saldo já voltou a ficar disponível.'),
      button(roomUrl, 'Ir para a sala do lote'),
    ].join('\n'),
  });
  const text = [
    `${firstName(name)}, um novo lance passou o seu em "${lot.title}", de ${lot.artist}.`,
    '',
    `Lance atual: ${formatBRL(lot.currentBidCents)}`,
    `Lance mínimo para cobrir: ${formatBRL(lot.minNextBidCents)}`,
    `Termina em: ${formatDate(lot.endsAt)}`,
    '',
    'O valor que estava reservado no seu saldo já voltou a ficar disponível.',
    `Sala do lote: ${roomUrl}`,
    '',
    '— Casa de Leilões',
  ].join('\n');
  return { subject: title, html, text };
}

// ---------- "Você venceu" (para o vencedor) ----------
function wonEmail({ name, lot, amountCents, receiptCode, receiptUrl }) {
  const html = layout({
    preheader: `Você arrematou "${lot.title}" por ${formatBRL(amountCents)}.`,
    title: 'Parabéns, você venceu!',
    bodyHtml: [
      paragraph(`${escapeHtml(firstName(name))}, você arrematou <strong>${escapeHtml(lot.title)}</strong>, de ${escapeHtml(lot.artist)}.`),
      infoTable([
        infoRow('Valor do arremate', formatBRL(amountCents)),
        infoRow('Comprovante nº', receiptCode),
      ]),
      paragraph('O valor foi debitado do seu saldo. O comprovante é público e pode ser compartilhado; ele identifica você apenas pelo apelido usado no leilão.'),
      button(receiptUrl, 'Ver comprovante'),
    ].join('\n'),
  });
  const text = [
    `${firstName(name)}, você arrematou "${lot.title}", de ${lot.artist}.`,
    '',
    `Valor do arremate: ${formatBRL(amountCents)}`,
    `Comprovante nº: ${receiptCode}`,
    '',
    'O valor foi debitado do seu saldo.',
    `Comprovante: ${receiptUrl}`,
    '',
    '— Casa de Leilões',
  ].join('\n');
  return { subject: `Você arrematou "${lot.title}"`, html, text };
}

// ---------- "Seu lote foi encerrado" (para o leiloeiro) ----------
function lotEndedEmail({ name, lot, sold, amountCents, winnerAlias, receiptUrl, dashboardUrl }) {
  const resultRows = sold
    ? [infoRow('Resultado', 'Vendido'), infoRow('Valor', formatBRL(amountCents)), infoRow('Arrematante', winnerAlias), infoRow('Lances', String(lot.bidCount))]
    : [infoRow('Resultado', 'Encerrado sem lances')];
  const html = layout({
    preheader: sold ? `Vendido por ${formatBRL(amountCents)}.` : 'O leilão terminou sem lances.',
    title: 'Seu lote foi encerrado',
    bodyHtml: [
      paragraph(`${escapeHtml(firstName(name))}, o leilão de <strong>${escapeHtml(lot.title)}</strong> terminou.`),
      infoTable(resultRows),
      paragraph(sold ? `${formatBRL(amountCents)} foram creditados no seu saldo.` : 'Você pode colocar a obra em um novo leilão quando quiser.'),
      button(sold ? receiptUrl : dashboardUrl, sold ? 'Ver comprovante' : 'Abrir o painel'),
    ].join('\n'),
  });
  const text = [
    `${firstName(name)}, o leilão de "${lot.title}" terminou.`,
    '',
    ...(sold
      ? [`Resultado: vendido por ${formatBRL(amountCents)}`, `Arrematante: ${winnerAlias}`, `Lances: ${lot.bidCount}`, '', `${formatBRL(amountCents)} foram creditados no seu saldo.`, `Comprovante: ${receiptUrl}`]
      : ['Resultado: encerrado sem lances', `Painel: ${dashboardUrl}`]),
    '',
    '— Casa de Leilões',
  ].join('\n');
  return { subject: `Seu lote "${lot.title}" foi encerrado`, html, text };
}

// "2 h 05 min", "3 dias e 4 h", "menos de 1 min" — tempo até o fim, no momento do envio.
function formatRemaining(ms) {
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 1) return 'menos de 1 min';
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const minutes = totalMin % 60;
  if (days > 0) return `${days} ${days === 1 ? 'dia' : 'dias'}${hours ? ` e ${hours} h` : ''}`;
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`;
  return `${minutes} min`;
}

// ---------- "Seu lote começou a receber lances" (para o leiloeiro, no 1º lance) ----------
// Quem deu o lance aparece só pelo apelido (privacidade).
function firstBidEmail({ name, lot, bidderAlias, now, roomUrl }) {
  const remaining = formatRemaining(new Date(lot.endsAt) - now);
  const html = layout({
    preheader: `Primeiro lance: ${formatBRL(lot.currentBidCents)}.`,
    title: 'Seu lote começou a receber lances',
    bodyHtml: [
      paragraph(`${escapeHtml(firstName(name))}, <strong>${escapeHtml(lot.title)}</strong> recebeu o primeiro lance.`),
      infoTable([
        infoRow('Primeiro lance', formatBRL(lot.currentBidCents)),
        infoRow('Licitante', bidderAlias),
        infoRow('Tempo restante', remaining),
        infoRow('Termina em', formatDate(lot.endsAt)),
      ]),
      paragraph('Para não lotar sua caixa de entrada, os próximos lances chegam em um resumo, no máximo a cada 15 minutos.'),
      button(roomUrl, 'Acompanhar na sala do lote'),
    ].join('\n'),
  });
  const text = [
    `${firstName(name)}, "${lot.title}" recebeu o primeiro lance.`,
    '',
    `Primeiro lance: ${formatBRL(lot.currentBidCents)}`,
    `Licitante: ${bidderAlias}`,
    `Tempo restante: ${remaining}`,
    `Termina em: ${formatDate(lot.endsAt)}`,
    '',
    'Os próximos lances chegam em um resumo, no máximo a cada 15 minutos.',
    `Sala do lote: ${roomUrl}`,
    '',
    '— Casa de Leilões',
  ].join('\n');
  return { subject: `Seu lote "${lot.title}" começou a receber lances`, html, text };
}

// ---------- Resumo de lances (para o leiloeiro, no máximo 1 a cada 15 min por lote) ----------
function bidDigestEmail({ name, lot, newBids, leaderAlias, now, roomUrl }) {
  const remaining = formatRemaining(new Date(lot.endsAt) - now);
  const label = newBids === 1 ? '1 lance novo' : `${newBids} lances novos`;
  const html = layout({
    preheader: `${label}. Lance atual: ${formatBRL(lot.currentBidCents)}.`,
    title: 'Resumo de lances',
    bodyHtml: [
      paragraph(`${escapeHtml(firstName(name))}, <strong>${escapeHtml(lot.title)}</strong> recebeu ${label} desde o último aviso.`),
      infoTable([
        infoRow('Lances novos', String(newBids)),
        infoRow('Lance atual', formatBRL(lot.currentBidCents)),
        infoRow('Liderando', leaderAlias),
        infoRow('Total de lances', String(lot.bidCount)),
        infoRow('Tempo restante', remaining),
        infoRow('Termina em', formatDate(lot.endsAt)),
      ]),
      button(roomUrl, 'Acompanhar na sala do lote'),
    ].join('\n'),
  });
  const text = [
    `${firstName(name)}, "${lot.title}" recebeu ${label} desde o último aviso.`,
    '',
    `Lances novos: ${newBids}`,
    `Lance atual: ${formatBRL(lot.currentBidCents)}`,
    `Liderando: ${leaderAlias}`,
    `Total de lances: ${lot.bidCount}`,
    `Tempo restante: ${remaining}`,
    `Termina em: ${formatDate(lot.endsAt)}`,
    '',
    `Sala do lote: ${roomUrl}`,
    '',
    '— Casa de Leilões',
  ].join('\n');
  return { subject: `"${lot.title}": ${label}`, html, text };
}

// ---------- "Lote cancelado" (para quem deu lance no lote) ----------
// O líder recebe a informação do valor liberado; os demais, só o aviso.
function lotCancelledEmail({ name, lot, wasLeader, releasedCents, showcaseUrl }) {
  const money = wasLeader
    ? `O valor de ${formatBRL(releasedCents)}, que estava comprometido com o seu lance, voltou para o seu saldo disponível. Nada foi debitado.`
    : 'Nada foi debitado do seu saldo.';
  const html = layout({
    preheader: wasLeader ? `${formatBRL(releasedCents)} voltaram para o seu saldo disponível.` : 'O leilão foi encerrado sem vencedor.',
    title: 'Lote cancelado',
    bodyHtml: [
      paragraph(`${escapeHtml(firstName(name))}, o leiloeiro cancelou o leilão de <strong>${escapeHtml(lot.title)}</strong>, de ${escapeHtml(lot.artist)}, em que você deu lance.`),
      paragraph(money),
      button(showcaseUrl, 'Ver outros lotes'),
    ].join('\n'),
  });
  const text = [
    `${firstName(name)}, o leiloeiro cancelou o leilão de "${lot.title}", de ${lot.artist}, em que você deu lance.`,
    '',
    money,
    '',
    `Outros lotes: ${showcaseUrl}`,
    '',
    '— Casa de Leilões',
  ].join('\n');
  return { subject: `Lote cancelado: "${lot.title}"`, html, text };
}

module.exports = {
  outbidEmail,
  wonEmail,
  lotEndedEmail,
  firstBidEmail,
  bidDigestEmail,
  lotCancelledEmail,
  formatRemaining,
  escapeHtml,
};
