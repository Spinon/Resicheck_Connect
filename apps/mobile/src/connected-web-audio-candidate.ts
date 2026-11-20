import {createConnectedCompanyRegistry} from './connected-company-registry.ts';
import {createWebConversationAudioUi} from './web-conversation-audio-ui.ts';
type AppOptions = Omit<Parameters<typeof createConnectedCompanyRegistry>[0], 'audioPlayback' | 'audioHistory'>;
/** Unregistered, code-only composition. No URL/storage/environment activation switch.
 * OFF remains the default. A scoped candidate still needs backend authorization; it is not proof of readiness. */
export function createConnectedWebAudioCandidate(input: AppOptions & Readonly<{foreground: () => boolean; mode?: 'off' | 'scoped-candidate'}>) {
 const {foreground, mode = 'off', ...deps} = input;
 if (typeof foreground !== 'function' || !['off', 'scoped-candidate'].includes(mode)) throw Error('Audio unavailable');
 if (Object.hasOwn(input, 'audioPlayback') || Object.hasOwn(input, 'audioHistory')) throw Error('Audio unavailable');
 const digest = async (bytes: Uint8Array) => {
  if (!(bytes instanceof Uint8Array) || bytes.length < 1 || bytes.length > 1048576 || !globalThis.crypto?.subtle) throw Error('Audio unavailable');
  const copy = Uint8Array.from(bytes);
  try {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', copy.buffer)), n => n.toString(16).padStart(2, '0')).join('');}
  finally {copy.fill(0);}
 };
 return createConnectedCompanyRegistry({...deps, audioHistory: 'placeholder-only', ...(mode === 'scoped-candidate' ? {audioPlayback: {protocol: 'scoped-v1' as const, digest, createUi: options => createWebConversationAudioUi(options, foreground)}} : {})});
}
