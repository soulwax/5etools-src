# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

5etools is a web-based toolkit for D&D 5th Edition. It is a multi-page SPA built with vanilla JavaScript, serving content from JSON data files. Requires Node 17.1.0+.

## Common Commands

```bash
# Development server
npm run serve:dev          # HTTP on port 5050
npm run serve:dev:tls      # HTTPS on port 5051

# Testing
npm run test               # All tests (lint + unit + CSS + data validation)
npm run test:unit          # Jest unit tests only
npm run test:data          # Data file validation only
npm run test:js            # ESLint only

# Linting (with auto-fix)
npm run lint               # Fix all lint issues
npm run lint:js            # Fix JavaScript
npm run lint:js:fast       # Quick fix changed files only
npm run lint:css           # Fix CSS/SCSS

# Building
npm run build              # Full production build
npm run build:css          # Compile SCSS → CSS
npm run build:sw           # Build dev service worker
npm run gen                # Regenerate all data/generated files
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
