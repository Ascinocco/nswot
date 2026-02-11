---
name: Sarah O'Connor
role: Engineering Manager
team: Cloud Migration
---

## Concerns
The cloud migration is behind schedule. We originally scoped 18 months and we're now at month 14 with maybe 60% of the functionality migrated. The biggest blocker is data migration — customers have years of device history and compliance audit trails that need to come over cleanly. We also keep discovering undocumented behaviors in the legacy system that customers depend on, so we end up playing whack-a-mole with compatibility issues. My other concern is that we're building the cloud version as a lift-and-shift rather than rethinking the architecture. We're going to end up with a monolith running in Kubernetes, which gives us none of the benefits Karen is promising the board.

## Priorities
I need the product team to freeze the legacy feature backlog so my team can focus on migration without a moving target. I want us to adopt a strangler fig pattern — route traffic to new services incrementally rather than doing a big-bang cutover. We also need a proper feature parity matrix that product and engineering agree on, because right now everyone has a different definition of "done" for the migration. Automated data migration tooling is critical — we can't have professional services manually migrate every customer.

## Quotes
- "We're trying to migrate a moving target. Every time we think we've matched parity, someone adds a feature to the old system."
- "Lift-and-shift is a trap. We'll spend two years migrating and then another two years fixing everything we migrated poorly."
- "The data migration problem is bigger than anyone wants to admit. Some customers have 10 years of device audit history."
- "I need product to pick a lane. Are we building the future or are we maintaining the past? Because right now my team is doing both."

## Notes
Sarah was hired specifically to lead the cloud migration 14 months ago. She came from AWS where she worked on migration services. She's technically excellent but increasingly frustrated by organizational headwinds. She and Marcus work well together but compete for the same engineering resources. She's been candid with Rachel about the timeline risks.
