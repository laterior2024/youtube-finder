import type { Settings } from '../types';
import { normalizeCredential } from './credentials';

/** Migrate the old single key without persisting secrets in preferences. */
export function keySlots(settings: Pick<Settings, 'apiKey' | 'geminiKeys' | 'activeGeminiKey'>) {
  const source = Array.isArray(settings.geminiKeys) ? settings.geminiKeys : [settings.apiKey];
  const geminiKeys = Array.from({ length: 5 }, (_, i) => normalizeCredential(typeof source[i] === 'string' ? source[i] : ''));
  const activeGeminiKey = Number.isInteger(settings.activeGeminiKey) && settings.activeGeminiKey! >= 0 && settings.activeGeminiKey! < 5 ? settings.activeGeminiKey! : 0;
  return { geminiKeys, activeGeminiKey, apiKey: geminiKeys[activeGeminiKey] };
}
