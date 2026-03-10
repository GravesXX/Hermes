# Hermes — Mock Interview Coach Agent

**Date:** 2026-03-10
**Status:** Approved
**Platform:** OpenClaw (Discord-ready)

---

## Overview

Hermes is an isolated, independent OpenClaw agent that conducts realistic mock interviews. Given a job description, it designs a custom multi-round interview plan from a recruiter's perspective, conducts each round interactively (supporting voice-transcribed answers), evaluates performance across 7 dimensions on a 1-5 scale, and generates targeted practice drills for weak areas. It tracks scores across sessions for longitudinal growth visibility.

## Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Name | Hermes | Greek god of communication and eloquence |
| Audio handling | Speech-to-text transcription | User sends voice; Hermes receives transcript; audio-aware eval (filler words, structure) |
| Interview plan | Hybrid | Hermes proposes 3-5 rounds from JD; user approves/edits before starting |
| Performance tracking | Cumulative, independent | Cross-session trends per dimension; no dependency on Athena or Sophon |
| Scoring | Multi-dimensional + drills | 7 dimensions, 1-5 scale, seniority-calibrated, with actionable practice exercises |
| Architecture | Session + Independent Round Entities | Rounds are independent — can pause, skip, redo without affecting others |

---

## Data Model

6 SQLite tables stored at `~/.hermes/hermes.db`.

### Entity Relationship

```
job_descriptions 1:N sessions 1:N rounds 1:N exchanges
                                  rounds 1:N scores
                         sessions 1:N drills (round_id nullable)
```

### Tables

#### job_descriptions
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| title | TEXT NOT NULL | Job title extracted from JD |
| company | TEXT | Company name if identifiable |
| raw_text | TEXT NOT NULL | Full JD text as provided |
| requirements | TEXT | JSON — parsed requirements (skills, experience, qualifications) |
| seniority_level | TEXT | junior / mid / senior / staff / lead |
| created_at | TEXT | datetime('now') |

#### sessions
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| jd_id | TEXT FK | References job_descriptions(id) |
| status | TEXT NOT NULL | planning / approved / in_progress / completed |
| plan | TEXT | JSON — approved round lineup with types and rationale |
| overall_score | REAL | Aggregate score computed at debrief |
| overall_feedback | TEXT | Session-level feedback text |
| created_at | TEXT | datetime('now') |
| completed_at | TEXT | Set when status → completed |

#### rounds
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| session_id | TEXT FK | References sessions(id) |
| round_number | INTEGER NOT NULL | Order within session (1-based) |
| type | TEXT NOT NULL | experience_screen / technical / behavioral / culture_fit / hiring_manager |
| title | TEXT NOT NULL | Display name (e.g., "Technical Deep-Dive: System Design") |
| status | TEXT NOT NULL | pending / active / completed / scored / skipped |
| questions | TEXT | JSON — prepared questions for this round |
| started_at | TEXT | Set when status → active |
| completed_at | TEXT | Set when status → completed |

#### exchanges
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| round_id | TEXT FK | References rounds(id) |
| sequence | INTEGER NOT NULL | Order within round (1-based) |
| question_text | TEXT NOT NULL | The question Hermes asked |
| answer_text | TEXT | User's answer (text or voice transcription) |
| answer_source | TEXT | text / voice_transcription |
| created_at | TEXT | datetime('now') |

#### scores
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| round_id | TEXT FK | References rounds(id) |
| dimension | TEXT NOT NULL | One of the 7 scoring dimensions |
| score | INTEGER NOT NULL | 1-5 scale |
| evidence | TEXT | Explanation of why this score was given |
| created_at | TEXT | datetime('now') |

#### drills
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | UUID |
| session_id | TEXT FK | References sessions(id) |
| round_id | TEXT FK nullable | References rounds(id), null for session-level drills |
| dimension | TEXT NOT NULL | Which dimension this drill targets |
| exercise_text | TEXT NOT NULL | The practice exercise description |
| priority | INTEGER NOT NULL | 1 (high) / 2 (medium) / 3 (low) |
| status | TEXT NOT NULL | pending / practiced |
| created_at | TEXT | datetime('now') |

### Scoring Dimensions

