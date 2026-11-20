// Metadata-only classification. Does not read referenced artifacts, run npm,
 // clone, tests, builders, a checker, Git mutations or remote operations.
import fs from'node:fs/promises';
import path from'node:path';
import{createHash}from'node:crypto';
import assert from'node:assert/strict';
const input='output/checkpoint33-export-2026-11-20T12-47-24-849Z/historical-reference-provenance.json';
const boardPath='output/checkpoint33-export-2026-11-20T12-47-24-849Z/source/project-board.json';
const output='output/checkpoint33-reference-classification/result.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const raw=await fs.readFile(input),boardRaw=await fs.readFile(boardPath);
const provenance=JSON.parse(raw),board=JSON.parse(boardRaw),items=new Map(board.items.map(x=>[x.id,x]));
assert.equal(provenance.references.length,4349);
const normalize=p=>path.posix.normalize(p.replaceAll('\\','/').replace(/^\.\//,''));
const sourceScripts=[
'apps/mobile/scripts/prepare-connected-basic-text.mjs',
'apps/mobile/scripts/build-connected-basic-text-android.ps1',
'apps/mobile/scripts/inspect-connected-basic-text-apk.ps1',
'apps/mobile/scripts/keyboard-receipts32-android.init.gradle',
'apps/mobile/candidates/messaging33/expo-config.mjs',
'tools/delivery/prepare-messaging33.mjs'];
const scriptMetadata=[];
for(const p of sourceScripts){const bytes=await fs.readFile(p);scriptMetadata.push({path:p,sha256:sha(bytes),bytes:bytes.length});}
const explicitPrerequisites=new Map([
['output/managed-registration-online/public-config.json',{kind:'public-config-external-input',basis:'prepare-connected-basic-text.mjs explicitly reads project/publishable config; candidate33 factory accepts a public config parameter. Keep a reviewed example/input contract, never copy an issued JWT or privileged key.'}],
['output/managed-registration-online/public-key-receipt.json',{kind:'public-key-admission-external-metadata',basis:'Historical23 preparer checks official source/key hash/project from this admission metadata. It is not application code or a functional test proof; candidate33 must parameterize/adapt admission, not archive all proofs.'}]
]);
function origin(p){
 if(p.startsWith('output/'))return'generated-output';
 if(p.startsWith('docs/'))return'documentation';
 if(p.startsWith('apps/mobile/'))return'mobile-project';
 if(p.startsWith('packages/'))return'shared-packages';
 if(p.startsWith('supabase/candidates/'))return'supabase-candidates';
 if(p.startsWith('supabase/deployment/'))return'supabase-deployment-records-and-sources';
 if(p.startsWith('supabase/runtime/'))return'supabase-runtime';
 if(p.startsWith('supabase/tests/'))return'supabase-local-tests';
 if(p.startsWith('supabase/migrations/'))return'supabase-migrations';
 if(p.startsWith('scripts/')||p.startsWith('tools/'))return'tools-and-scripts';
 return'other-project-path';
}
function purpose(p){
 const n=path.posix.basename(p);
 if(explicitPrerequisites.has(p))return explicitPrerequisites.get(p).kind;
 if(/\.(?:jks|keystore|p12|pem|dpapi|key)$|(^|\/)\.env(?:\.|$)|credential-private|session-private/i.test(p))return'private-custody-reference-never-checkpoint';
 if(p.startsWith('apps/mobile/android/')||p.startsWith('apps/mobile/ios/'))return'generated-native-input-or-result';
 if(p.startsWith('output/'))return'generated-run-artifact-or-capture';
 if(p.startsWith('docs/')||/\.(?:md|docx|pdf)$/.test(p))return'documentation-or-report';
 if(/\/tests?\/|\/src\/testing\/|\/fixtures?\//.test(p)||/\.(?:test|integration)\.[cm]?[jt]sx?$/.test(p)||/^test[-_]/.test(n)||/\/tools\/web-e2e\//.test('/'+p))return'test-source-or-fixture-review';
 if(/\.(?:REQUEST|READONLY|COMPILED|UNAPPLIED)\./i.test(n)||/\.(?:READONLY|UNAPPLIED|COMPILED)\.sql$/i.test(n))return'generated-operational-request-or-readback';
 if(/\.(?:ts|tsx|js|mjs|cjs|py|ps1|gradle|kt|java|xml|sql|template|txt)$/.test(n))return'source-definition-not-selected-review';
 if(/^(?:package(?:-lock)?|tsconfig[^/]*|build-spec|app|linux-image\.lock|CONFIG\.example)\.json$/.test(n))return'source-config-or-pin-review';
 if(/\.(?:png|jpe?g|webp|svg|mp4|m4a|wav|webm|apk|aab|zip|gz|tar|log)$/.test(n))return'asset-binary-capture-or-log-review';
 if(n.endsWith('.json'))return'structured-evidence-or-state-record';
 return'unclassified-manual-review';
}
const rows=provenance.references.map((r,i)=>{
 assert(items.has(r.item));const item=items.get(r.item),p=normalize(r.path);
 const valid=!p.startsWith('../')&&!path.posix.isAbsolute(p)&&!/^[A-Za-z]:/.test(p);
 return{occurrence:i+1,item:r.item,itemStatus:item.status,currentFocus:r.item===board.currentFocus,deliveryItem:r.item==='APP-006',
 originalPath:r.path,normalizedPath:p,pathValid:valid,origin:origin(p),purpose:purpose(p),
 recordedSha256:r.sha256??null,recordedBytes:r.bytes??null,referenceStatus:r.status,
 sourceExistenceNotRechecked:true,functionalResultNotRevalidated:true};
});
assert(rows.every(x=>x.pathValid));
function aggregate(key){
 const groups=new Map();
 for(const r of rows){const k=key(r);let g=groups.get(k);if(!g)groups.set(k,g={occurrences:0,paths:new Set(),items:new Set()});g.occurrences++;g.paths.add(r.normalizedPath);g.items.add(r.item);}
 return Object.fromEntries([...groups].sort((a,b)=>b[1].occurrences-a[1].occurrences||a[0].localeCompare(b[0])).map(([k,g])=>[k,{occurrences:g.occurrences,uniquePaths:g.paths.size,itemCount:g.items.size,examplePaths:[...g.paths].slice(0,4)}]));
}
const uniquePaths=new Set(rows.map(x=>x.normalizedPath)),originalPaths=new Set(rows.map(x=>x.originalPath));
const byItem=Object.fromEntries([...new Set(rows.map(x=>x.item))].sort().map(id=>{
 const group=rows.filter(x=>x.item===id),item=items.get(id);return[id,{status:item.status,currentFocus:id===board.currentFocus,deliveryItem:id==='APP-006',occurrences:group.length,uniquePaths:new Set(group.map(x=>x.normalizedPath)).size,byPurpose:Object.fromEntries([...new Set(group.map(x=>x.purpose))].map(k=>[k,group.filter(x=>x.purpose===k).length]))}];
}));
const uniqueRecords=[...uniquePaths].sort().map(p=>{
 const group=rows.filter(x=>x.normalizedPath===p);return{path:p,origin:group[0].origin,purpose:group[0].purpose,occurrences:group.length,items:[...new Set(group.map(x=>x.item))].sort(),itemStatuses:[...new Set(group.map(x=>x.itemStatus))].sort(),currentFocus:group.some(x=>x.currentFocus),deliveryItem:group.some(x=>x.deliveryItem),recordedDigests:[...new Set(group.map(x=>x.recordedSha256).filter(Boolean))],valuesNotRead:true};
});
const result={
 schemaVersion:1,state:'classified-reference-metadata-only-no-evidence-imported',
 inputs:{provenance:{path:input,sha256:sha(raw)},board:{path:boardPath,sha256:sha(boardRaw),updatedAt:board.updatedAt,currentFocus:board.currentFocus},analyzedScripts:scriptMetadata},
 counts:{occurrences:rows.length,originalUniquePaths:originalPaths.size,normalizedUniquePaths:uniquePaths.size,duplicateOccurrences:rows.length-uniquePaths.size,backslashOccurrences:rows.filter(x=>x.originalPath.includes('\\')).length,normalizedCollisions:originalPaths.size-uniquePaths.size,itemsWithReferences:Object.keys(byItem).length},
 byOrigin:aggregate(r=>r.origin),byPurpose:aggregate(r=>r.purpose),byItemStatus:aggregate(r=>r.itemStatus),byStatusAndPurpose:aggregate(r=>r.itemStatus+' / '+r.purpose),
 byCurrentRelation:aggregate(r=>r.currentFocus?'current-focus-APP-052':r.deliveryItem?'delivery-APP-006':r.itemStatus==='done'?'closed-item-history':r.itemStatus==='backlog'?'future-backlog-item':'other-open-item'),
 byItem,uniquePaths:uniqueRecords,
 buildAndResume:{
 explicitReferencedInputs:[...explicitPrerequisites].map(([p,d])=>({path:p,...d,referenceOccurrences:rows.filter(x=>x.normalizedPath===p).length,uniqueItems:[...new Set(rows.filter(x=>x.normalizedPath===p).map(x=>x.item))]})),
 prerequisitesNotProofArchive:[
 {kind:'public-config',scope:'Public project/publishable key supplied to normal factory via reviewed input/example; no live token or administrative key in checkpoint.',mustVersion:'Contract/example and source; not the whole historical public-key receipt corpus.'},
 {kind:'signing',scope:'Existing signing key remains in approved private custody, outside Git. Certificate digest is public metadata. Signature cannot be restored by copying test proofs.',mustVersion:'Builder/signature admission contract; never signing key.'},
 {kind:'native-generation',scope:'apps/mobile/android and messaging33-generated are derived inputs; regenerate from sources/templates/config and official locked dependencies. Existing SDK/JDK/NDK/cache availability is an external toolchain prerequisite.',mustVersion:'Native sources, lockfiles, templates, build/inspection instructions; not old APK/frozen run trees.'},
 {kind:'version-contract',scope:'Current npm builder/preparer/inspector historical23 and init32 are not automatically candidate33. Root must adapt/version-pin new candidate inputs before actual build.',mustVersion:'33 source/config/inspection delta; old successful reports do not prove the new artifact.'},
 {kind:'history-references',scope:'Canonical checker currently requires every evidence path. Path/digest provenance is not functional proof; do not create dummy files or import archive solely to pass.',mustVersion:'A separately reviewed archive-reference contract if chosen; keep current evidence checks honest.'}
 ],
 candidateReleaseReproducibilityProven:false,
 rootOwnsOnlyDryRunNpmCloneBuilders:true
 },
 limits:[
 'Classification reads only the immutable provenance/board metadata plus named source scripts; referenced artifact contents, credentials and sessions are not opened.',
 'Origins follow normalized repository path prefixes; purpose is explicit script use for two public build inputs, otherwise transparent filename/path rules that require review before selecting additional source.',
 'An in_progress/current-focus reference is not proof of current build necessity; a done item can cite code still useful today.',
 'A recorded path/hash does not establish current availability, privacy suitability or passing behavior.',
 'Source definitions not selected may need separate review for future reprise, but do not justify copying evidence/session archives.',
 'No checker/board/curator changed; no npm, clone, app test, PostgreSQL, build, Git mutation or remote operation.'
 ],
 rows
};
await fs.mkdir(path.dirname(output),{recursive:true});
await fs.writeFile(output,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({state:result.state,...result.counts,byOrigin:Object.fromEntries(Object.entries(result.byOrigin).map(([k,v])=>[k,{occurrences:v.occurrences,uniquePaths:v.uniquePaths}])),byPurpose:Object.fromEntries(Object.entries(result.byPurpose).map(([k,v])=>[k,{occurrences:v.occurrences,uniquePaths:v.uniquePaths}])),byItemStatus:Object.fromEntries(Object.entries(result.byItemStatus).map(([k,v])=>[k,{occurrences:v.occurrences,uniquePaths:v.uniquePaths}])),byCurrentRelation:Object.fromEntries(Object.entries(result.byCurrentRelation).map(([k,v])=>[k,{occurrences:v.occurrences,uniquePaths:v.uniquePaths}])),output,outputSha256:sha(await fs.readFile(output))}));

