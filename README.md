# LLM Stream Demo

Мини-приложение на Next.js 16 (App Router): поле ввода → кнопка «Отправить» → ответ дешёвой LLM
приходит потоком и печатается по мере генерации.

## Запуск

```bash
cd a_projects/llm-stream-demo
cp .env.example .env.local     # и впишите свой ключ
npm install
npm run dev                    # http://localhost:3000
```

`.env.local` в git не попадает и заполняется вручную — ключ читается только на сервере.

## Провайдеры

Код OpenAI-совместимый, поэтому провайдер меняется тремя переменными:

| Провайдер | `LLM_BASE_URL` | `LLM_MODEL` | Цена |
|---|---|---|---|
| OpenRouter (free router) | `https://openrouter.ai/api/v1` | `openrouter/free` | $0, 20 RPM / 50 запросов в день |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` | ~$0.25 / 1M входных токенов |
| Локальный OmniRoute | `http://localhost:20130/v1` | напр. `gemini/gemini-2.0-flash` | $0 (свой прокси) |
| Qwen / DashScope | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-plus` | есть бесплатный период |

Список бесплатных моделей OpenRouter меняется каждые несколько недель. Если `openrouter/free`
перестал отвечать, выберите актуальную модель с суффиксом `:free` на
<https://openrouter.ai/models?pricing=free> и впишите её в `LLM_MODEL`.

## Как устроен стриминг

- `app/api/chat/route.ts` — серверный POST-роут: валидирует `message` (до 4000 символов),
  вызывает `${LLM_BASE_URL}/chat/completions` с `stream: true` и отдаёт тело ответа как
  `text/event-stream`. Ключ не покидает сервер, обрыв клиента пробрасывается в upstream через
  `request.signal`.
- `components/chat.tsx` — клиентский компонент: читает `response.body.getReader()`, режет поток
  на SSE-события по пустой строке, берёт `choices[0].delta.content` и дописывает текст в состояние.
  Кнопка «Стоп» отменяет запрос через `AbortController`.
- Reasoning-модели (например, DeepSeek R1 во free-роутере) кладут размышления в
  `delta.reasoning` — они показываются свёрнутым блоком, чтобы поток был виден сразу.

`compress: false` в `next.config.ts` — намеренно: gzip-буферизация склеивает чанки и ломает
эффект печати на коротких ответах.

## Ограничения демо

Нет истории диалога, авторизации, rate limiting и тестов — это осознанно: одна страница, один
запрос, один поток. Модель всегда получает только текущее сообщение.


Добавлял:
    echo "# free-llm" >> README.md
git init
git add README.md
git commit -m "first commit"
git branch -M main
git remote add origin git@github-3:chanelanalovich-cyber/free-llm.git
git push -u origin main# free-llm
