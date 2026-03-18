# 5e.tools

Visit the [main site](https://5e.tools/index.html) or go to the unofficial GitHub [mirror](index.html).

[Join the 5etools Discord here!](https://discord.gg/5etools)

## Help and Support

Please see [our wiki](https://wiki.tercept.net/) for FAQs, installation guides, supported integrations, and more.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## AI Rules Bot (Local)

This repo includes a grounded rules bot which uses local 5etools data as retrieval context, Blackbox/OpenAI for generation, and Postgres for session/message logging.

### Required environment variables

- `BLACKBOX_API_KEY` (primary)
- `OPENAI_API_KEY` (optional fallback)
- `DATABASE_URL`
- `DATABASE_URL_UNPOOLED`

If both AI keys are set, the bot prefers `BLACKBOX_API_KEY`.

### Run

1. Apply schema (unpooled connection):
   - `npm run bot:migrate`
2. Start API server:
   - `npm run bot:serve`
3. Or run interactive terminal chat:
   - `npm run bot:chat`
4. Browser UI:
   - the main homepage (`index.html`) now includes an embedded chatbox
   - optional dedicated page remains at `ai-rules-chat.html`

The bot now records query retrieval logs (`ai_rules_bot_query_logs`) so ranking can be tuned from real usage patterns.

### Vercel Deployment

This repository can be deployed as:
- static frontend pages
- integrated serverless AI endpoint at `/api/chat` (see `api/chat.js`)

Set at least:
- `BLACKBOX_API_KEY` (recommended)
- or `OPENAI_API_KEY` as fallback

Notes:
- In production hosts (non-localhost), the chat UI defaults to `/api/chat`.
- Local development still defaults to `http://<host>:4516/api/chat`.
- Current database logging relies on `psql` CLI and is usually disabled in serverless environments unless you add a serverless-compatible DB adapter.

### External Image Bucket/CDN

This codebase now supports serving `img/*` from an external root URL.

Supported configuration methods (first available wins):
- `globalThis.DEPLOYED_IMG_ROOT` (existing behavior)
- `globalThis.IMG_BASE_URL`
- `<meta name="5etools-img-root" content="https://your-cdn.example.com/img/">`
- `localStorage["5etools.imgRoot"]`

Rules:
- The configured value is normalized to include a trailing slash.
- Renderer image URLs use this root automatically.
- Static markup links like `img/...` are rewritten on page load.

## License

This project is licensed under the terms of the MIT license.
