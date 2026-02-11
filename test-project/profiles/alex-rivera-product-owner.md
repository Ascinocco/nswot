---
name: Alex Rivera
role: Product Owner
team: Product — Admin Experience
---

## Concerns
The admin console is built on AngularJS (1.x) which is end-of-life. We're running a framework that hasn't had a security patch in years. Every new feature we add makes the eventual migration harder. Page load times average 4.2 seconds for the device inventory view, which is unacceptable when admins are troubleshooting urgent issues. The search experience is particularly bad — it's a basic SQL LIKE query that can't handle complex filters or boolean logic. Our biggest competitors all have fast, faceted search and real-time device status. I've been asking for a console rewrite for two years and keep getting told the cloud migration takes priority.

## Priorities
I want to ship an incremental console modernization — not a big-bang rewrite but a new React shell that can embed both legacy Angular views and new React views side by side. This lets us migrate page by page without disrupting customers. Real-time device status via WebSocket is my second priority because admins need to see what's happening now, not what happened five minutes ago. Third, I want to build a proper search infrastructure with Elasticsearch that supports saved queries and alerts. Admins should be able to say "alert me when any device in the finance department hasn't checked in for 48 hours."

## Quotes
- "We're asking customers to manage mission-critical device fleets through a UI that was built when AngularJS was still cool."
- "The 4-second page load isn't just a UX problem. When an admin is responding to a security incident, every second matters."
- "I don't need a year-long rewrite. Give me two engineers for three months and I'll show you what a modern console looks like."
- "Search is the admin's primary tool. If search is bad, the whole product feels bad."

## Notes
Alex is passionate about admin experience and has a strong design sensibility for a product owner. He's done extensive competitive analysis and can articulate exactly where the console falls short. He feels deprioritized relative to the cloud migration and compliance work. He has a good working relationship with the design team and often prototypes ideas with them before bringing them to engineering.
