# Hermes

A mock interview coach built on [OpenClaw](https://openclaw.ai).

Hermes simulates realistic multi-round job interviews. Give it a job description, and it designs a custom interview pipeline from a recruiter's perspective — experience screen, technical deep-dive, behavioral questions, culture fit. You answer each round (text or voice), and Hermes evaluates your performance across 7 dimensions with specific, actionable feedback. It tracks your scores over time so you can see exactly where you're improving and where you're stuck.

## Architecture

```
OpenClaw (Gateway)
  ├── Discord / Telegram / WhatsApp / Web Chat
  └── Hermes Plugin (TypeScript)
        ├── Planner ─────── JD analysis, interview plan generation
        ├── Conductor ────── round execution, Q&A flow, probing
        ├── Evaluator ────── 7-dimension scoring, session debrief
        ├── Tracker ──────── cross-session trends, analytics
        ├── DrillManager ─── targeted practice exercises
        └── SQLite (~/.hermes/hermes.db)
              ├── job_descriptions   stored JDs with parsed requirements
              ├── sessions           interview attempts with plans
              ├── rounds             independent round entities
              ├── exchanges          Q&A pairs within rounds
              ├── scores             per-round, per-dimension scores
              └── drills             actionable practice exercises
```

Hermes runs as an OpenClaw plugin. OpenClaw handles messaging infrastructure and LLM orchestration. Hermes provides 14 tools that Claude calls during conversations, plus workspace files that define the recruiter/coach persona.

## How It Works

### 1. Paste a Job Description

Hermes parses the JD and designs 3-5 interview rounds tailored to the role. You review the plan and approve (or edit) before starting.

### 2. Interview Round by Round

Each round is conducted realistically:
- **Experience Screen** — career trajectory, role motivation, background verification
- **Technical** — system design, architecture decisions, trade-off analysis
- **Behavioral** — "Tell me about a time..." with STAR structure enforcement
- **Culture Fit** — values alignment, pressure handling, collaboration style
- **Hiring Manager** — big-picture assessment, career goals, team fit

You can answer via text or voice message. Voice answers are transcribed and evaluated with audio-aware feedback (filler words, verbosity, spoken structure).

### 3. Get Scored and Coached

After each round, Hermes scores you across 7 dimensions:

| Dimension | What It Measures |
|-----------|-----------------|
| **Content Relevance** | Did you actually answer the question? |
| **STAR Structure** | Clear Situation-Task-Action-Result organization? |
| **Communication Clarity** | Concise, logical, no filler words? |
| **Specificity & Metrics** | Concrete examples, quantifiable results? |
| **Depth** | Thorough explanation, real understanding? |
| **Confidence Indicators** | Assertive language vs hedging? |
| **Growth Mindset** | Self-awareness, learning from failures? |

Each dimension gets a 1-5 score with specific evidence from your answers.

### 4. Practice Your Weak Spots

Hermes generates targeted drills for your weakest dimensions. Example: "Your specificity score was 2/5 — re-answer Q2 but include at least 2 quantifiable metrics."

### 5. Track Progress Over Time

Scores are tracked across sessions. You can see trends per dimension — "Your STAR structure improved from 2.5 to 4.0 over 3 sessions, but communication clarity has plateaued at 3.0."

## Interview Rules

Hermes follows professional interviewing standards:

1. **Calibrated probing** — vague answer gets one follow-up, then moves on
2. **Time-boxing** — 4-6 questions per round, no dragging
3. **No leading questions** — open-ended, no hints
4. **Silence after questions** — asks and waits, like a real interviewer
5. **Seniority-aware** — expectations calibrated to the JD's level
6. **STAR enforcement** — behavioral rounds check for structured answers
7. **Follow-up depth** — technical rounds probe "why X over Y?"

## Requirements

- [OpenClaw](https://openclaw.ai) installed and configured
- Node.js >= 22
- Anthropic account (API key or Pro/Max subscription via OAuth)

## Installation

```bash
git clone https://github.com/GravesXX/hermes.git ~/Desktop/hermes
cd ~/Desktop/hermes
bash install.sh
```

The installer runs `npm install`, verifies the TypeScript build, and runs all tests.

Then add to your OpenClaw config (`~/.openclaw/openclaw.json`):

```json
{
  "agents": {
    "list": {
      "hermes": {
        "name": "Hermes",
        "plugin": "~/Desktop/hermes/plugin/src/index.ts"
      }
    }
  },
  "workspaces": {
    "hermes": "~/Desktop/hermes/workspace"
  }
}
```

## Usage

### Slash Commands

| Command | What it does |
|---------|-------------|
| `/interview` | Paste a JD, start a new mock interview |
| `/interview list` | Show past sessions with scores |
| `/interview resume` | Resume an in-progress session |
| `/round start` | Begin the next interview round |
| `/round start N` | Begin round N specifically |
| `/round skip` | Skip current round |
| `/round status` | Show current round progress |
| `/evaluate` | Score the last completed round |
| `/evaluate all` | Full session debrief |
| `/drills` | List pending practice exercises |
| `/drills generate` | Generate drills from latest session |
| `/drills done <id>` | Mark a drill as practiced |
| `/progress` | Score trends across all sessions |
| `/progress <dim>` | Deep-dive on one dimension |

### Example Session

```
You: /interview
     [pastes Senior Backend Engineer JD from Acme Corp]

Hermes: I've analyzed the JD. Here's the proposed interview plan:

  1. Experience Screen — verify 5+ years backend, API design background
  2. Technical Deep-Dive: System Design — distributed systems, scalability
  3. Behavioral — teamwork, conflict resolution, failure handling
  4. Hiring Manager — career goals, team fit, growth trajectory

  Approve this plan, or tell me what to change.

You: approve

Hermes: Plan locked. Starting Round 1: Experience Screen.
        Tell me about your current role and what brought you here today.

You: [voice message] I'm currently a backend engineer at...

Hermes: You mentioned API work — can you walk me through a specific API
        you designed and the trade-offs you made?

... [4-6 questions] ...

Hermes: Round 1 complete. Here's your evaluation:

  Content Relevance:     4/5 — addressed all questions directly
  STAR Structure:        2/5 — answers lacked clear situation/result framing
  Communication Clarity: 3/5 — some filler words ("um", "like"), decent flow
  Specificity & Metrics: 4/5 — good: "reduced latency by 40%", "served 2M RPM"
  Depth:                 3/5 — could go deeper on architectural trade-offs
  Confidence:            4/5 — assertive delivery on technical topics
  Growth Mindset:        3/5 — mentioned learning but didn't elaborate

  Overall: 3.3/5 — Solid technical foundation. Focus on STAR structure
  and go deeper on trade-offs.

  Ready for Round 2?
```

## Plugin Tools Reference

Hermes registers 14 tools with OpenClaw:

| Tool | Purpose |
|------|---------|
| `hermes_jd_ingest` | Store a job description with parsed requirements |
| `hermes_jd_list` | List all stored job descriptions |
| `hermes_session_plan` | Generate interview plan from a JD |
| `hermes_session_approve` | Approve plan and create round records |
| `hermes_session_status` | Show session state with rounds and scores |
| `hermes_round_start` | Begin an interview round |
| `hermes_round_answer` | Record candidate's answer (text or voice) |
| `hermes_round_skip` | Skip a round |
| `hermes_round_evaluate` | Score a round across 7 dimensions |
| `hermes_session_debrief` | Generate full session debrief with trends |
| `hermes_drill_generate` | Create targeted practice exercises |
| `hermes_history` | Show past sessions with score trends |
| `hermes_drill_list` | List practice drills by dimension/status |
| `hermes_drill_complete` | Mark a drill as practiced |

## Data Model

Six SQLite tables in `~/.hermes/hermes.db`:

**job_descriptions** — Stored JDs with title, company, raw text, parsed requirements, and seniority level.

**sessions** — Interview attempts linked to a JD. Status lifecycle: planning → approved → in_progress → completed. Stores the approved round plan and overall debrief scores.

**rounds** — Independent round entities within a session. Each has its own status (pending → active → completed → scored), type, and prepared questions. Can be started, completed, or skipped independently.

**exchanges** — Q&A pairs within a round. Tracks question text, answer text, answer source (text vs voice_transcription), and sequence order.

**scores** — Per-round, per-dimension scores (1-5) with evidence text explaining the rating.

**drills** — Targeted practice exercises generated from weak dimensions. Prioritized (1-3) and tracked (pending → practiced).

## Project Structure

```
hermes/
├── install.sh
├── workspace/
│   ├── SOUL.md                 # Recruiter/coach persona
│   ├── AGENTS.md               # Operating instructions + tool usage
│   ├── IDENTITY.md             # Name and tagline
│   └── USER.md                 # User context (populated over time)
├── plugin/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── openclaw.plugin.json
│       ├── index.ts            # Entry point
│       ├── types.ts            # OpenClaw API types
│       ├── db/
│       │   ├── database.ts     # HermesDB class (6 tables, 30+ methods)
│       │   └── __tests__/
│       ├── interview/
│       │   ├── planner.ts      # JD analysis, round plan generation
│       │   ├── conductor.ts    # Round execution, Q&A flow
│       │   ├── evaluator.ts    # 7-dimension scoring engine
│       │   └── __tests__/
│       ├── performance/
│       │   ├── tracker.ts      # Cross-session trend analytics
│       │   ├── drills.ts       # Practice exercise management
│       │   └── __tests__/
│       ├── tools/
│       │   ├── register.ts     # Central wiring (14 tools)
│       │   ├── jd-tools.ts     # 2 JD management tools
│       │   ├── session-tools.ts # 3 session lifecycle tools
│       │   ├── round-tools.ts  # 3 round execution tools
│       │   ├── eval-tools.ts   # 3 evaluation tools
│       │   ├── tracking-tools.ts # 3 tracking tools
│       │   └── helpers.ts      # Result wrapper
│       └── skills/
│           ├── interview/      # /interview command
│           ├── round/          # /round command
│           ├── evaluate/       # /evaluate command
│           ├── drills/         # /drills command
│           └── progress/       # /progress command
└── docs/
    └── superpowers/
        ├── specs/              # Design specification
        └── plans/              # Implementation plan
```

## Development

```bash
cd plugin
npm install
npm test              # run all 33 tests
npm run test:watch    # watch mode
npm run build         # compile TypeScript
```

### Test Coverage

| Suite | Tests | Covers |
|-------|-------|--------|
| database | 11 | Schema init, all 6 tables CRUD, status transitions, filtering |
| planner | 3 | Plan prompt generation, plan approval, validation |
| conductor | 7 | Round start/complete/skip, answer recording, conduct prompts, session status |
| evaluator | 5 | Dimensions export, evaluation prompts, score application, debrief, averages |
| tracker | 3 | Session history, dimension trends, empty state |
| drills | 4 | Drill prompts, creation, listing, completion |

## Independence

Hermes is fully isolated from other OpenClaw agents:
- Own database: `~/.hermes/hermes.db`
- Own workspace: no shared state with Sophon, Athena, or any other agent
- Own plugin: no cross-agent tool calls or imports
- Can be added or removed from OpenClaw config independently

## Data Privacy

All data is stored locally in `~/.hermes/hermes.db`. Nothing leaves your machine except API calls to Claude for generating responses, evaluations, and interview questions. Your interview history, scores, and practice data stay on your local filesystem.

## Design Documents

- [Design Specification](docs/superpowers/specs/2026-03-10-hermes-mock-interview-agent-design.md) — Architecture, data model, tool inventory, scoring framework
- [Implementation Plan](docs/superpowers/plans/2026-03-10-hermes-mock-interview-agent.md) — 10 tasks, 3 chunks, TDD throughout
