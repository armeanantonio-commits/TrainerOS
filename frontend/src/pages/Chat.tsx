import { useEffect, useMemo, useRef, useState } from 'react';
import Card from '@/components/Card';
import Button from '@/components/Button';
import { buildApiUrl } from '@/services/api';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

const STREAM_ERROR_MARKER = '[TrainerOS] A intervenit o eroare de streaming. Încearcă din nou.';

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Sunt TrainerOS. Te ajut strict cu marketing fitness: ofertă, poziționare, mesaje de vânzare, funnel, lead generation și optimizare de conversie.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const abortRef = useRef<AbortController | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container || !shouldAutoScrollRef.current) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  const canSend = useMemo(() => input.trim().length > 0 && !isStreaming, [input, isStreaming]);

  const updateLastAssistantMessage = (content: string) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const next = [...prev];
      const lastIndex = next.length - 1;
      if (next[lastIndex].role !== 'assistant') {
        return prev;
      }

      next[lastIndex] = {
        ...next[lastIndex],
        content,
      };

      return next;
    });
  };

  const sendMessage = async (rawMessage: string) => {
    const content = rawMessage.trim();
    if (!content || isStreaming) return;

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Nu ești autentificat. Te rugăm să te loghezi din nou.');
      return;
    }

    setError(null);
    setInput('');
    setIsStreaming(true);
    shouldAutoScrollRef.current = true;

    const userMessage: Message = { role: 'user', content };
    const assistantPlaceholder: Message = { role: 'assistant', content: '' };

    const historyForApi = messages.filter((m) => m.content.trim().length > 0);
    setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const response = await fetch(buildApiUrl('/chat/stream'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: content,
          history: historyForApi,
        }),
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        const text = await response.text();
        let errorMessage = 'Nu am putut porni conversația.';

        if (text) {
          try {
            const parsed = JSON.parse(text);
            errorMessage = parsed?.message || parsed?.error || text;
          } catch {
            errorMessage = text;
          }
        }

        throw new Error(errorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      let done = false;
      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;

        if (value) {
          const chunkText = decoder.decode(value, { stream: true });
          if (chunkText) {
            assistantContent += chunkText;

            const errorMarkerIndex = assistantContent.indexOf(STREAM_ERROR_MARKER);
            if (errorMarkerIndex !== -1) {
              const safeContent = assistantContent.slice(0, errorMarkerIndex).trimEnd();
              updateLastAssistantMessage(safeContent);
              throw new Error('Conexiunea de streaming s-a întrerupt. Încearcă din nou.');
            }

            updateLastAssistantMessage(assistantContent);
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'A apărut o eroare la streaming.');
      }
    } finally {
      abortRef.current = null;
      setIsStreaming(false);
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  const handleMessagesScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    const nearBottom = distanceFromBottom < 80;
    shouldAutoScrollRef.current = nearBottom;
    setIsNearBottom(nearBottom);
  };

  return (
    <div className="min-h-[calc(100dvh-4rem)] px-2 py-2 sm:px-3 sm:py-3">
      <div className="mx-auto flex h-[calc(100dvh-4rem-1rem)] max-w-[1800px] flex-col">
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden console-panel-strong rounded-[30px] sm:rounded-[34px]">
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            className="flex-1 min-h-0 space-y-4 overflow-y-auto px-1 pb-2 pr-1 sm:px-2 sm:pr-2"
          >
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[92%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm sm:max-w-[85%] sm:text-base xl:max-w-[78%] ${
                    msg.role === 'user'
                      ? 'bg-[linear-gradient(135deg,rgba(140,248,212,0.96),rgba(114,202,255,0.92))] text-slate-950 font-medium'
                      : 'console-option text-gray-100'
                  }`}
                >
                  {msg.content || (msg.role === 'assistant' && isStreaming ? '...' : '')}
                </div>
              </div>
            ))}
          </div>

          {!isNearBottom && (
            <div className="mt-2 flex justify-center">
              <button
                type="button"
                onClick={() => {
                  const container = messagesContainerRef.current;
                  if (!container) return;
                  container.scrollTop = container.scrollHeight;
                  shouldAutoScrollRef.current = true;
                  setIsNearBottom(true);
                }}
                className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-300/20"
              >
                Vezi mesajul curent
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-[20px] border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="mt-4 sm:mt-6 flex-shrink-0">
            <div className="rounded-[24px] border border-cyan-300/14 bg-white/[0.03] p-3">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Scrie mesajul tău pentru TrainerOS..."
                className="min-h-[88px] w-full resize-none bg-transparent text-white placeholder:text-slate-500 focus:outline-none sm:min-h-[92px]"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendMessage(input);
                  }
                }}
                disabled={isStreaming}
              />

              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400">
                  Enter trimite mesajul • Shift+Enter linie nouă
                </p>
                <div className="flex items-center gap-2">
                  {isStreaming && (
                    <Button variant="outline" onClick={stopStreaming}>
                      Stop
                    </Button>
                  )}
                  <Button onClick={() => void sendMessage(input)} disabled={!canSend}>
                    Trimite
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