| Dimension Key | What It Measures |
|---------------|-----------------|
| content_relevance | Did the answer address the actual question asked? |
| star_structure | Was the answer organized with clear Situation-Task-Action-Result? |
| communication_clarity | Conciseness, logical flow, absence of filler words/rambling |
| specificity_metrics | Concrete examples, quantifiable results, named technologies |
| depth | Thoroughness of explanation, demonstrates real understanding |
| confidence_indicators | Assertive language, decisive statements vs hedging/uncertainty |
| growth_mindset | Self-awareness, learning from failures, openness to feedback |

### Indexes
- rounds(session_id)
- exchanges(round_id)
- scores(round_id)
- scores(dimension)
- drills(session_id)
- drills(dimension)
- sessions(jd_id)

---

## Tools (14 total)

All prefixed `hermes_`.

### JD Management (2)
| Tool | Parameters | Returns |
|------|-----------|---------|
| hermes_jd_ingest | text (required), title (optional), company (optional) | Stored JD with parsed requirements |
| hermes_jd_list | — | All stored JDs with metadata |

### Session Lifecycle (3)
| Tool | Parameters | Returns |
|------|-----------|---------|
| hermes_session_plan | jd_id (required) | Proposed 3-5 round plan with types, titles, rationale |
| hermes_session_approve | session_id (required), plan (optional — edited plan JSON) | Approved session with created round records |
| hermes_session_status | session_id (optional — defaults to active) | Session state, round statuses, scores so far |

### Round Execution (3)
| Tool | Parameters | Returns |
|------|-----------|---------|
| hermes_round_start | session_id (optional), round_number (optional — defaults to next pending) | First question for the round |
| hermes_round_answer | round_id (required), answer (required), source (optional — text/voice_transcription) | Next question, follow-up probe, or round completion signal |
| hermes_round_skip | round_id (required) | Confirmation, updated session status |

### Evaluation (3)
| Tool | Parameters | Returns |
|------|-----------|---------|
| hermes_round_evaluate | round_id (required) | 7-dimension scores with evidence + feedback text |
| hermes_session_debrief | session_id (required) | Aggregate scores, per-round summary, comparison to past sessions, overall feedback |
| hermes_drill_generate | session_id (required), round_id (optional) | Prioritized practice exercises for weakest dimensions |

### Performance Tracking (3)
| Tool | Parameters | Returns |
|------|-----------|---------|
| hermes_history | limit (optional) | Past sessions with scores, trend indicators |
| hermes_drill_list | dimension (optional), status (optional) | Pending/practiced drills |
| hermes_drill_complete | drill_id (required) | Confirmation |

---

## Interview Flow

```
User pastes JD
    │
    ▼
hermes_jd_ingest          ← parse requirements, store
    │
    ▼
hermes_session_plan       ← generate 3-5 rounds based on JD
    │
    ▼
User reviews plan, edits if needed
    │
    ▼
hermes_session_approve    ← lock plan, create round records
    │
    ▼
┌─── LOOP per round ────────────────────────┐
│  hermes_round_start     ← begin round     │
│      │                                     │
│      ▼                                     │
│  ┌── LOOP per question ──────────┐        │
│  │  Hermes asks question          │        │
│  │  User answers (text/voice)     │        │
│  │  hermes_round_answer           │        │
│  │  Hermes may follow up / probe  │        │
│  └────────────────────────────────┘        │
│      │                                     │
│      ▼                                     │
│  hermes_round_evaluate  ← 7-dim scoring   │
│  Show round feedback to user               │
└────────────────────────────────────────────┘
    │
    ▼
hermes_session_debrief    ← overall scores, trends, comparison
    │
    ▼
hermes_drill_generate     ← practice exercises for weak areas
```

### Interviewer Rules (embedded in round execution prompts)

1. **Calibrated probing** — If an answer is vague, follow up once with a specific probe before moving on
2. **Time-boxing** — 4-6 questions per round; don't drag rounds out
3. **No leading questions** — Open-ended, don't hint at the answer
4. **Silence after questions** — Ask and wait; don't fill silence with hints
5. **Seniority-aware expectations** — Scoring calibrated to JD seniority level
6. **STAR enforcement for behavioral** — Behavioral rounds specifically check for structured answers
7. **Follow-up depth** — Technical rounds include "why X over Y?" probes
8. **Audio-aware evaluation** — When answer_source is voice_transcription, also assess filler word patterns, verbosity, and structural organization

---

## Skills (5 slash commands)

### /interview
Main entry point for the mock interview flow.
- `/interview` — Paste a JD, plan a new session
- `/interview list` — Show past sessions with scores
- `/interview resume` — Resume an in-progress session

