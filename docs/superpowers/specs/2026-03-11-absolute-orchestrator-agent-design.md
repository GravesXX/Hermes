# Absolute — Orchestrator Agent Design

> The Absolute sees all threads.

## Overview

Absolute is an orchestrator agent for OpenClaw that acts as the default entry point for all user messages. Named after Baldur's Gate 3's hive-mind deity, it plans, delegates, and synthesizes work across three specialist agents (Sophon, Athena, Hermes) while maintaining its own persistent state for coordination tracking, quality gating, and agent performance metrics.

**Role:** Manager — plans and delegates, synthesizes results, maintains its own conversational voice.

**Personality:** BG3-flavored omniscience. Quiet authority, not theatrical. Specialists are "the Chosen." Warm beneath the all-seeing tone. Proactively surfaces cross-domain connections.

**Delegation model:** Consultative + monitored. Consults specialists before execution, checks in during long-running tasks when needed.

**Quality model:** Review + user checkpoint. Plans presented to user before delegation. Results reviewed against requirements before surfacing. User stays in the loop on key decisions. Default quality threshold: 3/5 — tasks scoring below are sent back with feedback. Threshold is configurable via preferences.

---

## Cross-Agent Communication Architecture

Absolute does **not** invoke specialists programmatically. OpenClaw's plugin API (`PluginAPI`) only exposes `registerTool` and `registerCommand` — there is no `spawnAgent()` or RPC mechanism.

Instead, cross-agent communication works at the **LLM layer**:

1. Absolute's LLM reasoning decides to consult/delegate to a specialist
2. Absolute @mentions the specialist in its response (e.g., "@Athena, review this resume against the JD")
3. OpenClaw's framework detects the mention, checks `subagents.allowAgents`, and spawns the specialist agent as a subagent within the conversation
4. The specialist executes using its own tools and database, returns results in the conversation
5. Absolute's LLM receives the specialist's response and continues its workflow

**Absolute's plugin tools are bookkeeping** — they record plans, tasks, consultations, delegations, and quality reviews in SQLite. The actual orchestration happens through Absolute's workspace instructions (AGENTS.md) which teach the LLM when and how to @mention specialists.

The `orchestration/` module classes (Planner, Delegator, Reviewer) are **state management layers**, not execution engines. They wrap database operations and provide structured interfaces for the tools to call.

---

## Specialist Agents

| Agent | Alias | Domain | Tools |
|-------|-------|--------|-------|
| Sophon | The Sage | Topics, memory, personality profiling | 12 |
| Athena | The Strategist | Projects, decisions, todos, resumes, career | 23 |
| Hermes | The Herald | Mock interviews, evaluation, drills | 14 |

---

## Data Model

Six SQLite tables in `~/.absolute/absolute.db`.

### plans

High-level coordination plans created when a complex request arrives.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| title | TEXT | Short plan title |
| description | TEXT | Full plan description |
| status | TEXT | draft → consulting → approved → in_progress → completed → failed |
| user_approved | INTEGER | Boolean — user signed off on the plan |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### tasks

Individual work items within a plan, each delegated to a specialist.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| plan_id | TEXT FK | References plans.id |
| agent_id | TEXT | sophon / athena / hermes |
| title | TEXT | Task title |
| description | TEXT | Full task description with context |
| status | TEXT | pending → consulting → delegated → in_progress → review → completed → failed |
| sequence | INTEGER | Execution order within plan |
| result_summary | TEXT | Specialist's output summary |
| quality_score | INTEGER | 1-5, set during review |
| quality_notes | TEXT | Review feedback |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

### consultations

Back-and-forth between Absolute and specialists during planning or execution.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| plan_id | TEXT FK | Nullable — references plans.id (for plan-level consultations before tasks exist) |
| task_id | TEXT FK | Nullable — references tasks.id |
| agent_id | TEXT | Which specialist |
| phase | TEXT | planning / execution |
| message | TEXT | What Absolute asked |
| response | TEXT | What the specialist said |
| created_at | TEXT | ISO timestamp |

### agent_metrics

