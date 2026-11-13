import type { NextRequest } from "next/server";

export const runtime = "nodejs";

/** Максимальная длина пользовательского сообщения. */
const MAX_INPUT_CHARS = 4000;

type ChatMessage = {
  role: "system" | "user";
  content: string;
};

/**
 * Прокси к OpenAI-совместимому /chat/completions со стримингом.
 *
 * Ключ живёт только здесь, на сервере: в браузер уходит лишь текст ответа.
 * Ответ провайдера (SSE) отдаётся как есть, без разбора — браузер читает
 * `data:`-строки сам, поэтому токены доходят по мере генерации.
 */
export async function POST(request: NextRequest) {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;

  if (!baseUrl || !apiKey || !model) {
    return jsonError(
      "Провайдер не настроен. Скопируйте .env.example в .env.local и заполните LLM_BASE_URL, LLM_API_KEY, LLM_MODEL.",
      500,
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Тело запроса должно быть JSON вида { \"message\": \"...\" }.", 400);
  }

  const message = readMessage(payload);
  if (!message) {
    return jsonError("Поле message обязательно и не может быть пустым.", 400);
  }
  if (message.length > MAX_INPUT_CHARS) {
    return jsonError(`Слишком длинный запрос: максимум ${MAX_INPUT_CHARS} символов.`, 413);
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        `# ROLE
You are a knowledgeable guide to Tarot, astrology, natal charts, numerology, and general spiritual reflection.Offer thoughtful interpretations, not verified facts or guaranteed predictions.

# LANGUAGE AND TONE
Respond to the user in Russian.Use accurate, natural esoteric terminology.Be empathetic, engaging, and grounded; do not claim supernatural certainty or present yourself as a licensed professional.

# SCOPE
Discuss only Tarot, astrology, natal charts, numerology, and general spiritual guidance.For unrelated requests, politely decline in Russian and redirect the user to an in-scope topic.

# READING GUIDELINES
- Connect the interpretation to the user's actual question and details. Avoid generic cold-reading statements.
    - For Tarot, identify each card, its position in the spread, and its meaning in the context of the question.If no spread is specified, choose a simple spread and name it.Do not imply that a physical card draw occurred; describe the reading as a symbolic interpretation.
- For astrology, request the birth date, exact birth time, and birthplace when needed.If any are missing, state what can and cannot be interpreted; never invent placements, houses, or aspects.
- Present forecasts as possibilities or themes for reflection, not certain outcomes.Distinguish symbolic interpretation from factual claims.
- Do not give medical, legal, or financial advice, diagnose conditions, or tell the user to start, stop, or delay professional care.For questions touching these areas, briefly clarify that spiritual readings are not a substitute for qualified professional guidance and that important decisions should be discussed with an appropriate professional.

# RESPONSE FORMAT
  1. A brief greeting and acknowledgment of the question.
2. A clearly structured interpretation, with headings or bullets as useful.
3. A practical reflection prompt or low - risk spiritual practice connected to the reading.

Keep the response proportionate to the question.Ask a concise follow - up question if essential information is missing; otherwise, state your assumptions and proceed cautiously.`,
    },
    { role: "user", content: message },
  ];

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Accept просит именно поток, а не единый JSON.
        Accept: "text/event-stream",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
      // Отмена на клиенте (кнопка «Стоп» или закрытие вкладки) обрывает и запрос к провайдеру.
      signal: request.signal,
    });
  } catch (error) {
    if (request.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    console.error("[api/chat] upstream fetch failed:", error);
    return jsonError("Не удалось соединиться с провайдером. Проверьте LLM_BASE_URL и сеть.", 502);
  }

  if (!upstream.ok) {
    const detail = (await upstream.text().catch(() => "")).slice(0, 500);
    console.error(`[api/chat] provider ${upstream.status}: ${detail}`);
    return jsonError(
      `Провайдер ответил ${upstream.status}. ${detail || "Тело ответа пустое."}`,
      502,
    );
  }

  if (!upstream.body) {
    return jsonError("Провайдер вернул пустой поток.", 502);
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx и подобные прокси не должны копить поток в буфере.
      "X-Accel-Buffering": "no",
    },
  });
}

function readMessage(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const value = (payload as Record<string, unknown>).message;
  return typeof value === "string" ? value.trim() : null;
}

function jsonError(error: string, status: number): Response {
  return Response.json({ error }, { status });
}
