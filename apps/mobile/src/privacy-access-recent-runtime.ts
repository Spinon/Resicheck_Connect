import type {NativePrivacyPort} from './native-privacy-binding.ts';
import {createSyntheticAccessRecentJourney} from '../previews/synthetic-access-recent-journey.ts';
import {createPrivacyAccessRecentRuntimeCore} from './privacy-access-recent-core.ts';
export {createPrivacyAccessRecentRuntimeCore,type PrivacyAccessRecentView} from './privacy-access-recent-core.ts';
type Foreground=Parameters<typeof createPrivacyAccessRecentRuntimeCore>[0]['foreground'];

// Legacy typed wrapper preserves its synthetic factory and complete inferred app.
export function createPrivacyAccessRecentRuntime(deps:Readonly<{json:(value:unknown,status?:number)=>Response;createId:()=>string;native:NativePrivacyPort;foreground:Foreground;createApp?:typeof createSyntheticAccessRecentJourney}>){
  const {json,createId,native,foreground,createApp=createSyntheticAccessRecentJourney}=deps;
  return createPrivacyAccessRecentRuntimeCore({createApp:()=>createApp(json,createId),native,foreground});
}
