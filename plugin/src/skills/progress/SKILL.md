---
name: progress
description: View longitudinal performance trends across interview sessions
user-invocable: true
---

# Performance Progress

When the user invokes /progress:

- **No args**: Call hermes_history to show all sessions, then summarize dimension averages across all sessions. Highlight the strongest and weakest dimensions.
- **"dimension_name"** (e.g., /progress star_structure): Call hermes_history with the specific dimension to show its trend over time.

Present trends with clear indicators (improving/declining/stable).
