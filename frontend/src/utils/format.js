// Formatação para exibição. A API trabalha em centavos e UTC; aqui viramos R$ e fuso local.

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatBRL(cents) {
  if (cents === null || cents === undefined) return '—';
  return brl.format(cents / 100);
}

// "1.050,00" | "1050" | "R$ 1.050,5" → 105050 centavos. Retorna null se inválido.
export function parseBRL(text) {
  if (typeof text !== 'string') return null;
  let clean = text.replace(/R\$|\s/g, '');
  if (!clean) return null;
  // Formato brasileiro: ponto = milhar, vírgula = decimal
  if (clean.includes(',')) clean = clean.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

// Centavos → texto editável "1.050,00" (para pré-preencher inputs)
export function centsToInput(cents) {
  return (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const dateTimeSeconds = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });
const dateLong = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' });

export const formatDateTime = (iso) => (iso ? dateTime.format(new Date(iso)) : '—');
export const formatDateTimeSeconds = (iso) => (iso ? dateTimeSeconds.format(new Date(iso)) : '—');
export const formatDateLong = (iso) => (iso ? dateLong.format(new Date(iso)) : '—');

// Duração em ms → "3d 04:12:09" ou "04:12:09"
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const h = String(Math.floor((total % 86400) / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return days > 0 ? `${days}d ${h}:${m}:${s}` : `${h}:${m}:${s}`;
}

// Hash longo → "dff39e51…a3c2" (o completo vai no title)
export const shortHash = (hash) => (hash && hash.length > 16 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash);

// Date → valor para <input type="datetime-local"> (no fuso local)
export function toDateTimeLocal(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
