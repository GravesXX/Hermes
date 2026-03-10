import type { PluginAPI } from '../types.js';
import { Tracker } from '../performance/tracker.js';
import { DrillManager } from '../performance/drills.js';
import { text } from './helpers.js';

export function registerTrackingTools(api: PluginAPI, tracker: Tracker, drillMgr: DrillManager): void {
  api.registerTool({
    name: 'hermes_history',
    description: 'View completed interview session history with scores',
    parameters: {
      limit: {
        type: 'string',
        description: 'Maximum number of sessions to return (default: 10)',
      },
    },
    execute: async (_id, params) => {
      const limitRaw = params.limit as string | undefined;
      const limit = limitRaw !== undefined ? parseInt(limitRaw, 10) : 10;
      return text(tracker.getHistory(limit));
    },
  });

  api.registerTool({
    name: 'hermes_drill_list',
    description: 'List practice drills, optionally filtered by dimension or status',
    parameters: {
      dimension: {
        type: 'string',
        description: 'Filter drills by dimension (e.g. "star_structure", "depth")',
      },
      status: {
        type: 'string',
        description: 'Filter drills by status',
        enum: ['pending', 'practiced'],
      },
    },
    execute: async (_id, params) => {
      const dimension = params.dimension as string | undefined;
      const status = params.status as string | undefined;
      return text(drillMgr.listDrills(dimension, status));
    },
  });

  api.registerTool({
    name: 'hermes_drill_complete',
    description: 'Mark a practice drill as practiced',
    parameters: {
      drill_id: {
        type: 'string',
        description: 'ID of the drill to mark as practiced',
        required: true,
      },
    },
    execute: async (_id, params) => {
      const drillId = params.drill_id as string;
      return text(drillMgr.completeDrill(drillId));
    },
  });
}
