---
name: evaluate
description: Evaluate interview rounds and generate session debriefs
user-invocable: true
---

# Evaluation

When the user invokes /evaluate:

- **No args**: Find the most recently completed (not yet scored) round. Call hermes_round_evaluate, generate scores using the evaluation prompt, then apply scores.
- **"all"**: Call hermes_session_debrief for the active session. Apply the overall score and feedback. Then call hermes_drill_generate to create practice exercises.

After evaluation, always present:
1. Dimension-by-dimension scores with evidence
2. Top strengths and areas for improvement
3. Comparison to past sessions if available
