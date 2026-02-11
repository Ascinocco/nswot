---
name: Tom Nakamura
role: Staff Engineer
team: Architecture
---

## Concerns
We're accumulating architectural debt faster than we're paying it down. The biggest issue is our data model — we have device state spread across four different databases (Postgres for metadata, Redis for real-time status, InfluxDB for metrics, and SQLite on the agent side) with no clear consistency guarantees between them. When a customer asks "what is the state of this device right now?" we're querying three systems and merging the results in application code. That's fragile and slow. I'm also concerned about our agent architecture. We have three separate agents (MDM, compliance scanner, and remote management) that customers have to deploy individually. Each has its own update mechanism, its own communication protocol, and its own config format. It's a support nightmare.

## Priorities
Agent unification is my top technical priority. I have an RFC for a single agent with a plugin architecture that would replace all three. It would cut our agent footprint by 60% and give us a single update and communication channel. Second, I want to introduce an event-sourced device state model that gives us a single source of truth with full audit history. This solves the multi-database consistency problem and gives compliance customers the audit trail they need. Third, I want to establish architecture decision records (ADRs) as a practice so we stop making the same mistakes and have institutional memory about why we built things the way we did.

## Quotes
- "We don't have a device management platform. We have three device management products duct-taped together."
- "The agent unification RFC has been sitting in review for two months. Meanwhile, we shipped three bugs that only exist because of agent-to-agent communication issues."
- "Event sourcing isn't just a technical preference. When a CISO asks 'show me every state change this device went through in the last 90 days,' we should be able to answer instantly."
- "I've been here four years and I still discover undocumented system behaviors weekly. We need ADRs yesterday."

## Notes
Tom is the most senior IC in engineering and widely respected for his architectural judgment. He tends to think in systems and push for long-term solutions. He can sometimes be perceived as too focused on ideal architecture at the expense of shipping, though his proposals are generally well-grounded. He's been Karen's closest technical advisor since she joined. He mentors three senior engineers and is active in the hiring process.
