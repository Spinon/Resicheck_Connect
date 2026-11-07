#!/usr/bin/env node
// Pure queue observation helpers/static contract checks; no device calls here.
// Actual released-candidate Android journeys: android-queue-native.mjs.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const proposedStatusLabels=Object.freeze({
  pending:'Pendente · simulação',
  sending:'Confirmando na simulação…',
  accepted:'Confirmado na simulação · sem envio real',
  failed:'Não confirmado · simulação',
});

export function decodeXml(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi,(_,e)=>{
    if(e[0]==='#'){const n=e[1].toLowerCase()==='x'?parseInt(e.slice(2),16):parseInt(e.slice(1),10);return n>=0&&n<=0x10ffff?String.fromCodePoint(n):'\ufffd';}
    return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[e.toLowerCase()];
  });
}
export function parseSnapshot(xml) {
  assert(xml.includes('<hierarchy'),'Expected UIAutomator XML');
  return [...xml.matchAll(/<node\b[^>]*>/g)].map(m=>{
    const n=Object.fromEntries([...m[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map(a=>[a[1],decodeXml(a[2])]));
    const b=n.bounds?.match(/^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/);
    return {...n,rect:b?b.slice(1).map(Number):null};
  });
}
export function visible(n) {return !!n?.rect&&n.rect[2]>n.rect[0]&&n.rect[3]>n.rect[1]&&n['visible-to-user']!=='false';}
export function inside(child,parent) {return visible(child)&&visible(parent)&&child.rect[0]>=parent.rect[0]&&child.rect[1]>=parent.rect[1]&&child.rect[2]<=parent.rect[2]&&child.rect[3]<=parent.rect[3];}
export function resourceId(n) {return (n['resource-id']??'').replace(/^.*:id\//,'');}
export function exactText(n,text) {return n.text===text||n['content-desc']===text;}
export function rootBubbles(nodes,{prefix,excludePrefixes=[]}) {
  assert(prefix&&Array.isArray(excludePrefixes));
  return nodes.filter(n=>visible(n)&&resourceId(n).startsWith(prefix)&&!excludePrefixes.some(p=>resourceId(n).startsWith(p)));
}
export function assertSameBubble(before,after) {
  assert(before&&after,'Both observations required');
  assert.equal(resourceId(after),resourceId(before),'Retry/ack must keep the same observed bubble identity');
}
export function visibleBubblesWithText(nodes,contract,text) {
  return rootBubbles(nodes,contract).filter(b=>nodes.some(n=>exactText(n,text)&&inside(n,b)));
}
export function deliveryStates(nodes,text) {
  return nodes.filter(n=>resourceId(n).startsWith('delivery-state-')&&exactText(n,text)).map(n=>{
    const key=resourceId(n).slice('delivery-state-'.length);assert(key,'Missing delivery identity');
    return {key,state:n,bubbleId:'message-'+key,deliveryId:'delivery-'+key,retryId:'delivery-retry-'+key};
  });
}
export function coversRange(intervals,height,tolerance=2) {
  if(!(height>0)||!intervals.length)return false;
  const sorted=intervals.filter(r=>r.length===2&&Number.isFinite(r[0])&&Number.isFinite(r[1])&&r[0]>=0&&r[1]<=height&&r[1]>r[0]).sort((a,b)=>a[0]-b[0]);
  let end=0;
  for(const [a,b]of sorted){if(a>end+tolerance)return false;end=Math.max(end,b);}
  return end>=height-tolerance;
}
export function checkContract(c) {
  assert.equal(c.schemaVersion,1);assert.equal(c.ready,true,'Contract is pending; do not run Android');
  assert.equal(c.package,'com.resicheck.connect.demo');assert.equal(c.avd,'Connect_Demo_API36');
  assert(/^[a-f0-9]{64}$/.test(c.candidate?.sha256??''),'Candidate SHA-256 required');
  assert(typeof c.candidate.apkPath==='string'&&c.candidate.apkPath.length>0);
  assert(Number.isSafeInteger(c.candidate.versionCode)&&c.candidate.versionCode>0);
  assert(c.bubbles?.prefix&&Array.isArray(c.bubbles.excludePrefixes),'Actual root bubble IDs and exclusions required');
  assert(c.statusLabels&&['pending','sending','accepted','failed'].every(k=>typeof c.statusLabels[k]==='string'&&c.statusLabels[k]),'All observed status labels required');
  assert(c.selectors&&Object.values(c.selectors).every(s=>typeof s.id==='string'||typeof s.label==='string'),'Actual selectors required');
  assert(Array.isArray(c.journeys)&&c.journeys.length>0,'Concrete journeys pending');
  return c;
}
function selfTest() {
  const xml='<hierarchy><node resource-id="message-local-1" bounds="[0,0][200,200]"/><node resource-id="message-header-local-1" bounds="[5,5][190,30]"/><node text="QA_&#128105;&#127998;&#8205;&#9877;&#65039; &amp; ok" bounds="[5,40][190,100]"/><node resource-id="message-local-2" bounds="[0,210][200,400]"/><node text="other" bounds="[5,220][190,300]"/><node resource-id="message-local-hidden" bounds="[0,500][200,400]"/></hierarchy>';
  const ns=parseSnapshot(xml),cfg={prefix:'message-',excludePrefixes:['message-header-','message-footer-','message-time-']};
  assert.equal(rootBubbles(ns,cfg).length,2);
  assert.equal(visibleBubblesWithText(ns,cfg,'QA_👩🏾‍⚕️ & ok').length,1);
  assert.equal(visibleBubblesWithText(ns,cfg,'absent').length,0);
  assertSameBubble(ns[0],{...ns[0],rect:[0,5,200,205]});
  assert.throws(()=>assertSameBubble(ns[0],ns[3]));
  assert.throws(()=>checkContract({schemaVersion:1,ready:false}));
  assert.equal(decodeXml('&#x1f1e7;&#x1f1f7;'),'🇧🇷');
  const state=parseSnapshot('<hierarchy><node resource-id="delivery-state-opaque-queue-key" text="Não confirmado · simulação" bounds="[0,0][100,40]"/></hierarchy>');
  assert.deepEqual(deliveryStates(state,proposedStatusLabels.failed).map(n=>[n.bubbleId,n.retryId]),[['message-opaque-queue-key','delivery-retry-opaque-queue-key']]);
  assert.equal(deliveryStates(state,proposedStatusLabels.accepted).length,0);
  assert(coversRange([[0,100],[98,264]],264));
  assert(!coversRange([[0,80],[100,264]],264));
  assert(!coversRange([],264));
  console.log(JSON.stringify({status:'static-self-test-passed',checks:12,androidExecuted:false}));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--self-test') selfTest();
  else if(args.length===2&&args[0]==='--check-contract') {
    const raw=readFileSync(args[1]);checkContract(JSON.parse(raw));console.log(JSON.stringify({status:'contract-valid',sha256:createHash('sha256').update(raw).digest('hex'),androidExecuted:false}));
  } else {
    // Bind journeys only after the actual UI contract/candidate arrives.
    // Fail before device discovery, SDK invocation, installation or settings change.
    console.error('Static helper only: --self-test / --check-contract PATH. Released-candidate Android runner: android-queue-native.mjs. No Android action performed.');
    process.exitCode=2;
  }
}
