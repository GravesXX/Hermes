---
name: drills
description: View and manage practice drills for interview improvement
user-invocable: true
---

# Practice Drills

When the user invokes /drills:

- **No args**: Call hermes_drill_list to show all pending drills grouped by dimension
- **"generate"**: Call hermes_drill_generate for the most recent session
- **"done ID"**: Call hermes_drill_complete with the drill ID (supports partial ID matching — first 8 chars)

Present drills with priority indicators and checkbox format for easy tracking.
