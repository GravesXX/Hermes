import type { PluginAPI } from '../types.js';
import type { HermesDB } from '../db/database.js';
import { Evaluator } from '../interview/evaluator.js';
import { DrillManager } from '../performance/drills.js';
import { text } from './helpers.js';

export function registerEvalTools(
  api: PluginAPI,
  db: HermesDB,
  evaluator: Evaluator,
  drillMgr: DrillManager
): void {
  api.registerTool({
    name: 'hermes_round_evaluate',
    description: 'Return an evaluation prompt for the LLM to score a completed round on 7 dimensions',
    parameters: {
      type: 'object' as const,
      properties: {
        round_id: {
          type: 'string',
          description: 'ID of the completed round to evaluate',
        },
      },
      required: ['round_id'],
    },
    execute: async (_id, params) => {
      const roundId = params.round_id as string;

      const round = db.getRound(roundId);
      if (!round) {
        return text({ content: '', error: `Round ${roundId} not found.` });
      }

      if (round.status !== 'completed' && round.status !== 'scored') {
        return text({
          content: '',
          error: `Round is not completed (current status: ${round.status}). Complete the round before evaluating.`,
        });
      }

      const prompt = evaluator.buildEvaluationPrompt(roundId);
      return text({ content: prompt });
    },
  });

  api.registerTool({
    name: 'hermes_session_debrief',
    description: 'Return a debrief prompt for the LLM to generate an overall session assessment',
    parameters: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'ID of the session to debrief',
        },
      },
      required: ['session_id'],
    },
    execute: async (_id, params) => {
      const sessionId = params.session_id as string;
      const prompt = evaluator.buildDebriefPrompt(sessionId);
      return text({ content: prompt });
    },
  });

  api.registerTool({
    name: 'hermes_drill_generate',
    description: 'Return a drill generation prompt for the LLM to create practice exercises for weak dimensions',
    parameters: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'ID of the session to generate drills for',
        },
        round_id: {
          type: 'string',
          description: 'ID of a specific round to scope drills to (optional — defaults to all rounds in the session)',
        },
      },
      required: ['session_id'],
    },
    execute: async (_id, params) => {
      const sessionId = params.session_id as string;
      const roundId = params.round_id as string | undefined;
      const prompt = drillMgr.buildDrillPrompt(sessionId, roundId);
      return text({ content: prompt });
    },
  });
}
