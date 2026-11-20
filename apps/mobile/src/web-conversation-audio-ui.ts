import {createConversationAudioUiCore} from './conversation-audio-ui-core.ts';
import {createWebReceivedAudioPlayer} from './web-received-audio-player.ts';
/** Explicit web candidate. No Expo imports or IO until a permitted audio row is played. */
export function createWebConversationAudioUi(input: Parameters<typeof createConversationAudioUiCore>[0], foreground: () => boolean) {
 if (input.enabled === true && input.conversation.audioProtocol !== 'scoped-v1') throw Error('Audio unavailable');
 return createConversationAudioUiCore(input, () => createWebReceivedAudioPlayer({foreground}));
}
