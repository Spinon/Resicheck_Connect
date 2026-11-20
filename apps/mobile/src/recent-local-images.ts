import {createRecentMediaScope} from './recent-media-scope.ts';
import {createDemoImageSession,type DemoImagePort} from './demo-image-session.ts';
import {createMediaPresentation} from './media-presentation.ts';
import type {MediaAppState} from './media-visibility.ts';

/** Reuses local private-image ownership and presentation, never a text sender,
 * upload capability or server attachment. Each scope needs a dedicated port.
 * Caller drives native lifecycle on presentation.gate; no global listeners. */
export function createRecentLocalImages(recent:Parameters<typeof createRecentMediaScope>[0],createPort:(current:()=>boolean)=>DemoImagePort,initial:MediaAppState='unknown'){
 const scope=createRecentMediaScope(recent);
 let images:ReturnType<typeof createDemoImageSession>|null=null;
 try{
  images=createDemoImageSession(scope,createPort);
  const host=images,presentation=createMediaPresentation(scope,initial);let disposed=false;
  return Object.freeze({images:host,presentation,settled:host.settled,
   dispose(){if(disposed)return;disposed=true;scope.dispose();presentation.dispose();host.dispose();},
  });
 }catch{scope.dispose();images?.dispose();throw Error('Local images unavailable');}
}
