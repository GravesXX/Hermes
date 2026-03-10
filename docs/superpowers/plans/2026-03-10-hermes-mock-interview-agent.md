# Hermes Mock Interview Agent Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully independent OpenClaw mock interview agent with 6 SQLite tables, 14 tools, 5 skills, and 7-dimension scoring with cumulative tracking.

**Architecture:** Session + Independent Round Entities pattern. HermesDB provides all persistence. Business logic split into three modules: interview (planner, conductor, evaluator) and performance (tracker, drills). Tools registered centrally, delegating to business logic classes.

**Tech Stack:** TypeScript, better-sqlite3, uuid, vitest, OpenClaw plugin API (same stack as Sophon/Athena)

**Spec:** `docs/superpowers/specs/2026-03-10-hermes-mock-interview-agent-design.md`

---

## Chunk 1: Project Scaffold + Database Layer

### Task 1: Project scaffold

**Files:**
- Create: `plugin/package.json`
- Create: `plugin/tsconfig.json`
- Create: `plugin/src/openclaw.plugin.json`
- Create: `plugin/src/index.ts`
- Create: `plugin/src/types.ts`
- Create: `plugin/src/tools/helpers.ts`
- Create: `plugin/src/tools/register.ts` (placeholder)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "hermes-plugin",
  "version": "0.1.0",
  "description": "Hermes mock interview coach plugin",
  "main": "index.js",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "build": "tsc"
  },
  "type": "commonjs",
  "openclaw": {
    "extensions": ["./src/index.ts"]
  },
  "dependencies": {
    "better-sqlite3": "^12.6.2",
    "uuid": "^13.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^25.3.0",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create openclaw.plugin.json**

```json
{
  "id": "hermes",
  "name": "Hermes - Mock Interview Coach",
  "version": "0.1.0",
  "description": "Mock interview agent with multi-round sessions, 7-dimension scoring, and cumulative performance tracking",
  "entry": "./index.ts",
  "skills": ["./skills"],
  "configSchema": {
    "type": "object",
    "additionalProperties": false,
    "properties": {}
  }
}
```

- [ ] **Step 4: Create types.ts** — same OpenClaw plugin API contract as Sophon/Athena

```typescript
export interface PluginAPI {
  registerTool(tool: ToolDefinition): void;
  registerCommand(command: CommandDefinition): void;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ParameterDef>;
  execute: (id: string, params: Record<string, unknown>) => Promise<McpToolResult>;
}

export interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface ParameterDef {
  type: string;
  description: string;
  required?: boolean;
  enum?: string[];
}

export interface CommandDefinition {
  name: string;
  description: string;
  run: (args: string) => Promise<string>;
}

export interface ToolResult {
  content: string;
  error?: string;
}
```

- [ ] **Step 5: Create index.ts**

```typescript
import type { PluginAPI } from './types.js';
import { registerAllTools } from './tools/register.js';

export const id = 'hermes';
export const name = 'Hermes - Mock Interview Coach';

export function register(api: PluginAPI) {
  registerAllTools(api);
  console.log('[Hermes] Plugin loaded successfully');
}
```

- [ ] **Step 6: Create tools/helpers.ts**

```typescript
import type { McpToolResult, ToolResult } from '../types.js';

export function text(result: ToolResult | Promise<ToolResult>): McpToolResult | Promise<McpToolResult> {
  if (result instanceof Promise) {
    return result.then(r => wrap(r));
  }
  return wrap(result);
}

function wrap(result: ToolResult): McpToolResult {
  if (result.error) {
    return { content: [{ type: 'text', text: 'Error: ' + result.error }], isError: true };
  }
  return { content: [{ type: 'text', text: result.content }] };
}
```

- [ ] **Step 7: Create placeholder tools/register.ts**

```typescript
import type { PluginAPI } from '../types.js';

export function registerAllTools(api: PluginAPI): void {
  // Tools will be registered in subsequent tasks
}
```

- [ ] **Step 8: Install dependencies**

Run: `cd ~/Desktop/hermes/plugin && npm install`

- [ ] **Step 9: Verify build**

Run: `cd ~/Desktop/hermes/plugin && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add plugin/
git commit -m "feat: scaffold Hermes plugin with OpenClaw structure"
```

---

### Task 2: Database — schema and core CRUD

**Files:**
- Create: `plugin/src/db/database.ts`
- Create: `plugin/src/db/__tests__/database.test.ts`

- [ ] **Step 1: Write the failing test — table creation**

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HermesDB } from '../database.js';
import fs from 'fs';
import path from 'path';

