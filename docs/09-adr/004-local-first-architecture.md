# ADR-004: Local-First Architecture

**Status**: Accepted
**Date**: 2025-02-10
**Context**: Choosing between local-first and cloud-backed architecture

---

## Decision

nswot is a **local-first** application. All data is stored on the user's machine. There is no nswot cloud backend, no user accounts, and no telemetry.

---

## Context

nswot processes sensitive organizational data: stakeholder interview notes, Jira project data, and SWOT analyses that reveal organizational weaknesses and threats. This data is:

- **Sensitive**: Org structure, team dynamics, personnel concerns
- **Proprietary**: Interview content is confidential
- **PII-adjacent**: Stakeholder names, roles, teams, direct quotes

We evaluated:
1. **Local-first** (chosen) — all data on user's machine, network only for external APIs
2. **Cloud-backed** — nswot backend for storage, sync, collaboration
3. **Hybrid** — local storage with optional cloud sync

---

## Rationale

### Why local-first

- **Trust by default**: Staff engineers handling sensitive org analysis will not adopt a tool that sends their data to a third-party server. Local-first eliminates this objection entirely.
- **No infrastructure cost**: No servers to run, no databases to manage, no uptime to guarantee.
- **Simplicity**: No auth system, no API gateway, no multi-tenant data isolation.
- **Privacy compliance**: No GDPR/SOC2/etc. concerns about nswot storing user data. (The user's own machine is their responsibility.)
- **Offline-capable**: Works without internet (except for LLM and Jira API calls, which are inherently online).
- **User ownership**: Users own their data completely. They can back it up, delete it, or move it.

### What about the LLM calls?

LLM API calls are the only data that leaves the user's machine (along with Jira API calls). This is handled by:

1. **Anonymization**: Names and emails are replaced with pseudonyms before sending to the LLM
2. **User preview**: The user sees exactly what will be sent before confirming
3. **No nswot intermediary**: Calls go directly from the user's machine to OpenRouter/Jira. nswot has no proxy server.

### Why not cloud-backed

- **Adoption barrier**: Asking staff engineers to trust a startup with their org analysis data is a non-starter for MVP validation.
- **Complexity**: Auth, multi-tenancy, encryption at rest, backup/restore, API gateway — all unnecessary for single-user validation.
- **Cost**: Infrastructure for a pre-revenue product adds burn with no user value.

### Why not hybrid

- **Premature**: Until there's validated demand for collaboration features, building sync infrastructure is waste.
- **Complexity**: Conflict resolution, offline/online merge, selective sync — each is a significant engineering effort.

---

## Consequences

**Positive:**
- Zero infrastructure cost
- Maximum user trust (data never leaves their machine, except anonymized LLM calls)
- Simpler architecture (no auth, no API, no sync)
- Faster MVP delivery

**Negative:**
- No collaboration features (sharing analyses between team members)
- No cross-device sync
- Data loss if user doesn't back up their machine
- No aggregate analytics across users (can't measure "how are users using nswot")

**Mitigations:**
- Collaboration: Markdown export enables manual sharing. If collaboration demand emerges, it becomes a Phase 3+ feature.
- Cross-device: The workspace is a directory — users can sync it via iCloud/Dropbox/Git if desired.
- Data loss: SQLite database lives in a well-known location (`~/.nswot/`). Users can back it up. We could add an explicit backup/export feature later.
- Analytics: Defer to Phase 2+. If needed, add opt-in anonymous usage metrics (never analysis content).

---

## Data Location Summary

```text
~/.nswot/                     # App data (SQLite, logs, config)
  nswot.db                    # All structured data
  logs/main.log               # Application logs
  config.json                 # Non-sensitive preferences

<workspace>/                  # User's project directory
  .nswot/workspace.json       # Workspace ID pointer
  analysis/                   # Exported analysis outputs
  profiles/                   # Markdown profile sources

OS Keychain                   # API keys and OAuth tokens
  (via Electron safeStorage)
```

Nothing is stored remotely. Nothing is transmitted except:
- LLM API calls (anonymized data -> OpenRouter)
- Jira API calls (OAuth-authenticated, fetching the user's own data)
