// Assistente flutuante: botão no canto que abre um painel de chat com a IA.
// - A conversa fica só na memória da página (some ao recarregar).
// - As respostas são exibidas como TEXTO PURO: o React escapa o conteúdo e o CSS mantém as
//   quebras de linha. Nada de HTML/markdown vindo da IA é interpretado.
// - A chave da Anthropic fica no back-end; o front só chama POST /assistant/chat.
import { useEffect, useRef, useState } from 'react';
import { assistantApi } from '../api/endpoints';
import { Button } from './Button';
import { Icon } from './Icon';

const MAX_CHARS = 500; // mesmo limite do back-end
const HISTORY_LIMIT = 6; // o back-end também corta, mas não há por que enviar mais

const WELCOME =
  'Olá! Sou o assistente da Casa de Leilões. Posso explicar como dar lances, como funciona a carteira, o anti-sniping, a liquidação, o comprovante e a auditoria.';

const SUGGESTIONS = [
  'Como dou um lance?',
  'O que é saldo comprometido?',
  'Como funciona o anti-sniping?',
  'Como confiro a auditoria de um lote?',
];

let nextId = 1;
const makeMessage = (role, content) => ({ id: nextId++, role, content });

export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => [makeMessage('assistant', WELCOME)]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const toggleRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const hasAsked = messages.some((m) => m.role === 'user');

  // Foco no campo ao abrir; rola até a última mensagem quando chega uma nova.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending, open]);

  function close() {
    setOpen(false);
    toggleRef.current?.focus(); // devolve o foco ao botão que abriu o painel
  }

  async function send(text) {
    const question = text.trim();
    if (!question || sending || question.length > MAX_CHARS) return;

    // Histórico enviado: só perguntas e respostas reais (sem boas-vindas e sem avisos de erro).
    const history = messages
      .filter((m) => m.role === 'user' || (m.role === 'assistant' && m.content !== WELCOME))
      .slice(-HISTORY_LIMIT)
      .map(({ role, content }) => ({ role, content }));

    setMessages((prev) => [...prev, makeMessage('user', question)]);
    setDraft('');
    setSending(true);
    try {
      const { reply } = await assistantApi.chat(question, history);
      setMessages((prev) => [...prev, makeMessage('assistant', reply)]);
    } catch (err) {
      // 503 → "Assistente indisponível no momento"; 429 → aviso de limite; rede → sem conexão.
      setMessages((prev) => [...prev, makeMessage('error', err.message)]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function handleKeyDown(event) {
    // Enter envia; Shift+Enter quebra a linha.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send(draft);
    }
  }

  const tooLong = draft.length > MAX_CHARS;

  return (
    <div className="assistant">
      {open && (
        <section
          id="assistant-panel"
          className="assistant__panel"
          role="dialog"
          aria-label="Assistente da Casa de Leilões"
          onKeyDown={(e) => e.key === 'Escape' && close()}
        >
          <header className="assistant__header">
            <span className="assistant__avatar" aria-hidden="true">
              <Icon name="gavel" size={18} />
            </span>
            <div className="assistant__title">
              <strong>Assistente</strong>
              <small>Dúvidas sobre a Casa de Leilões</small>
            </div>
            <button type="button" className="assistant__close" onClick={close} aria-label="Fechar assistente">
              <Icon name="close" />
            </button>
          </header>

          <div className="assistant__messages" ref={listRef} role="log" aria-live="polite">
            {messages.map((m) => (
              <p key={m.id} className={`assistant__msg assistant__msg--${m.role}`}>
                {m.role === 'error' && <Icon name="alert" size={16} />}
                <span>{m.content}</span>
              </p>
            ))}
            {sending && (
              <p className="assistant__msg assistant__msg--assistant assistant__typing" aria-label="Digitando">
                <span />
                <span />
                <span />
              </p>
            )}

            {!hasAsked && (
              <div className="assistant__suggestions" aria-label="Sugestões de perguntas">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" className="assistant__chip" onClick={() => send(s)} disabled={sending}>
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <form
            className="assistant__form"
            onSubmit={(e) => {
              e.preventDefault();
              send(draft);
            }}
          >
            <textarea
              aria-label="Sua pergunta"
              ref={inputRef}
              rows={2}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte sobre lances, carteira, auditoria..."
              aria-describedby="assistant-counter"
              aria-invalid={tooLong || undefined}
            />
            <div className="assistant__form-footer">
              <small id="assistant-counter" className={tooLong ? 'assistant__counter--over' : undefined}>
                {draft.length}/{MAX_CHARS}
              </small>
              <Button type="submit" className="btn--sm" loading={sending} disabled={!draft.trim() || tooLong}>
                <Icon name="send" size={16} /> Enviar
              </Button>
            </div>
          </form>
        </section>
      )}

      <button
        ref={toggleRef}
        type="button"
        className="assistant__toggle"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls="assistant-panel"
        aria-label={open ? 'Fechar assistente' : 'Abrir assistente'}
      >
        <Icon name={open ? 'close' : 'chat'} size={24} />
      </button>
    </div>
  );
}
