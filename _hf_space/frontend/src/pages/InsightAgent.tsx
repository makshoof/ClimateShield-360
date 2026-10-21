import React, { useEffect, useRef, useState } from 'react';
import { SampleBanner } from '../components/SampleBanner';
import { api, ApiError } from '../api/client';
import { InsightAnswer, InsightCitation, InsightDataRow, InsightFact } from '../types';

interface InsightAgentProps {
  isSample?: boolean;
}

interface ChatTurn {
  id: number;
  question: string;
  askedAt: Date;
  latencyMs?: number;
  answer?: InsightAnswer;
  error?: string;
}

interface StoredChatTurn {
  id: number;
  question: string;
  askedAt: string;
  latencyMs?: number;
  answer?: InsightAnswer;
  error?: string;
}

const STORAGE_KEY = 'cs-insight-chat-v1';
const MAX_STORED_TURNS = 40;

const SUGGESTED = [
  'What is the latest observed temperature in Karachi?',
  "What's the weather today in Karachi?",
  'What is the next-hour rainfall forecast for Karachi?',
  'Heat stroke risk with current Karachi temperature?',
  'When was the last successful hourly ingest?',
  'How does the rainfall model compare with its baseline?',
];

function loadStoredTurns(): ChatTurn[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredChatTurn[];
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(-MAX_STORED_TURNS).map((item) => ({
      id: item.id,
      question: item.question,
      askedAt: new Date(item.askedAt),
      latencyMs: item.latencyMs,
      answer: item.answer,
      error: item.error,
    }));
  } catch {
    return [];
  }
}

