import type { PluginAPI } from './types.js';
import { registerAllTools } from './tools/register.js';

export const id = 'hermes';
export const name = 'Hermes - Mock Interview Coach';

export function register(api: PluginAPI) {
  registerAllTools(api);
  console.log('[Hermes] Plugin loaded successfully');
}
