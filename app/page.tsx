import Chat from "@/components/chat";

// Страница читает env на каждый запрос: иначе LLM_MODEL запекается в статический HTML
// при сборке и подпись модели устаревает после смены .env.local без пересборки.
export const dynamic = "force-dynamic";

export default function Page() {
  // Только имя модели: ключ и base URL остаются на сервере.
  const modelLabel = process.env.LLM_MODEL ?? "не настроена";

  return <Chat modelLabel={modelLabel} />;
}
