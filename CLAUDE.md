# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

5etools is a web-based toolkit for D&D 5th Edition. It is a multi-page SPA built with vanilla JavaScript, serving content from JSON data files. Requires Node 17.1.0+.

## Common Commands

```bash
# Development server
npm run serve:dev          # HTTP on port 4515 (static files only)
npm run serve:dev:tls      # HTTPS on port 4515 (static files only)
npm run serve              # Production server: static + POST /api/chat on port 4515

# Testing
npm run test               # All tests (lint + unit + CSS + data validation)
npm run test:unit          # Jest unit tests only
npm run test:data          # Data file validation only
npm run test:js            # ESLint only

# Linting (with auto-fix)
npm run lint               # Fix all lint issues
npm run lint:js            # Fix JavaScript
npm run lint:js:fast       # Quick fix changed files only
npm run lint:js:single -- <file>  # Lint a single file
npm run lint:css           # Fix CSS/SCSS
npm run lint:data          # Prettify JSON data files

# Building
npm run build              # Full production build
npm run build:css          # Compile SCSS → CSS
npm run build:sw           # Build dev service worker
npm run gen                # Regenerate all data/generated files

# Quick pre-commit check (JS lint + unit tests + CSS lint)
npm run do:code

# Run a single Jest test file
node --localstorage-file test/localstorage.tmp --experimental-vm-modules node_modules/jest/bin/jest.js <test-file>
```

## Architecture

### Core Files
- [js/utils.js](js/utils.js) — General utilities (~9,400 lines); foundational to every page
- [js/parser.js](js/parser.js) — D&D-specific data parsing (~4,500 lines)
- [js/render.js](js/render.js) — Central HTML rendering engine; handles `{@tag}` syntax
- [js/consts.js](js/consts.js) — Global constants (`VeCt`, `VetoolsConfig`)

### Page Architecture
Each tool (bestiary, spells, classes, etc.) follows the same pattern:
- **HTML entry point**: `bestiary.html`, `spells.html`, etc.
- **Page JS**: `js/bestiary.js`, `js/spells.js`, etc.
- **Filter class**: `js/filter-bestiary.js`, `js/filter-spells.js`, etc. — extends `PageFilterBase`
- **Renderer**: `js/render-bestiary.js`, `js/render-spells.js`, etc. — extends `Renderer`

### Data Layer
- JSON source files live in [data/](data/) (tab-indented)
- Generated/computed files go in [data/generated/](data/generated/) (minified; do not hand-edit)
- Build scripts in [node/](node/) generate search indexes, lookup tables, and SEO data

### Tag System
JSON content uses `{@tag value}` syntax for cross-references (e.g. `{@spell fireball}`, `{@creature goblin}`). The `Renderer` class in `render.js` processes these into links at render time.

### Key Subdirectories in `js/`
- `js/filter/` — Base filter infrastructure (`FilterBase`, `Filter`, `RangeFilter`, etc.)
- `js/bestiary/`, `js/dmscreen/`, `js/encounterbuilder/` — Complex feature subsystems
- `js/utils-*/` — Specialized utility modules (brew, config, UI, blocklist)
- `js/omnisearch/` — Global cross-page search

### Third-party Libraries (`lib/`)
jQuery is present but being actively phased out — the ESLint config has a custom jQuery-vetting plugin to discourage new usage.

## Code Style

- **Indentation**: Tabs (tab size = 3)
- **Quotes**: Double quotes
- **Semicolons**: Required
- **Variables**: `const`/`let` only (no `var`)
- **CSS**: BEM naming methodology; SCSS source in [scss/](scss/)
- **No `console.log`**: ESLint errors on it
- Keyboard shortcuts: use SHIFT-/CTRL-modified events; avoid ALT (not available on macOS/Linux)

## Testing Notes

Jest unit tests are in [test/jest/](test/jest/) and cover core utilities. Data validation tests (`test/test-all.js`, `test/test-tags.js`, etc.) validate JSON structure and cross-references. Run `npm run test:unit` for fast feedback during development; run `npm run test` before submitting changes.

## AI Rules Bot

A grounded D&D rules chatbot lives in `node/rules-bot/` and is exposed via `api/chat.js`. It uses local 5etools data as retrieval context with Blackbox/OpenAI for generation and Postgres for session logging.

### Required environment variables

- `BLACKBOX_API_KEY` — primary LLM provider
- `OPENAI_API_KEY` — optional fallback
- `DATABASE_URL` — pooled Postgres connection
- `DATABASE_URL_UNPOOLED` — required for schema migrations

If both AI keys are set, `BLACKBOX_API_KEY` takes precedence.

### Bot commands

```bash
npm run bot:migrate   # Apply DB schema (use DATABASE_URL_UNPOOLED)
npm run bot:serve     # Start API server on port 4516
npm run bot:chat      # Interactive terminal chat
```

The chat UI is embedded in `index.html` and has a dedicated page at `ai-rules-chat.html`. The relevant frontend module is `js/chat.js` (widget) and `js/ai-rules-chat.js` (dedicated page).

In production (non-localhost), the UI posts to `/api/chat`. Locally it defaults to `http://<host>:4516/api/chat`.

## Deployment

### Vercel

`api/*.js` are deployed as Vercel serverless functions (Node 22, 60s max duration). Set `BLACKBOX_API_KEY` (or `OPENAI_API_KEY`) as environment variables in the Vercel project. Database logging is disabled unless a serverless-compatible adapter is added.

### External Image CDN

To serve `img/*` from an external root, configure one of (first wins):

1. `globalThis.DEPLOYED_IMG_ROOT`
2. `globalThis.IMG_BASE_URL`
3. `<meta name="5etools-img-root" content="https://your-cdn.example.com/img/">`
4. `localStorage["5etools.imgRoot"]`

The value is normalized to include a trailing slash; renderer image URLs and static `img/...` markup links are rewritten automatically on page load.
