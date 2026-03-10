---
name: round
description: Control interview rounds — start, skip, or check status
user-invocable: true
---

# Round Control

When the user invokes /round, determine the action:

- **"start"**: Call hermes_round_start (next pending round)
- **"start N"**: Call hermes_round_start with round_number=N
- **"skip"**: Find the next pending or active round, call hermes_round_skip
- **"status"**: Call hermes_session_status for the active session

During an active round:
1. Use the conduct prompt from the Conductor to ask questions
2. When the user responds (text or voice message), call hermes_round_answer
3. Continue until 4-6 questions are complete, then complete the round
4. After completing, automatically trigger evaluation