Aggregated performance tracking per agent per domain.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| agent_id | TEXT | sophon / athena / hermes |
| domain | TEXT | e.g. "resume", "interview", "reflection" |
| tasks_completed | INTEGER | Count |
| avg_quality | REAL | Rolling average quality score |
| avg_response_rounds | REAL | Average consultation rounds needed |
| last_updated | TEXT | ISO timestamp |

### preferences

User preferences for how Absolute operates.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| key | TEXT UNIQUE | Preference key |
| value | TEXT | Preference value (JSON-encoded if complex) |
| updated_at | TEXT | ISO timestamp |

### coordination_log

Append-only log of every significant action.

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| plan_id | TEXT FK | Nullable — references plans.id |
| task_id | TEXT FK | Nullable — references tasks.id |
| action | TEXT | plan_created, task_delegated, consultation_sent, quality_review, user_checkpoint, etc. |
| detail | TEXT | Free-form detail |
| created_at | TEXT | ISO timestamp |

---

## Tool Inventory (16 tools)

### Plan Tools (4)

| Tool | Purpose |
|------|---------|
| `absolute_plan_create` | Create a new coordination plan — title and description only (tasks added separately via `absolute_task_create`) |
| `absolute_plan_status` | Get plan with all tasks, consultations, current state |
| `absolute_plan_approve` | Record user approval before delegation begins |
| `absolute_plan_list` | List recent plans with status summary |

### Task Tools (4)

| Tool | Purpose |
|------|---------|
| `absolute_task_create` | Add a task to a plan — assign agent, description, sequence |
| `absolute_task_update` | Update task status, result summary, quality score |
| `absolute_task_list` | List tasks for a plan or across all active plans |
| `absolute_task_delegate` | Mark task as delegated, log the delegation |

### Consultation Tools (2)

| Tool | Purpose |
|------|---------|
| `absolute_consult` | Record a consultation message sent to a specialist |
| `absolute_consult_response` | Record the specialist's response |

### Quality Tools (2)

| Tool | Purpose |
|------|---------|
| `absolute_quality_review` | Score a completed task (1-5), notes, pass/fail |
| `absolute_quality_summary` | Quality stats across recent tasks/agents |

### Metrics & Preferences (3)

| Tool | Purpose |
|------|---------|
| `absolute_metrics` | Agent performance metrics — filterable by agent/domain |
| `absolute_preference_set` | Set a user preference |
| `absolute_preference_get` | Get current preferences |

### Coordination Log (1)

| Tool | Purpose |
|------|---------|
| `absolute_log` | Query coordination log — filter by plan, task, action, date |

---

## Orchestration Workflow

```
User message
  │
  ├─ Simple/conversational? → Absolute responds directly
  │                           (proactively checks specialists for relevant context)
  │
  └─ Needs specialist work?
       │
       1. PLAN — Create plan, break into tasks, assign agents
       │
       2. CHECKPOINT — Present plan to user for approval
       │         (user can adjust agents, reorder, remove tasks)
       │
       3. CONSULT — @mention each specialist:
       │         "Here's what I'm thinking. Does this make sense?"
       │         Record consultation + response
       │
       4. FINALIZE — Adjust plan based on specialist feedback
       │         (re-checkpoint if significant changes)
       │
       5. DELEGATE — Send tasks in sequence (or parallel if independent)
       │         Log each delegation
       │
       6. MONITOR — Check in on long-running tasks when needed
       │         Record check-in consultations
       │
       7. REVIEW — Score quality (1-5) against requirements
       │         Below threshold → send back with feedback
       │         Acceptable → record and continue
       │
       8. SYNTHESIZE — Combine results into coherent response
       │         Present with summary of what each agent did
       │
       9. LOG — Update metrics, coordination log, close plan
```

**Shortcut paths:**
- Single-agent straightforward tasks skip consultation
- Familiar patterns skip user checkpoint with a note
- Urgent tasks can be fast-tracked with post-hoc review

