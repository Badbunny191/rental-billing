# Project Context

## Purpose

Thai rental-billing application for recording a utility bill and tenant meter readings, calculating a monthly tenant statement, splitting owner revenue, viewing history, and producing invoice/share outputs.

## Stack

- Cloudflare Worker backend
- Cloudflare KV namespace: `HOUSE_RENT_KV`
- Static frontend in `public/index.html`
- Bootstrap 5.3.3 and html2canvas loaded from CDN
- No build step or package manifest is currently present

## Repository Layout

- `src/index.js`: Worker routing, protected APIs, KV persistence
- `src/business-logic.js`: validation and monthly-statement calculations
- `src/auth.js`: password hashing and session cookie support
- `src/ocr-interface.js`: OCR abstraction for bill and meter images
- `src/business-logic.test.js`: Unit tests for business logic
- `public/index.html`: complete single-page frontend, styles, and browser-side behavior
- `wrangler.toml`: Worker, static asset, and KV binding configuration

## Runtime

`wrangler.toml` configures:

- Worker name: `rent`
- Entry module: `src/index.js`
- Static asset directory: `public`
- Assets binding: `ASSETS`
- Compatibility date: `2026-09-01`

Local development:

```sh
npx wrangler dev --local --port 8788
```

## Backup & Restore

The system includes a complete backup and restore feature:

### Export Backup
- **Endpoint:** `GET /api/backup`
- Downloads all data as JSON file with timestamp
- Includes: settings, utility bills, meter readings, monthly statements

### Restore Backup
- **Preview:** `POST /api/restore/preview`
  - Validates schema before import
  - Shows summary of data to import
  - Detects conflicts with existing data
- **Execute:** `POST /api/restore`
  - Full validation before import
  - Auto-backup of current data before overwrite
  - Atomic import (all or nothing)
  - Preview confirmation required

### UI
- Located in Settings tab
- Export button with download
- Restore button with file upload
- Preview modal showing data summary and conflicts
- Confirmation required before restore

## Application Workflow

1. Utility Bill: record total utility units and bill amount, optionally using OCR.
2. Meter: record previous and current tenant meter readings, optionally using OCR/autofill.
3. Process: calculate and save the monthly statement.
4. Dashboard: view tenant bill, calculation transparency, payment status, and owner allocation.
5. Invoice / Share: print or save PDF, copy LINE text, download PNG, or share an image.
6. Backup/Restore: export all data or restore from backup file.

The app uses a horizontal, scrollable tab navigation and a single-page vertical scrolling experience.

## Data Model

KV keys include:

- `auth:admin`
- `session:<uuid>`
- `settings`
- `utility_bill:<YYYY-MM>`
- `meter_reading:<YYYY-MM>`
- `monthly_statement:<YYYY-MM>`
- `auto_backup:<YYYY-MM-DD>-<timestamp>` (created before restore)

## UI Safety Constraints

The frontend relies on inline JavaScript in `public/index.html`. For visual changes:

- Preserve all DOM IDs, event handlers, API calls, and render functions.
- Do not rename or remove functional elements.
- Keep all dashboard calculations and history information visible and accessible.
- Keep the existing workflow, tabs, invoice modal, month picker, and share actions.
- Treat `src/` business and auth modules as frozen unless explicitly requested otherwise.

## Validation

```sh
# Whitespace and patch validation
git diff --check

# Run unit tests
node src/business-logic.test.js

# Run locally
npx wrangler dev --local --port 8788
```

For UI work, verify all six tabs, the month picker, payment-status toggle, calculation-collapse behavior, invoice modal, and share/PDF action controls in a browser.

## Stable Release

Current Stable Tag:
v2.0-backup-restore

Production Branch:
main

Backup Branch:
backup/pre-final-ui-polish

## Known Decisions

- Username is currently case-sensitive
- Main branch is production
- Owner1 = Green
- Owner2 = Blue
- Water receiver is configurable
- History uses Desktop Table + Mobile Card layout
- Backup files are JSON format with version field for future compatibility
- Auto-backup created before each restore operation
- Password minimum length: 8 characters
- Error messages are sanitized (no internal details leaked)
