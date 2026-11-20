import{createConversationAudioUiCore}from './conversation-audio-ui-core.ts';
import{createExpoReceivedAudioPlayer}from './expo-received-audio-player.ts';
/** Native candidate delegates the existing scope/selection rules to the shared core. */
export function createConversationAudioUi(input:Parameters<typeof createConversationAudioUiCore>[0]){return createConversationAudioUiCore(input,createExpoReceivedAudioPlayer);}
