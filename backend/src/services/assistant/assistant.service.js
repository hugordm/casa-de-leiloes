// Assistente da Casa de Leilões: responde dúvidas sobre o site usando a API da Anthropic.
//
// Proteções (além do limite por IP, que fica na rota):
//   - mensagem de até 500 caracteres;
//   - só as últimas 6 mensagens do histórico vão para o modelo (custo previsível);
//   - max_tokens baixo e timeout no cliente (lib/anthropicClient.js);
//   - sem chave ou com a API fora do ar → 503 "Assistente indisponível no momento".
// O assistente não tem ferramentas: só recebe texto e devolve texto. Ele não executa ações
// nem consulta o banco, então não tem como acessar dados de usuários.
const env = require('../../config/env');
const AppError = require('../../errors/AppError');
const { getAnthropicClient } = require('../../lib/anthropicClient');
const { SYSTEM_PROMPT } = require('./systemPrompt');

const MAX_MESSAGE_CHARS = 500;
const HISTORY_LIMIT = 6;
// O Haiku 5.5 "pensa" antes de responder (thinking adaptativo, ligado por padrão), e esse
// raciocínio conta dentro do max_tokens. Por isso o limite tem folga para pensar + ~3 frases.
const MAX_TOKENS = 800;
// Esforço baixo: perguntas de ajuda são simples, e isso deixa a resposta mais rápida e barata.
const EFFORT = 'low';
// Respostas antigas do assistente são cortadas neste tamanho antes de voltar ao modelo.
const MAX_HISTORY_REPLY_CHARS = 2000;

const UNAVAILABLE_MESSAGE = 'Assistente indisponível no momento';
const FALLBACK_REPLY =
  'Desculpe, não consegui responder agora. Posso ajudar com lances, carteira, liquidação, comprovante ou auditoria.';

function unavailable() {
  return new AppError(503, 'ASSISTANT_UNAVAILABLE', UNAVAILABLE_MESSAGE);
}

function validateMessage(message) {
  if (typeof message !== 'string' || !message.trim()) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Digite uma pergunta');
  }
  const text = message.trim();
  if (text.length > MAX_MESSAGE_CHARS) {
    throw new AppError(400, 'MESSAGE_TOO_LONG', `A mensagem deve ter no máximo ${MAX_MESSAGE_CHARS} caracteres`);
  }
  return text;
}

// O histórico vem do navegador, então não é confiável: aceita só { role, content } com
// papéis válidos e texto, corta o tamanho e mantém apenas as últimas HISTORY_LIMIT mensagens.
function sanitizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const clean = history
    .filter(
      (m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim()
    )
    .map((m) => ({
      role: m.role,
      content: m.content.trim().slice(0, m.role === 'user' ? MAX_MESSAGE_CHARS : MAX_HISTORY_REPLY_CHARS),
    }))
    .slice(-HISTORY_LIMIT);

  // A API exige que a conversa comece com uma mensagem do usuário.
  while (clean.length && clean[0].role !== 'user') clean.shift();
  return clean;
}

// Garantia extra de texto puro: mesmo instruído a não usar markdown, o modelo pode escapar
// um "**negrito**" ou "# título". O front exibe tudo como texto, então limpamos aqui.
function toPlainText(text) {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)') // [texto](url) → texto (url)
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2') // **negrito** / __negrito__
    .replace(/`([^`]+)`/g, '$1') // `código`
    .replace(/^\s{0,3}#{1,6}\s+/gm, '') // # títulos
    .replace(/^\s*[-*]\s+/gm, '• ') // listas com - ou *
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// POST /assistant/chat { message, history? } → { reply }
async function chat({ message, history } = {}) {
  const text = validateMessage(message);
  if (!env.ANTHROPIC_API_KEY) throw unavailable();

  const messages = [...sanitizeHistory(history), { role: 'user', content: text }];

  let response;
  try {
    response = await getAnthropicClient().messages.create({
      model: env.ANTHROPIC_CHAT_MODEL,
      max_tokens: MAX_TOKENS,
      output_config: { effort: EFFORT },
      system: SYSTEM_PROMPT,
      messages,
    });
  } catch (err) {
    // Chave inválida, limite da conta, timeout, rede, API fora... Para o usuário é tudo
    // "indisponível"; o detalhe fica só no log do servidor.
    console.error('[assistente] falha ao chamar a API da Anthropic:', err.status || '', err.message);
    throw unavailable();
  }

  // A resposta é uma lista de blocos (ex.: "thinking" + "text"); só os de texto interessam.
  const reply = toPlainText(
    response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
  );

  // Sem texto: recusa pelos filtros de segurança ou max_tokens gasto todo no raciocínio.
  if (!reply) {
    console.warn(`[assistente] resposta sem texto (stop_reason: ${response.stop_reason})`);
    return { reply: FALLBACK_REPLY };
  }
  return { reply };
}

module.exports = { chat, sanitizeHistory, toPlainText, MAX_MESSAGE_CHARS, HISTORY_LIMIT, MAX_TOKENS };
