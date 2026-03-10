import type { PluginAPI } from '../types.js';
import type { HermesDB } from '../db/database.js';
import { text } from './helpers.js';

export function registerJdTools(api: PluginAPI, db: HermesDB): void {
  api.registerTool({
    name: 'hermes_jd_ingest',
    description: 'Ingest a job description to prepare for a mock interview session',
    parameters: {
      text: {
        type: 'string',
        description: 'The full text of the job description',
        required: true,
      },
      title: {
        type: 'string',
        description: 'Job title (e.g. "Senior Software Engineer")',
      },
      company: {
        type: 'string',
        description: 'Company name',
      },
    },
    execute: async (_id, params) => {
      const rawText = params.text as string;
      const title = (params.title as string | undefined) ?? 'Untitled Role';
      const company = params.company as string | undefined;

      const jd = db.createJobDescription(title, rawText, company);
      return text({
        content: `Job description ingested.\nID: ${jd.id}\nTitle: ${jd.title}${jd.company ? `\nCompany: ${jd.company}` : ''}\nCreated: ${jd.created_at}`,
      });
    },
  });

  api.registerTool({
    name: 'hermes_jd_list',
    description: 'List all ingested job descriptions',
    parameters: {},
    execute: async () => {
      const jds = db.getAllJobDescriptions();

      if (jds.length === 0) {
        return text({ content: 'No job descriptions ingested yet.' });
      }

      const lines = jds.map((jd, i) => {
        const company = jd.company ? ` @ ${jd.company}` : '';
        const seniority = jd.seniority_level ? ` [${jd.seniority_level}]` : '';
        return `${i + 1}. ${jd.title}${company}${seniority}\n   ID: ${jd.id}\n   Created: ${jd.created_at}`;
      });

      return text({ content: lines.join('\n\n') });
    },
  });
}