**Error handling:**
- Task failure: mark task as `failed`, log reason, notify user. Do not retry automatically — present options (retry, skip, reassign to different agent, abort plan).
- Quality below threshold (< 3/5): send back to specialist with specific feedback. Max 2 retries before escalating to user.
- Specialist unresponsive: if @mention gets no response, log and inform user. Do not block other tasks.
- Plan failure: if > 50% of tasks fail, mark plan as `failed` and present a summary of what worked and what didn't.
- Dependent task failure: if a task's predecessor fails, mark dependent tasks as `failed` with reason "predecessor failed" and inform user.

---

## Workspace Files

### IDENTITY.md
- Name: Absolute
- Tagline: "The Absolute sees all threads."
- Emoji: 👁️

### SOUL.md
BG3-flavored omniscient persona:
- Quiet authority, not theatrical villain monologues
- References "seeing threads," "paths converging," "deploying the Chosen"
- Specialists: Sophon the Sage, Athena the Strategist, Hermes the Herald
- Warmth beneath omniscience — genuinely wants user success
- Proactively surfaces cross-domain connections

### AGENTS.md
Full orchestration workflow as step-by-step operating instructions:
- When to respond directly vs. delegate
- Consultation protocol with exact phrasing patterns
- Quality review criteria (1-5 scoring rubric)
- When to skip checkpoints
- Multi-agent result synthesis patterns
- Metric tracking triggers

### USER.md
Populated over time:
- Learned preferences
- Preferred delegation patterns
- Agent consultation preferences

---

## OpenClaw Configuration

### New agent
```json
{
  "id": "absolute",
  "default": true,
  "workspace": "/Users/moomoo/.openclaw/workspaces/absolute",
  "identity": {
    "name": "Absolute",
    "theme": "Omniscient orchestrator",
    "emoji": "👁️"
  },
  "subagents": {
    "allowAgents": ["sophon", "athena", "hermes"]
  }
}
```

### Config changes
- Sophon: remove `"default": true`
- Sophon: add `"absolute"` to existing `allowAgents` → `["athena", "absolute"]`
- Athena: add `"absolute"` to existing `allowAgents` → `["sophon", "absolute"]`
- Hermes: add `"subagents": { "allowAgents": ["absolute"] }` (currently has no subagents key)
- New Discord binding: `{ "match": { "channel": "discord", "accountId": "absolute" }, "agentId": "absolute" }`
- New Discord account with bot token under `channels.discord.accounts.absolute` (requires creating a new Discord bot application)
- Plugin path: `/Users/moomoo/Desktop/absolute/plugin/src/index.ts` added to `plugins.load.paths`
- Add `"absolute"` to `plugins.allow`
- Add `"absolute": { "enabled": true }` to `plugins.entries`

---

## Project Structure

```
absolute/
├── install.sh
├── workspace/
│   ├── SOUL.md
│   ├── AGENTS.md
│   ├── IDENTITY.md
│   └── USER.md
├── plugin/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── openclaw.plugin.json   # Plugin manifest (id, entry, skills)
│       ├── index.ts               # Entry point: exports id, name, register()
│       ├── types.ts               # OpenClaw API types
│       ├── db/
│       │   ├── database.ts
│       │   └── __tests__/
│       ├── orchestration/
│       │   ├── planner.ts
│       │   ├── delegator.ts
│       │   ├── reviewer.ts
│       │   └── __tests__/
│       ├── tracking/
│       │   ├── metrics.ts
│       │   ├── preferences.ts
│       │   └── __tests__/
│       └── tools/
│           ├── register.ts
│           ├── plan-tools.ts
│           ├── task-tools.ts
│           ├── consult-tools.ts
│           ├── quality-tools.ts
│           ├── tracking-tools.ts
│           ├── log-tools.ts
│           └── helpers.ts
└── docs/
    └── superpowers/
        ├── specs/
        └── plans/
```

---

## Tech Stack

- TypeScript (CommonJS, same pattern as Sophon/Athena/Hermes)
- better-sqlite3 for persistence
- uuid for ID generation
- vitest for testing
- OpenClaw plugin API (PluginAPI, registerTool)
