import type { PluginAPI } from '../types.js';
import { HermesDB } from '../db/database.js';
import { Planner } from '../interview/planner.js';
import { Conductor } from '../interview/conductor.js';
import { Evaluator } from '../interview/evaluator.js';
import { Tracker } from '../performance/tracker.js';
import { DrillManager } from '../performance/drills.js';
import { registerJdTools } from './jd-tools.js';
import { registerSessionTools } from './session-tools.js';
import { registerRoundTools } from './round-tools.js';
import { registerEvalTools } from './eval-tools.js';
import { registerTrackingTools } from './tracking-tools.js';
import path from 'path';
import os from 'os';

export function registerAllTools(api: PluginAPI): void {
  const vaultPath = path.join(os.homedir(), 'Documents', 'Obsidian Vault');
  const db = new HermesDB(vaultPath);

  const planner = new Planner(db);
  const conductor = new Conductor(db);
  const evaluator = new Evaluator(db);
  const tracker = new Tracker(db);
  const drillMgr = new DrillManager(db);

  registerJdTools(api, db);                              // 2 tools
  registerSessionTools(api, db, planner, conductor);     // 3 tools
  registerRoundTools(api, db, conductor);                // 3 tools
  registerEvalTools(api, db, evaluator, drillMgr);       // 3 tools
  registerTrackingTools(api, tracker, drillMgr);         // 3 tools
  // Total: 14 tools
}
