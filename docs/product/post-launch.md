# Post-launch operating loop

The application owner reviews health, RPC lag, stream connectivity, planning availability, settlement backlog, HTTP latency/errors, and smoke runs every weekday. Product reviews funnel analytics and feedback weekly. Platform reviews spend, capacity, backups, dependency advisories, and access monthly. Every alert and feedback item has one owner and one next-review date.

Feedback enters through the GitHub feedback template or developer support route and is labelled `feedback`, `bug`, `sdk`, `adoption`, or `security`. Security reports follow `SECURITY.md`, never a public issue. Triage uses user impact, frequency, data/safety risk, and strategic fit:

- P0: active fund/data/security risk; disable affected writes, declare an incident, and page the owners.
- P1: core trade/claim journey broken; assign within one business day.
- P2: degraded or confusing journey; review in the weekly product meeting.
- P3: improvement request; retain with its evidence threshold.

A roadmap candidate moves into delivery only with evidence: three independent user requests, at least 5% of weekly active integrators affected, a measurable funnel loss, or a security/reliability requirement. Each shipped item defines its metric and a two-week evaluation date. Archive ideas that miss their threshold rather than letting an unprioritized backlog grow.

The weekly launch note links availability, incident/restore/deploy runs, funnel changes, top feedback themes, decisions, and next owners. At 24 hours, 7 days, and 30 days after launch, run a formal review and update the risk register and roadmap.