### /round
Control individual rounds during an active session.
- `/round start` — Begin the next pending round
- `/round start <N>` — Begin round N specifically
- `/round skip` — Skip current/next round
- `/round status` — Show current round progress

### /evaluate
Trigger evaluation.
- `/evaluate` — Evaluate the current/last completed round
- `/evaluate all` — Full session debrief

### /drills
Practice exercises for improvement.
- `/drills` — List pending drills grouped by dimension
- `/drills generate` — Generate new drills from latest session
- `/drills done <id>` — Mark a drill as practiced

### /progress
Longitudinal performance tracking.
- `/progress` — Score trends across all sessions
- `/progress <dimension>` — Deep-dive on one dimension

---

## Workspace Files

### IDENTITY.md
```
name: Hermes
tagline: Mock Interview Coach
```

### SOUL.md
- **Role:** Senior technical recruiter with 10+ years experience at top tech companies
- **Tone:** Professional but encouraging. Direct feedback, no sugarcoating, always constructive
- **Interviewer stance:** Plays the role authentically during rounds — neutral, probing, time-conscious. Breaks character only during evaluation/feedback
- **Philosophy:** "Practice doesn't make perfect — deliberate practice with targeted feedback does"

### AGENTS.md
Tool usage instructions — when to call each tool, parameter formats, flow orchestration logic.

### USER.md
User context — seniority level, target roles, known strengths/weaknesses (populated over time).

---

## Directory Structure

```
~/Desktop/hermes/
├── install.sh
├── README.md
├── workspace/
│   ├── SOUL.md
│   ├── AGENTS.md
│   ├── IDENTITY.md
│   └── USER.md
├── plugin/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── openclaw.plugin.json
│       ├── index.ts
│       ├── types.ts
│       ├── db/
│       │   ├── database.ts
│       │   └── __tests__/
│       │       └── database.test.ts
│       ├── interview/
│       │   ├── planner.ts
│       │   ├── conductor.ts
│       │   ├── evaluator.ts
│       │   └── __tests__/
│       │       ├── planner.test.ts
│       │       ├── conductor.test.ts
│       │       └── evaluator.test.ts
│       ├── performance/
│       │   ├── tracker.ts
│       │   ├── drills.ts
│       │   └── __tests__/
│       │       ├── tracker.test.ts
│       │       └── drills.test.ts
│       ├── tools/
│       │   ├── register.ts
│       │   ├── jd-tools.ts
│       │   ├── session-tools.ts
│       │   ├── round-tools.ts
│       │   ├── eval-tools.ts
│       │   ├── tracking-tools.ts
│       │   ├── helpers.ts
│       │   └── __tests__/
│       │       └── tools.test.ts
│       └── skills/
│           ├── interview/SKILL.md
│           ├── round/SKILL.md
│           ├── evaluate/SKILL.md
│           ├── drills/SKILL.md
│           └── progress/SKILL.md
```

### Dependencies
- `better-sqlite3` — SQLite with WAL mode
- `uuid` — Record IDs
- `vitest` — Testing
- `typescript` / `tsx` — Build and dev

---

## Independence Guarantees

- Own database: `~/.hermes/hermes.db` (no shared state with Sophon or Athena)
- Own workspace directory: `~/.openclaw/workspaces/hermes/`
- Own plugin directory: `~/Desktop/hermes/plugin/src/`
- No cross-agent tool calls or imports
- Can be added to OpenClaw config independently via `agents.list` and `bindings`

---

## Research Sources

Interview methodology and evaluation frameworks informed by:
- [Google re:Work Structured Interviewing](https://rework.withgoogle.com/intl/en/guides/hiring-use-structured-interviewing)
- [Tech Interview Handbook — Behavioral Rubrics](https://www.techinterviewhandbook.org/behavioral-interview-rubrics/)
- [Tech Interview Handbook — Coding Rubrics](https://www.techinterviewhandbook.org/coding-interview-rubrics/)
- [AIHR — Interview Rubric Guide](https://www.aihr.com/blog/interview-rubric/)
- [Indeed — Interview Rubrics](https://www.indeed.com/hire/c/info/interview-rubrics)
- [MIT CAPD — STAR Method](https://capd.mit.edu/resources/the-star-method-for-behavioral-interviews/)
- [Juicebox — Complete Guide to Rubrics for Interviews 2026](https://juicebox.ai/blog/rubrics-for-interviews)
