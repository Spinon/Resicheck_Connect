// Normal image Edge composition, preparation only: no deployment or network.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import ts from '../../../apps/mobile/node_modules/typescript/lib/typescript.js';
import {createImageS3Read} from '../../../packages/chat/src/image-s3-read.ts';
const sha=value=>createHash('sha256').update(value).digest('hex');
const sources=new Map();
async function visit(name){
 name=path.posix.normalize(name);assert(!name.startsWith('../')&&/\.(ts|mjs)$/.test(name));if(sources.has(name))return;
 const content=await fs.readFile(name,'utf8');assert(!/\bcreateRequire\s*\(/.test(content));sources.set(name,content);
 const ast=ts.createSourceFile(name,content,ts.ScriptTarget.Latest,true,name.endsWith('.ts')?ts.ScriptKind.TS:ts.ScriptKind.JS);
 assert.equal(ast.parseDiagnostics.length,0,'Parse error in '+name);
 for(const node of ast.statements){
  if((ts.isImportDeclaration(node)&&node.importClause?.isTypeOnly)||(ts.isExportDeclaration(node)&&node.isTypeOnly))continue;
  if(!(ts.isImportDeclaration(node)||ts.isExportDeclaration(node))||!node.moduleSpecifier||!ts.isStringLiteral(node.moduleSpecifier))continue;
  const spec=node.moduleSpecifier.text;if(spec.startsWith('node:'))continue;assert(spec.startsWith('.'));await visit(path.posix.join(path.posix.dirname(name),spec));
 }
}
await visit('packages/chat/src/image-edge-handler.ts');
// Existing approved PUBLIC config only; no CLI/admin/secret lookup or new key.
const publicConfig=JSON.parse(await fs.readFile('output/audio-edge-public-config.json','utf8'));
assert.equal(publicConfig.projectRef,'ibdlvlwdzmsrbqadrudb');
const publicAnonKey=publicConfig.publicAnonKey;
createImageS3Read({enabled:true,publicAnonKey,now:Date.now,fetch:async()=>{throw Error('Preparation cannot fetch');}});
const graph=sha(JSON.stringify([...sources].sort(([a],[b])=>a.localeCompare(b)).map(([name,content])=>({name,sha256:sha(content)}))));
const output='output/image-normal-service-edge/'+graph;
await fs.mkdir(output,{recursive:true});const variants={};
for(const enabled of[false,true]){
 const entry=`import {createImageEdgeHandler} from './packages/chat/src/image-edge-handler.ts';
const ENABLED=${enabled},BUILD=${JSON.stringify(graph)};
const runtime=createImageEdgeHandler({enabled:ENABLED,projectUrl:Deno.env.get('SUPABASE_URL'),publishableKeys:Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'),publicS3AnonKey:${enabled?JSON.stringify(publicAnonKey):'undefined'},fetch:globalThis.fetch.bind(globalThis),now:Date.now,observe:code=>console.warn(code)});
Deno.serve(async req=>{const response=await runtime(req);response.headers.set('x-connect-image-build',BUILD);response.headers.set('x-connect-image-runtime',ENABLED?'normal-user-rpc-private-s3':'off');return response;});
`;
 assert.equal(ts.createSourceFile('index.ts',entry,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);
 const files=[...sources].map(([name,content])=>({name,content}));files.push({name:'index.ts',content:entry},{name:'deno.json',content:JSON.stringify({nodeModulesDir:'none',compilerOptions:{allowJs:true,checkJs:false,strict:true}})});
 const request={link_id:'link_6a20ace5e31c8191944639393ceb4c1f',project_id:'ibdlvlwdzmsrbqadrudb',name:'connect-image-transfer-v1',entrypoint_path:'index.ts',import_map_path:'deno.json',verify_jwt:true,files:files.sort((a,b)=>a.name.localeCompare(b.name))};
 const encoded=JSON.stringify(request,null,2)+'\n',file=output+'/'+(enabled?'ACTIVE.UNDEPLOYED':'OFF.UNDEPLOYED')+'.json';
 await fs.writeFile(file,encoded);variants[enabled?'active':'off']={file,sha256:sha(encoded),files:files.length,enabled};
}
const receipt={state:'prepared-normal-edge-entries-not-deployed',graphSha256:graph,variants,legacyPublicAnonBinding:'Explicit existing approved public legacy anon binding from output/audio-edge-public-config.json; active artifact only, never a secret/admin key or ambient name assumption',publishableBinding:'SUPABASE_PUBLISHABLE_KEYS.default',adminKeyRead:false,customSecretsAdded:0,fixturesIncluded:false,smokeRun:false,networkCalls:0,deployed:false,requiresOperationalApproval:true,fix:'Explicit S3 anon binding and fail-closed startup boundary; same user JWT/RLS/SigV4 route',hostedChanged:false};
await fs.writeFile('supabase/candidates/image-message/normal-service-edge-preparation.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
