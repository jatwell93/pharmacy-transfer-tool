# Phase 3: File Upload Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 03-file-upload-pipeline
**Areas discussed:** Store naming model, Upload page layout, ROU + dead-stock pairing, Parser placement

---

## Store naming model

| Option | Description | Selected |
|--------|-------------|----------|
| Type store name on upload | Free-text input; store created automatically on first upload | ✓ |
| Pre-configure store list first | Add stores before uploading; dropdown picker | |
| Auto-extract from file | Parser reads store name from FRED header cell | |

**User's choice:** Type store name on upload

---

| Option | Description | Selected |
|--------|-------------|----------|
| Silent replace | Old data replaced without confirmation | |
| Warn before replace | Confirmation dialog before overwriting | ✓ |
| Always append | New rows added alongside old data | |

**User's choice:** Warn before replace

---

| Option | Description | Selected |
|--------|-------------|----------|
| Both fields, both optional | Name + Number, either or both can be filled | ✓ |
| Number is primary identifier | Store identified by number; name is label | |
| Single free-text field | One field for whatever the user uses | |

**User's choice:** Both fields, both optional
**Notes:** User raised that many pharmacy businesses use store number systems (e.g. Balwyn = store 987). Both name and number fields added, both optional, name is the primary identifier within the org.

---

## Upload page layout

| Option | Description | Selected |
|--------|-------------|----------|
| Store cards + upload action per card | Card grid with per-store status and Upload button | ✓ |
| Upload form at top, status table below | Form at top; table listing all stores below | |
| Wizard / stepper | Step-through flow for each upload | |

**User's choice:** Store cards + upload action per card

---

| Option | Description | Selected |
|--------|-------------|----------|
| Modal / dialog | Overlay modal for the upload form | ✓ |
| Inline expand | Card expands in-place | |
| Slide-out panel | Panel slides in from the right | |

**User's choice:** Modal / dialog

---

| Option | Description | Selected |
|--------|-------------|----------|
| Centred prompt with Add Store CTA | "No stores yet — add your first store to get started" | ✓ |
| Just the Add Store button, no message | Minimal; relies on button affordance alone | |
| Inline walkthrough tips | Empty state with brief explainer text | |

**User's choice:** Centred prompt with Add Store CTA

---

## ROU + dead-stock pairing

| Option | Description | Selected |
|--------|-------------|----------|
| Both in one form, both optional | One modal; either or both files can be selected | ✓ |
| Both required together | Both files mandatory before Upload activates | |
| Separate modals per file type | Two separate Upload buttons per card | |

**User's choice:** Both in one form, both optional

---

| Option | Description | Selected |
|--------|-------------|----------|
| Show each file's status independently | Per-file timestamps on the card | ✓ |
| Show a single complete/incomplete status | Single indicator for both files | |
| No status until both uploaded | Nothing shown until complete | |

**User's choice:** Show each file's status independently

---

| Option | Description | Selected |
|--------|-------------|----------|
| No — allow partial on first upload | Card shows incomplete status; Match page validates | ✓ |
| Yes — require both files on first upload | First upload requires both; subsequent are independent | |

**User's choice:** No — allow partial on first upload
**Notes:** User noted that dead-stock will be updated far more frequently than ROU (sales velocity is stable long-term; dead-stock SKUs change regularly). Independent per-file upload is therefore important for the regular-use workflow, not just edge cases.

---

## Parser placement

| Option | Description | Selected |
|--------|-------------|----------|
| Worker-side | Raw file sent as multipart/form-data; Worker parses | ✓ |
| Browser-side | Client parses with SheetJS, sends JSON to Worker | |

**User's choice:** Worker-side

---

| Option | Description | Selected |
|--------|-------------|----------|
| Clear inline error in modal | Error shown under file picker with file size | ✓ |
| Toast / banner notification | Toast at top of page after failed upload | |

**User's choice:** Clear inline error in modal
**Notes:** User also requested a help tooltip (ⓘ) near the file pickers with tips for reducing file size before upload:
- Before exporting from FRED: filter by relevant departments/categories, filter for ROU > 0.01, filter for active items, filter out $0 cost lines
- Review in a spreadsheet and manually delete unnecessary rows
User also noted that the parser could (and should) silently drop unrecognised columns server-side.

---

## Claude's Discretion

- XLSX parsing library choice for the Worker runtime
- Single upload endpoint vs. separate ROU/dead-stock endpoints
- Store card grid pagination for large store lists
- Postgres upsert vs. delete+insert strategy for data replacement
- Modal animation/transition details

## Deferred Ideas

None — discussion stayed within phase scope.
