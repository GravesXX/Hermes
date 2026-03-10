---
name: interview
description: Start a mock interview, list past sessions, or resume an in-progress session
user-invocable: true
---

# Mock Interview

When the user invokes /interview, determine the action from their message:

- **No args / paste of JD text**: Call hermes_jd_ingest with the text, then call hermes_session_plan with the resulting JD ID. Present the proposed rounds to the user for approval. Once approved, call hermes_session_approve.
- **"list"**: Call hermes_history to show past sessions with scores.
- **"resume"**: Call hermes_session_status to find the active session, then show its current state and offer to continue.

If the user pastes a job description without invoking /interview, still recognize it and start the flow.