function persistTurns(turns: ChatTurn[]) {
  try {
    const payload: StoredChatTurn[] = turns.slice(-MAX_STORED_TURNS).map((turn) => ({
      id: turn.id,
      question: turn.question,
      askedAt: turn.askedAt.toISOString(),
      latencyMs: turn.latencyMs,
      answer: turn.answer,
      error: turn.error,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
  }
}

function formatPktClock(date: Date): string {
  return date.toLocaleTimeString('en-PK', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shortRowLabel(label: string): string {
  const cleaned = label.replace(/\s+/g, ' ').trim();
  const pktMatch = cleaned.match(/(\d{2}:\d{2})\s*PKT/i);
  if (pktMatch) {
    const withoutTime = cleaned
      .replace(/\d{1,2}\s+\w{3}\s+\d{4}\s+\d{2}:\d{2}\s*PKT/i, pktMatch[1])
      .replace(/\s+/g, ' ')
      .trim();
    return withoutTime.length > 64 ? `${withoutTime.slice(0, 61)}…` : withoutTime;
  }
  return cleaned.length > 64 ? `${cleaned.slice(0, 61)}…` : cleaned;
}

function formatFactValue(fact: InsightFact): { display: string; raw: string } {
  const raw = fact.value;
  if (fact.unit === 'probability') {
    const numeric = Number(fact.value);
    if (!Number.isNaN(numeric)) {
      const pct = (numeric * 100).toFixed(1);
      return { display: `${pct}%`, raw };
    }
  }
  return { display: fact.value, raw };
}

function summarySentence(answer: string): string {
  const trimmed = answer.trim();
  const match = trimmed.match(/^(.+?[.!?])(?:\s|$)/);
  return match ? match[1] : trimmed;
}

function isSafetyRelated(turn: ChatTurn): boolean {
  if (turn.answer?.safety_related) return true;
  const text = `${turn.question} ${turn.answer?.answer || ''}`.toLowerCase();
  return (
    text.includes('heat stroke') ||
    text.includes('heatstroke') ||
    text.includes('flood danger') ||
    text.includes('injury') ||
    text.includes('injured')
  );
}

const DataRowChip: React.FC<{ row: InsightDataRow }> = ({ row }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        title={row.row_id}
        onClick={() => setOpen((value) => !value)}
        className="max-w-full truncate rounded-full border border-outline-variant/40 bg-surface-container px-2.5 py-1 text-[11px] font-mono text-on-surface-variant hover:bg-surface-container-high"
      >
        {shortRowLabel(row.label)}
      </button>
      {open && (
        <div className="absolute left-0 z-20 mt-1 w-72 max-w-[80vw] rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-3 text-[11px] shadow-lg">
          <p className="font-semibold text-on-surface mb-1">{shortRowLabel(row.label)}</p>
          <p className="font-mono break-all text-on-surface-variant" title={row.row_id}>
            {row.row_id}
          </p>
          <button
            type="button"
            className="mt-2 text-[10px] uppercase tracking-wide text-secondary"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

const SourceCard: React.FC<{ citation: InsightCitation; index: number }> = ({ citation, index }) => {
  const title = citation.title || citation.source;
  const section = citation.section || citation.detail;
  return (
    <div className="h-full min-w-0 rounded-xl border border-outline-variant/30 bg-surface-container-low p-3 flex gap-2">
      <span className="shrink-0 font-mono text-[11px] font-bold text-secondary">[{index}]</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-on-surface break-words" title={title}>
          {title}
        </p>
        <p className="mt-0.5 text-[11px] text-on-surface-variant break-words" title={section}>
          {section}
        </p>
      </div>
      <span
        className="material-symbols-outlined text-[16px] text-on-surface-variant shrink-0 self-start"
        aria-hidden="true"
        title="Catalog source"
      >
        open_in_new
      </span>
    </div>
  );
};

const AnswerCard: React.FC<{ turn: ChatTurn }> = ({ turn }) => {
  const answer = turn.answer;
  if (!answer) {
    return (
      <div className="w-full rounded-2xl border border-outline-variant/30 bg-surface-container-lowest px-4 py-3 text-sm text-on-surface-variant">
        Checking the warehouse…
      </div>
    );
  }

  const facts = answer.facts || [];
  const dataRows = answer.data_rows || [];
  const citations = answer.citations || [];
  const docCitations = citations.filter((item) => item.source === 'document_catalog' && item.title);
  const otherCitations = citations.filter((item) => !(item.source === 'document_catalog' && item.title));
  const sourceCards = docCitations.length > 0 ? docCitations : otherCitations;
  const summary = summarySentence(answer.answer);
  const showSafety = isSafetyRelated(turn);

  return (
    <div className="w-full max-w-none rounded-2xl border border-outline-variant/30 bg-surface-container-lowest/90 backdrop-blur-sm overflow-hidden shadow-sm">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2 flex-wrap">
        <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
          Evidence-based answer
        </span>
        <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant">
          {answer.status}
        </span>
        {answer.supported === false && (
          <span className="font-mono text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
            observed data
          </span>
        )}
      </div>

      <div className="px-4 pb-3 space-y-3">
        {answer.model_label && (
          <span className="inline-flex max-w-full truncate rounded-full border border-secondary/30 bg-secondary/10 px-2.5 py-1 text-[11px] font-mono text-secondary">
            {answer.model_label}
          </span>
        )}

        <p className="text-sm leading-relaxed text-on-surface">{summary}</p>

        {facts.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-outline-variant/25">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-container text-on-surface-variant">
                <tr>
                  <th className="px-3 py-2 font-semibold">Label</th>
                  <th className="px-3 py-2 font-semibold">Value</th>
                  <th className="px-3 py-2 font-semibold">Unit</th>
                </tr>
              </thead>
              <tbody>
                {facts.map((fact) => {
                  const formatted = formatFactValue(fact);
                  return (
                    <tr key={`${fact.label}-${fact.value}`} className="border-t border-outline-variant/20">
                      <td className="px-3 py-2 text-on-surface">{fact.label}</td>
                      <td className="px-3 py-2 font-mono text-on-surface" title={formatted.raw}>
                        {formatted.display}
                      </td>
                      <td className="px-3 py-2 text-on-surface-variant">
                        {fact.unit === 'probability' ? '%' : fact.unit}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {facts.length === 0 && answer.answer !== summary && (
          <p className="text-sm leading-relaxed text-on-surface-variant">{answer.answer}</p>
        )}

        {sourceCards.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide font-bold text-on-surface-variant mb-2">Sources</p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
              {sourceCards.map((citation, index) => (
                <SourceCard
                  key={`${citation.source}-${citation.title || citation.detail}-${index}`}
                  citation={citation}
                  index={index + 1}
                />
              ))}
            </div>
          </div>
        )}

        {dataRows.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide font-bold text-on-surface-variant mb-2">Data used</p>
            <div className="flex flex-wrap gap-2">
              {dataRows.map((row) => (
                <DataRowChip key={row.row_id} row={row} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mx-4 mb-4 rounded-xl bg-surface-container/80 dark:bg-surface-container/40 px-3 py-3 space-y-2">
        <p className="text-[11px] text-on-surface-variant">
          {showSafety
            ? answer.limitations ||
              'In an emergency contact Sindh PDMA on 1736 and Rescue 1122.'
            : 'Information only. This is not professional or emergency advice.'}
        </p>
        {showSafety && answer.limitations && !answer.limitations.toLowerCase().includes('1736') && (
          <p className="text-[11px] text-on-surface-variant">
            In an emergency contact Sindh PDMA on 1736 and Rescue 1122.
          </p>
        )}
      </div>

      <div className="px-4 pb-3 text-[10px] font-mono text-on-surface-variant">
        {[
          turn.latencyMs != null ? `${turn.latencyMs} ms` : null,
          `${citations.length} source${citations.length === 1 ? '' : 's'}`,
          `${dataRows.length} row${dataRows.length === 1 ? '' : 's'}`,
          formatPktClock(turn.askedAt),
        ]
          .filter(Boolean)
          .join(' · ')}
      </div>
    </div>
  );
};

export const InsightAgent: React.FC<InsightAgentProps> = ({ isSample = false }) => {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<ChatTurn[]>(() => loadStoredTurns());
  const [pending, setPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    persistTurns(turns);
  }, [turns, hydrated]);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [turns, pending]);

  const clearHistory = () => {
    setTurns([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    inputRef.current?.focus();
  };

  const ask = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const id = Date.now();
    const started = performance.now();
    setTurns((current) => [...current, { id, question: trimmed, askedAt: new Date() }]);
    setQuestion('');
    setPending(true);
    try {
      const response = await api.askInsight(trimmed);
      const latencyMs = Math.round(performance.now() - started);
      setTurns((current) =>
        current.map((turn) =>
          turn.id === id ? { ...turn, answer: response.data, latencyMs } : turn
        )
      );
    } catch (err) {
      const message = err instanceof ApiError ? err.detail || err.message : 'The assistant request failed.';
      const latencyMs = Math.round(performance.now() - started);
      setTurns((current) =>
        current.map((turn) => (turn.id === id ? { ...turn, error: message, latencyMs } : turn))
      );
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  };

  const empty = turns.length === 0;

  return (
    <div className="w-full flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex-1 min-h-0 flex flex-col">
        <SampleBanner isSample={isSample} />

        <header className="shrink-0 pt-3 pb-2 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-lg sm:text-xl font-bold text-on-surface tracking-tight">
                AI Climate Assistant
              </h1>
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-secondary/15 text-secondary border border-secondary/25 font-bold">
                WAREHOUSE ONLY
              </span>
            </div>
            <p className="text-xs sm:text-sm text-on-surface-variant mt-1 max-w-4xl">
              Hourly weather, rainfall model, pipeline runs, and catalogued docs — no invented answers.
            </p>
          </div>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={clearHistory}
              disabled={pending}
              className="shrink-0 min-h-[40px] px-3 rounded-xl border border-outline-variant/40 bg-surface-container/70 text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </header>

        <div
          ref={threadRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
          aria-live="polite"
        >
          <div className={`flex flex-col gap-4 py-2 ${empty ? 'min-h-full justify-center' : 'pb-4'}`}>
            {empty && (
              <div className="w-full rounded-3xl border border-outline-variant/25 bg-gradient-to-b from-surface-container-low to-surface-container-lowest p-5 sm:p-7 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-2xl bg-secondary/15 text-secondary flex items-center justify-center">
                    <span className="material-symbols-outlined text-[22px]">auto_awesome</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-on-surface">Ask the warehouse</p>
                    <p className="text-xs text-on-surface-variant">Saved locally in this browser</p>
                  </div>
                </div>
                <p className="text-sm text-on-surface-variant mb-4 max-w-3xl">
                  Observed temperature, today’s weather, 1-hour rainfall, heat-health guidance, pipeline status, or model scores.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {SUGGESTED.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => ask(prompt)}
                      disabled={pending}
                      className="w-full text-left text-xs sm:text-sm px-3.5 py-3 rounded-2xl bg-background/80 text-on-surface border border-secondary/25 hover:border-secondary/50 hover:bg-secondary/10 disabled:opacity-60 transition-colors whitespace-normal break-words"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {turns.map((turn) => (
              <div key={turn.id} className="flex flex-col gap-3 w-full">
                <div className="flex justify-end gap-2 w-full">
                  <div className="w-full sm:w-[min(100%,52rem)] min-w-0 flex flex-col items-end gap-1">
                    <div className="w-full rounded-2xl rounded-br-md bg-primary text-on-primary px-4 py-2.5 text-sm shadow-sm whitespace-pre-wrap break-words">
                      {turn.question}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-mono text-on-surface-variant">
                      {turn.answer?.zone && (
                        <span className="rounded-full border border-outline-variant/40 px-2 py-0.5">
                          {turn.answer.zone}
                        </span>
                      )}
                      <span>{formatPktClock(turn.askedAt)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-start gap-2 w-full">
                  <div
                    className="w-8 h-8 rounded-full bg-secondary text-on-secondary flex items-center justify-center shrink-0 mt-0.5"
                    aria-hidden="true"
                  >
                    <span className="material-symbols-outlined text-[18px]">psychology</span>
                  </div>
                  <div className="min-w-0 flex-1 w-full">
                    {turn.error ? (
                      <div className="w-full rounded-2xl border border-error/30 bg-error-container/20 px-4 py-3 text-sm text-error break-words">
                        {turn.error}
                      </div>
                    ) : (
                      <AnswerCard turn={turn} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sticky composer — full content width, above mobile bottom nav */}
        <form
          className="shrink-0 sticky bottom-0 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3 border-t border-outline-variant/25 bg-background/90 backdrop-blur-md mb-14 sm:mb-0"
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
        >
          {!empty && (
            <div className="mb-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
              {SUGGESTED.slice(0, 3).map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => ask(prompt)}
                  disabled={pending}
                  className="w-full text-left text-[11px] sm:text-xs px-3 py-2 rounded-xl border border-outline-variant/35 bg-surface-container/80 text-on-surface-variant hover:text-on-surface disabled:opacity-50 whitespace-normal break-words"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 w-full rounded-2xl border border-secondary/35 bg-surface-container-lowest shadow-[0_8px_30px_rgba(0,0,0,0.12)] focus-within:ring-2 focus-within:ring-secondary/35 px-2 py-2">
            <label className="flex-1 flex flex-col min-w-0">
              <span className="sr-only">Question</span>
              <textarea
                ref={inputRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    ask(question);
                  }
                }}
                rows={1}
                maxLength={500}
                placeholder="Ask about observed weather, the rainfall model, or pipeline status"
                className="w-full resize-none rounded-xl bg-transparent text-on-surface px-3 py-2.5 text-sm focus:outline-none placeholder:text-on-surface-variant/70 min-h-[44px] max-h-32"
              />
            </label>
            <button
              type="submit"
              disabled={pending || question.trim().length === 0}
              className="min-h-[44px] min-w-[44px] rounded-xl bg-secondary text-on-secondary flex items-center justify-center disabled:opacity-45 shrink-0"
              aria-label={pending ? 'Asking' : 'Ask'}
            >
              <span className="material-symbols-outlined text-[22px]">
                {pending ? 'hourglass_top' : 'send'}
              </span>
            </button>
          </div>
          <p className="mt-1.5 text-[10px] font-mono text-on-surface-variant px-1">
            Enter to send · Shift+Enter for newline · History kept in local storage
          </p>
        </form>
      </div>
    </div>
  );
};
