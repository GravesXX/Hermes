import type { PluginAPI } from '../types.js';
import type { HermesDB } from '../db/database.js';
import { Conductor } from '../interview/conductor.js';
import { text } from './helpers.js';

export function registerRoundTools(api: PluginAPI, db: HermesDB, conductor: Conductor): void {
  api.registerTool({
    name: 'hermes_round_start',
    description: 'Start a round in an interview session',
    parameters: {
      type: 'object' as const,
      properties: {
        session_id: {
          type: 'string',
          description: 'ID of the session (defaults to the active session if omitted)',
        },
        round_number: {
          type: 'string',
          description: 'Round number to start (defaults to the next pending round if omitted)',
        },
      },
    },
    execute: async (_id, params) => {
      let sessionId = params.session_id as string | undefined;

      if (!sessionId) {
        const active = db.getActiveSession();
        if (!active) {
          return text({ content: '', error: 'No active session found. Provide a session_id or start a new session.' });
        }
        sessionId = active.id;
      }

      const roundNumberRaw = params.round_number as string | undefined;
      const roundNumber = roundNumberRaw !== undefined ? parseInt(roundNumberRaw, 10) : undefined;

      return text(conductor.startRound(sessionId, roundNumber));
    },
  });

  api.registerTool({
    name: 'hermes_round_answer',
    description: 'Record the candidate\'s answer to the current question in a round',
    parameters: {
      type: 'object' as const,
      properties: {
        round_id: {
          type: 'string',
          description: 'ID of the round to record the answer in',
        },
        answer: {
          type: 'string',
          description: 'The candidate\'s answer text',
        },
        source: {
          type: 'string',
          description: 'Source of the answer',
          enum: ['text', 'voice_transcription'],
        },
      },
      required: ['round_id', 'answer'],
    },
    execute: async (_id, params) => {
      const roundId = params.round_id as string;
      const answer = params.answer as string;
      const source = (params.source as string | undefined) ?? 'text';
      return text(conductor.recordAnswer(roundId, answer, source));
    },
  });

  api.registerTool({
    name: 'hermes_round_skip',
    description: 'Skip a pending or active round in an interview session',
    parameters: {
      type: 'object' as const,
      properties: {
        round_id: {
          type: 'string',
          description: 'ID of the round to skip',
        },
      },
      required: ['round_id'],
    },
    execute: async (_id, params) => {
      const roundId = params.round_id as string;
      return text(conductor.skipRound(roundId));
    },
  });
}
