# ADR-001: Electron with SQLite for Local-First Desktop App

**Status**: Accepted
**Date**: 2025-02-10
**Context**: Choosing the application runtime and persistence layer

---

## Decision

Use **Electron** as the desktop runtime and **SQLite** (via `better-sqlite3`) as the primary persistence layer.

---

## Context

nswot needs to be a desktop application that:
- Runs on macOS first, with Windows/Linux planned for later
- Stores sensitive org data locally (no cloud backend)
- Reads and writes to the user's filesystem (workspace model)
- Makes network calls to external APIs (Jira, OpenRouter)
- Has a rich UI with file browser, editor, and data visualizations

We evaluated:
1. **Electron + SQLite** (chosen)
2. **Tauri + SQLite** (Rust-based alternative)
3. **Electron + IndexedDB/LevelDB**

---

## Rationale

### Why Electron over Tauri

- **Developer velocity**: The team has deep TypeScript/Node.js expertise. Electron allows the entire stack (main process, preload, renderer) to be TypeScript. Tauri would require Rust for the backend, adding a second language and toolchain.
- **Ecosystem maturity**: Electron has a larger ecosystem for Electron-specific libraries (safeStorage, auto-update, native dialogs). `better-sqlite3` works seamlessly in Electron's main process.
- **Monaco editor**: The Monaco editor (VS Code's editor) is a first-class Electron citizen. Integration is well-documented.
- **Trade-off accepted**: Electron apps are larger (~150MB+ binary). For a single-user desktop tool used by staff engineers, this is acceptable.

### Why SQLite over IndexedDB/LevelDB

- **Relational model**: nswot has clear relational data (workspaces -> profiles -> analyses -> chat_messages). SQL is the natural fit. IndexedDB would require manual joins and denormalization.
- **Transactions**: Analysis storage writes to multiple tables atomically. SQLite transactions handle this natively.
- **Migration support**: Schema changes across versions are straightforward with SQL migrations. IndexedDB migrations are manual and error-prone.
- **Query flexibility**: Analysis history queries (filter by date, role, status) and cache TTL checks are trivial in SQL.
- **`better-sqlite3` performance**: Synchronous API in the main process avoids callback complexity. Performance is excellent for the expected data volume (< 100MB per workspace).

### Why `better-sqlite3` over `sqlite3` (async)

- Synchronous API is simpler in Electron's main process (no async overhead for local disk operations)
- Better performance for the access patterns we need (many small reads/writes)
- Well-maintained, good Electron compatibility

---

## Consequences

**Positive:**
- Single language (TypeScript) across the entire stack
- Rich ecosystem for desktop features
- Robust data model with relational integrity
- Simple transactional writes for analysis pipeline

**Negative:**
- Larger binary size vs Tauri (~150MB vs ~10MB)
- Higher memory usage vs Tauri
- Native module compilation (`better-sqlite3`) requires `electron-rebuild` in the build pipeline
- SQLite is single-writer; if we ever need concurrent writes (unlikely for single-user app), we'd need to rethink

**Mitigations:**
- Binary size: acceptable for target user (staff engineers installing a desktop tool)
- Memory: monitor in development; Electron's per-process model helps isolate leaks
- Native modules: `electron-rebuild` is well-established; pin `better-sqlite3` version to avoid breakage
