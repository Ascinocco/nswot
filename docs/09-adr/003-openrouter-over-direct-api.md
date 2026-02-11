# ADR-003: OpenRouter Over Direct LLM Provider APIs

**Status**: Accepted
**Date**: 2025-02-10
**Context**: Choosing the LLM API integration approach

---

## Decision

Use **OpenRouter** as the sole LLM API gateway for MVP. Direct provider integrations (Anthropic, OpenAI, Google) are deferred to Phase 2+.

---

## Context

nswot needs to call LLMs for analysis and chat. The user should have some model choice (different models suit different analysis depths and budgets). Options:

1. **OpenRouter only** (chosen for MVP)
2. **Direct provider APIs** (Anthropic, OpenAI, etc.)
3. **Both** (OpenRouter + direct)

---

## Rationale

### Why OpenRouter for MVP

- **Single integration point**: One API key, one SDK (`openai` compatible), one auth flow. Direct provider integrations would require per-provider SDKs, key management, and error handling.
- **Model variety without code changes**: Users can choose from Claude, GPT-4, Llama, Mistral, etc. without nswot needing per-model configuration.
- **OpenAI-compatible API**: OpenRouter uses the OpenAI chat completion format. We can use the well-maintained `openai` SDK directly.
- **Simpler settings UX**: One API key input, one model dropdown. Multiple providers would mean multiple setup flows.
- **Lower development cost**: One provider integration to build, test, and maintain in MVP.

### Why not direct APIs in MVP

- **Multiple auth flows**: Each provider has its own key format, billing model, and API quirks.
- **Multiple error shapes**: Anthropic errors differ from OpenAI errors differ from Google errors. Normalizing across providers is real work.
- **Streaming differences**: While all major providers support streaming, the SSE format and chunk structure varies.
- **MVP scope**: We need to validate the product, not the LLM provider abstraction layer.

### Why direct APIs are planned for Phase 2+

- **Cost savings**: Direct APIs avoid OpenRouter's markup (typically 0-5% on top of provider pricing).
- **Latency**: One fewer network hop.
- **Feature access**: Some provider-specific features (Anthropic's extended thinking, OpenAI's function calling) may be useful.
- **Enterprise requirements**: Some organizations may require direct provider contracts for compliance.

---

## Consequences

**Positive:**
- Single SDK, single API pattern, single error model
- Broad model selection out of the box
- Faster MVP delivery

**Negative:**
- OpenRouter dependency (if OpenRouter goes down, no analysis possible)
- OpenRouter markup on API costs
- Users without an OpenRouter account must create one

**Mitigations:**
- Circuit breaker on OpenRouter calls (fail fast, don't hang)
- Design the `LLMProvider` interface from day one so swapping in direct providers later is a provider implementation, not a rewrite
- Store model metadata (context window, pricing) locally as fallback if OpenRouter's `/models` endpoint is slow

---

## Extension Point

The architecture defines an `LLMProvider` interface (see `docs/02-architecture-spec.md`, section 4.4). Adding a direct Anthropic provider in Phase 2 means:

1. Implement `AnthropicProvider` conforming to the same interface
2. Add `provider` field to settings (OpenRouter vs Anthropic vs ...)
3. Factory selects the right provider based on settings
4. No changes to services, orchestrator, or parser