const TEST_DB_PATH = path.join(__dirname, 'test-hermes.db');

describe('HermesDB', () => {
  let db: HermesDB;

  beforeEach(() => {
    db = new HermesDB(TEST_DB_PATH);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    const wal = TEST_DB_PATH + '-wal';
    const shm = TEST_DB_PATH + '-shm';
    if (fs.existsSync(wal)) fs.unlinkSync(wal);
    if (fs.existsSync(shm)) fs.unlinkSync(shm);
  });

  it('should create all 6 tables on initialization', () => {
    const tables = db.listTables();
    expect(tables).toContain('job_descriptions');
    expect(tables).toContain('sessions');
    expect(tables).toContain('rounds');
    expect(tables).toContain('exchanges');
    expect(tables).toContain('scores');
    expect(tables).toContain('drills');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ~/Desktop/hermes/plugin && npx vitest run src/db/__tests__/database.test.ts`
Expected: FAIL — HermesDB not found

- [ ] **Step 3: Write HermesDB class**

Create `plugin/src/db/database.ts` with:
- 6 interfaces: JobDescription, Session, Round, Exchange, Score, Drill
- Inlined SCHEMA constant with all 6 CREATE TABLE statements and 7 indexes (see spec for exact columns and constraints)
- HermesDB class with constructor (creates dir, opens DB, enables WAL + foreign keys, runs schema)
- CRUD methods for each table:
  - **job_descriptions**: createJobDescription, getJobDescription, getAllJobDescriptions
  - **sessions**: createSession, getSession, getActiveSession, updateSessionStatus, updateSessionPlan, updateSessionDebrief, getCompletedSessions
  - **rounds**: createRound, getRound, getSessionRounds, getNextPendingRound, getActiveRound, updateRoundStatus
  - **exchanges**: createExchange, getExchange, getRoundExchanges, getLatestExchange, recordAnswer
  - **scores**: createScore, getScore, getRoundScores, getScoresByDimension
  - **drills**: createDrill, getDrill, getDrills (with dimension/status filters), completeDrill
  - **utility**: listTables, close

Follow the exact same patterns as SophonDB: uuid for IDs, prepared statements, `as Type` casts.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd ~/Desktop/hermes/plugin && npx vitest run src/db/__tests__/database.test.ts`
Expected: PASS — 1 test

- [ ] **Step 5: Write remaining DB tests** — add 10 more tests covering:

1. Create and retrieve a job description
2. Create a session linked to a JD
3. Create rounds for a session and verify ordering
4. Track round status transitions (pending -> active -> completed) with timestamps
5. Create exchanges and record answers with voice_transcription source
6. Create scores for a round and verify dimension ordering
7. Create and manage drills (create, complete, verify status change)
8. Filter drills by dimension and status
9. Get next pending round (skip completed ones)
10. Update session debrief (overall_score and overall_feedback)

- [ ] **Step 6: Run all DB tests**

Run: `cd ~/Desktop/hermes/plugin && npx vitest run src/db/__tests__/database.test.ts`
Expected: PASS — 11 tests

- [ ] **Step 7: Commit**

```bash
git add plugin/src/db/
git commit -m "feat: add HermesDB with 6-table schema and full CRUD"
```

---

## Chunk 2: Interview Business Logic

### Task 3: Planner module

**Files:**
- Create: `plugin/src/interview/planner.ts`
- Create: `plugin/src/interview/__tests__/planner.test.ts`

The Planner reads a JD from the database, builds a prompt for the LLM to generate an interview plan, and handles plan approval by creating round records.

- [ ] **Step 1: Write failing tests** — 3 tests:
1. `buildPlanPrompt` should include JD title, company, seniority, and instruction for 3-5 rounds
2. `approvePlan` should parse JSON plan, create round records, update session to approved
3. `approvePlan` should reject if session is not in planning status

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd ~/Desktop/hermes/plugin && npx vitest run src/interview/__tests__/planner.test.ts`
Expected: FAIL — Planner not found

- [ ] **Step 3: Implement Planner class**

```typescript
// plugin/src/interview/planner.ts
export class Planner {
  constructor(private db: HermesDB) {}

  buildPlanPrompt(sessionId: string): string
  // Returns a prompt containing JD details and instructions for generating
  // a JSON array of 3-5 rounds with type, title, rationale

  approvePlan(sessionId: string, planJson: string): ToolResult
  // Validates session is in 'planning' status
  // Parses JSON array of { type, title, rationale }
  // Stores plan JSON on session, updates status to 'approved'
  // Creates round records (round_number = index + 1)
  // Returns confirmation with round listing
}
```

- [ ] **Step 4: Run tests**

Run: `cd ~/Desktop/hermes/plugin && npx vitest run src/interview/__tests__/planner.test.ts`
Expected: PASS — 3 tests

- [ ] **Step 5: Commit**

```bash
git add plugin/src/interview/planner.ts plugin/src/interview/__tests__/planner.test.ts
git commit -m "feat: add Planner module for JD-based interview plan generation"
```

---

### Task 4: Conductor module

**Files:**
- Create: `plugin/src/interview/conductor.ts`
- Create: `plugin/src/interview/__tests__/conductor.test.ts`

Manages round execution: starting rounds, recording Q&A, building conduct prompts, session status.

- [ ] **Step 1: Write failing tests** — 7 tests:
1. Start next pending round (sets active, updates session to in_progress)
2. Start a specific round by number
3. Record an answer to the latest exchange
4. Complete a round (status -> completed, timestamp set)
5. Skip a round (status -> skipped)
6. Build conduct prompt (contains round type, JD context, interview rules, exchange history)
7. Get session status summary (rounds with statuses and scores)

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement Conductor class**

Key methods:
- `startRound(sessionId, roundNumber?)` — validates no active round, sets pending->active, session->in_progress
- `recordAnswer(roundId, answer, source)` — finds latest unanswered exchange, records answer
- `completeRound(roundId)` — sets active->completed
- `skipRound(roundId)` — sets pending/active->skipped
- `buildConductPrompt(roundId)` — returns prompt with JD context, round type guidance, exchange history, interviewer rules
- `getSessionStatus(sessionId)` — returns formatted status with all rounds, exchange counts, scores
- Private `getRoundTypeGuidance(type)` — returns type-specific interviewing guidance

- [ ] **Step 4: Run tests**

Run: `cd ~/Desktop/hermes/plugin && npx vitest run src/interview/__tests__/conductor.test.ts`
Expected: PASS — 7 tests

- [ ] **Step 5: Commit**

```bash
git add plugin/src/interview/conductor.ts plugin/src/interview/__tests__/conductor.test.ts
git commit -m "feat: add Conductor module for round execution and Q&A flow"
```

---

### Task 5: Evaluator module

**Files:**
- Create: `plugin/src/interview/evaluator.ts`
- Create: `plugin/src/interview/__tests__/evaluator.test.ts`

Builds scoring prompts, stores scores, generates session debriefs.

- [ ] **Step 1: Write failing tests** — 5 tests:
1. DIMENSIONS constant exports all 7 dimensions
2. `buildEvaluationPrompt` includes exchanges, dimension descriptions, 1-5 scale, audio-aware notes
3. `applyScores` parses JSON, creates score records, updates round to scored
4. `buildDebriefPrompt` includes round summaries and past session comparison
5. `computeSessionAverage` calculates correct weighted average

- [ ] **Step 2: Run tests to verify they fail**

- [ ] **Step 3: Implement Evaluator class**

Export `DIMENSIONS` constant array and `DIMENSION_DESCRIPTIONS` map.

Key methods:
- `buildEvaluationPrompt(roundId)` — prompt with exchanges, dimension list, scoring scale, audio-aware notes
- `applyScores(roundId, scoresJson)` — parse JSON {scores: [{dimension, score, evidence}]}, create Score records, update round to scored
- `buildDebriefPrompt(sessionId)` — prompt with all round scores and past session comparison
- `computeSessionAverage(sessionId)` — aggregate all scores across all rounds

- [ ] **Step 4: Run tests**

Run: `cd ~/Desktop/hermes/plugin && npx vitest run src/interview/__tests__/evaluator.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 5: Commit**

```bash
git add plugin/src/interview/evaluator.ts plugin/src/interview/__tests__/evaluator.test.ts
git commit -m "feat: add Evaluator module with 7-dimension scoring and session debrief"
```

---

## Chunk 3: Performance Layer + Tools + Skills + Workspace

### Task 6: Tracker and DrillManager modules

**Files:**
- Create: `plugin/src/performance/tracker.ts`
- Create: `plugin/src/performance/drills.ts`
- Create: `plugin/src/performance/__tests__/tracker.test.ts`
- Create: `plugin/src/performance/__tests__/drills.test.ts`

- [ ] **Step 1: Write failing tracker tests** — 3 tests:
1. Return session history with scores
2. Return dimension trend (chronological scores, trend direction)
3. Handle empty history gracefully

- [ ] **Step 2: Implement Tracker** — `getHistory(limit?)`, `getDimensionTrend(dimension)`

- [ ] **Step 3: Run tracker tests**

Expected: PASS — 3 tests

- [ ] **Step 4: Write failing drills tests** — 4 tests:
1. Build drill generation prompt highlighting weak dimensions (score <= 3)
2. Apply drills from JSON, create Drill records
3. List drills grouped by dimension
4. Complete a drill (status -> practiced)

- [ ] **Step 5: Implement DrillManager** — `buildDrillPrompt(sessionId, roundId?)`, `applyDrills(sessionId, json)`, `listDrills(dimension?, status?)`, `completeDrill(drillId)`

- [ ] **Step 6: Run all performance tests**

Run: `cd ~/Desktop/hermes/plugin && npx vitest run src/performance/`
Expected: PASS — 7 tests

- [ ] **Step 7: Commit**

```bash
git add plugin/src/performance/
git commit -m "feat: add Tracker and DrillManager for performance analytics"
```

---

### Task 7: Tool registration — all 14 tools

**Files:**
- Create: `plugin/src/tools/jd-tools.ts`
- Create: `plugin/src/tools/session-tools.ts`
- Create: `plugin/src/tools/round-tools.ts`
- Create: `plugin/src/tools/eval-tools.ts`
- Create: `plugin/src/tools/tracking-tools.ts`
- Modify: `plugin/src/tools/register.ts`

- [ ] **Step 1: Create jd-tools.ts** — registers `hermes_jd_ingest` (params: text, title?, company?) and `hermes_jd_list`

- [ ] **Step 2: Create session-tools.ts** — registers `hermes_session_plan` (params: jd_id), `hermes_session_approve` (params: session_id, plan?), `hermes_session_status` (params: session_id?)

- [ ] **Step 3: Create round-tools.ts** — registers `hermes_round_start` (params: session_id?, round_number?), `hermes_round_answer` (params: round_id, answer, source?), `hermes_round_skip` (params: round_id)

- [ ] **Step 4: Create eval-tools.ts** — registers `hermes_round_evaluate` (params: round_id), `hermes_session_debrief` (params: session_id), `hermes_drill_generate` (params: session_id, round_id?)

- [ ] **Step 5: Create tracking-tools.ts** — registers `hermes_history` (params: limit?), `hermes_drill_list` (params: dimension?, status?), `hermes_drill_complete` (params: drill_id)

- [ ] **Step 6: Update register.ts** — instantiate HermesDB (path: ~/.hermes/hermes.db), Planner, Conductor, Evaluator, Tracker, DrillManager; call all 5 registration functions

- [ ] **Step 7: Verify build compiles**

Run: `cd ~/Desktop/hermes/plugin && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Run all tests**

Run: `cd ~/Desktop/hermes/plugin && npx vitest run`
Expected: All 33 tests pass (11 DB + 3 planner + 7 conductor + 5 evaluator + 3 tracker + 4 drills)

- [ ] **Step 9: Commit**

```bash
git add plugin/src/tools/
git commit -m "feat: register all 14 Hermes tools with central wiring"
```

---

### Task 8: Skills — 5 SKILL.md files

**Files:**
- Create: `plugin/src/skills/interview/SKILL.md`
- Create: `plugin/src/skills/round/SKILL.md`
- Create: `plugin/src/skills/evaluate/SKILL.md`
- Create: `plugin/src/skills/drills/SKILL.md`
- Create: `plugin/src/skills/progress/SKILL.md`

- [ ] **Step 1: Create /interview skill** — main entry: ingest JD, plan session, approve; subcommands: list, resume

- [ ] **Step 2: Create /round skill** — start (next or specific), skip, status; during active round: conduct questions and record answers

- [ ] **Step 3: Create /evaluate skill** — evaluate last completed round or full session debrief

- [ ] **Step 4: Create /drills skill** — list pending drills, generate new ones, mark done

- [ ] **Step 5: Create /progress skill** — show history trends, dimension deep-dive

- [ ] **Step 6: Commit**

```bash
git add plugin/src/skills/
git commit -m "feat: add 5 user-invocable skills for interview workflow"
```

---

### Task 9: Workspace files

**Files:**
- Create: `workspace/IDENTITY.md` — name: Hermes, tagline: Mock Interview Coach
- Create: `workspace/SOUL.md` — interviewer persona, coach mode, philosophy
- Create: `workspace/AGENTS.md` — tool usage instructions, core flow, voice handling
- Create: `workspace/USER.md` — template for user context (populated over time)

- [ ] **Step 1: Create IDENTITY.md**
- [ ] **Step 2: Create SOUL.md** — dual-mode persona (Interviewer Mode during rounds, Coach Mode during eval)
- [ ] **Step 3: Create AGENTS.md** — session start checklist, core flow (start interview, conduct round, complete session), all 14 tools listed with descriptions, voice message handling notes
- [ ] **Step 4: Create USER.md** — template with sections for target roles, seniority, strengths, weaknesses, preferences
- [ ] **Step 5: Commit**

```bash
git add workspace/
git commit -m "feat: add Hermes workspace files (SOUL, AGENTS, IDENTITY, USER)"
```

---

### Task 10: Install script + final verification

**Files:**
- Create: `install.sh`

- [ ] **Step 1: Create install.sh** — installs npm deps, runs tsc --noEmit, runs vitest, prints OpenClaw config instructions

- [ ] **Step 2: Make executable**: `chmod +x install.sh`

- [ ] **Step 3: Run full test suite**

Run: `cd ~/Desktop/hermes/plugin && npx vitest run`
Expected: All 33 tests pass across 6 suites

- [ ] **Step 4: Verify build**

Run: `cd ~/Desktop/hermes/plugin && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add install.sh
git commit -m "feat: add install script and finalize Hermes agent"
```
