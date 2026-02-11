---
name: Karen Liu
role: CTO
team: Executive
---

## Concerns
Our device management platform was architected five years ago for on-prem deployments with a few thousand endpoints. We now have customers managing 500K+ devices and the cracks are showing. The monolithic backend can't scale horizontally, and we're hitting database bottlenecks during enrollment storms when a large customer rolls out a new fleet. We also have significant technical debt from three acquisitions where we bolted on MDM, EMM, and UEM capabilities without rethinking the data model. The migration to multi-tenant cloud has been slower than the board expected. I worry we're falling behind CrowdStrike and Jamf on the cloud-native front.

## Priorities
Completing the cloud migration is table stakes — we need to be fully multi-tenant on AWS by end of year. I also want us to invest in an AI/ML layer for predictive device health and automated remediation. That's where the market is going and we need a differentiated story. Finally, we need to consolidate our three overlapping agent architectures into a single lightweight agent. Customers are tired of deploying multiple agents on each endpoint.

## Quotes
- "We're running a 2019 architecture in a 2026 market. That's not sustainable."
- "Every quarter we delay the cloud migration, we lose two or three enterprise deals to competitors who are already there."
- "The unified agent is not optional. Our largest customer told me directly — fix this or we're evaluating alternatives."
- "I want us to be the company that predicts a device will fail before the user even notices."

## Notes
Karen joined 18 months ago from a cloud infrastructure company. She has strong opinions about platform architecture and has been pushing hard on the cloud-native transformation. She has executive buy-in but is frustrated by the pace of delivery. Very data-driven — backs up claims with customer churn numbers and competitive analysis.
