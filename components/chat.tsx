"use client";

import { useEffect, useRef, useState } from "react";

type Status = "idle" | "streaming" | "error";

const DONE_MARKER = "[DONE]";

type ChatProps = {
  modelLabel: string;
};

export default function Chat({ modelLabel }: ChatProps) {
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement | null>(null);
  const isStreaming = status === "streaming";

  useEffect(() => {
    const node = outputRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [answer, reasoning]);

  async function send() {
    const text = prompt.trim();
    if (!text || isStreaming) return;

    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("streaming");
    setError("");
    setAnswer("");
    setReasoning("");

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }
      if (!response.body) {
        throw new Error("Сервер вернул пустой ответ.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        // События SSE разделены пустой строкой; последний кусок может быть неполным.
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? "";

        for (const event of events) {
          for (const line of event.split(/\r?\n/)) {
            if (!line.startsWith("data:")) continue;
            const data = line.slice("data:".length).trim();
            if (!data || data === DONE_MARKER) continue;

            const chunk = parseChunk(data);
            if (chunk.content) setAnswer((prev) => prev + chunk.content);
            if (chunk.reasoning) setReasoning((prev) => prev + chunk.reasoning);
          }
        }
      }

      setStatus("idle");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        setStatus("idle");
        return;
      }
      setError(caught instanceof Error ? caught.message : "Неизвестная ошибка.");
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter отправляет, Shift+Enter — перенос строки. isComposing нужен для IME.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }

  return (
    <main className="card">
      <header className="card-head">
        <h1>LLM Stream Demo</h1>
        <p className="hint">
          Модель: <code>{modelLabel}</code>
        </p>
      </header>

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Спросите что-нибудь… Enter — отправить, Shift+Enter — новая строка"
          rows={3}
          maxLength={4000}
          disabled={isStreaming}
          autoFocus
        />
        <div className="actions">
          <span className="counter">{prompt.length} / 4000</span>
          {isStreaming ? (
            <button type="button" className="secondary" onClick={stop}>
              Стоп
            </button>
          ) : (
            <button type="submit" disabled={!prompt.trim()}>
              Отправить
            </button>
          )}
        </div>
      </form>

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="output" ref={outputRef} aria-live="polite">
        {reasoning ? (
          <details className="reasoning">
            <summary>Размышления модели ({reasoning.length} симв.)</summary>
            <p>{reasoning}</p>
          </details>
        ) : null}

        {answer ? <p className="answer">{answer}</p> : null}

        {isStreaming && !answer ? <p className="typing">Генерирую ответ…</p> : null}
        {!isStreaming && !answer && !error ? (
          <p className="placeholder">Здесь появится потоковый ответ модели.</p>
        ) : null}
      </div>
    </main>
  );
}

async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (typeof body === "object" && body !== null) {
      const message = (body as Record<string, unknown>).error;
      if (typeof message === "string" && message) return message;
    }
  } catch {
    // Тело не JSON — покажем статус ниже.
  }
  return `Запрос завершился со статусом ${response.status}.`;
}

type StreamChunk = {
  content: string;
  reasoning: string;
};

/**
 * Достаёт текст из одного `data:`-события OpenAI-совместимого стрима.
 * Reasoning-модели кладут размышления в delta.reasoning — показываем их отдельно.
 */
function parseChunk(raw: string): StreamChunk {
  const empty: StreamChunk = { content: "", reasoning: "" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (typeof parsed !== "object" || parsed === null) return empty;

  const choices = (parsed as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return empty;

  const first: unknown = choices[0];
  if (typeof first !== "object" || first === null) return empty;

  const delta = (first as { delta?: unknown }).delta;
  if (typeof delta !== "object" || delta === null) return empty;

  const record = delta as Record<string, unknown>;
  return {
    content: typeof record.content === "string" ? record.content : "",
    reasoning: typeof record.reasoning === "string" ? record.reasoning : "",
  };
}
