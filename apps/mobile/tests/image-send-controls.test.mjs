import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{createRequire}from'node:module';import{imageSendPresentation}from'../src/image-send-presentation.ts';
const require=createRequire(new URL('../package.json',import.meta.url)),React=require('react'),ts=require('typescript');
/** Component contract fixture only; not an Android runtime/browser render proof. */
function load(platform){let slot=0;const states=[],hooks={...React,useEffect:()=>{},useSyncExternalStore:(_s,get)=>get(),useState:v=>{const i=slot++;if(!(i in states))states[i]=typeof v==='function'?v():v;return[states[i],next=>{states[i]=next;}];}},rn={Platform:{OS:platform},View:'View',Text:'Text',ScrollView:'ScrollView',ActivityIndicator:'ActivityIndicator',Keyboard:{dismiss(){}},StyleSheet:{create:v=>v},useWindowDimensions:()=>({width:1365,height:900})};const source=fs.readFileSync(new URL('../src/ImageReviewComposer.tsx',import.meta.url),'utf8'),m={exports:{}},code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(name=>{if(name==='react')return hooks;if(name==='react-native')return rn;if(name==='react/jsx-runtime')return require(name);if(name.includes('image-send-presentation'))return{imageSendPresentation};if(name.includes('ImageTransferProgress'))return{ImageTransferProgress:'ImageTransferProgress',ImageUploadRetry:'ImageUploadRetry'};if(name.includes('MediaWindow'))return{MediaWindow:'MediaWindow'};if(name.includes('MediaPrivacy'))return{MediaPrivacySurface:'MediaPrivacySurface'};if(name.includes('LocalImagePreviewView'))return{LocalImagePreviewView:'LocalImagePreviewView'};if(name.includes('AudioControls'))return{AudioButton:'AudioButton'};return{};},m,m.exports);return props=>{slot=0;return m.exports.ImageReviewComposer(props);};}
const nodes=n=>n==null||typeof n==='boolean'?[]:typeof n!=='object'?[n]:[n,...React.Children.toArray(n.props?.children).flatMap(nodes)],button=(v,label)=>nodes(v).find(n=>n?.type==='AudioButton'&&n.props.label===label);
for(const platform of['web','android'])test(platform+' inline image controls preserve draft and never claim cancellation after commit',()=>{const render=load(platform);let phase='waiting',confirmation=false,cancels=0,discards=0,checks=0,prepares=0,reason=null;const preview={mime:'image/jpeg',bytes:80000,mode:'optimized',uri:'owned:synthetic'},review={snapshot:()=>({phase:'ready',source:{name:'synthetic.png',mime:'image/png'},preview,canRead:true,originalReason:reason,notice:null}),subscribe:()=>()=>{},discard:()=>{discards++;},prepare:async()=>{prepares++;return true;},cancelPreparation:()=>false},sender={snapshot:()=>({phase,messageId:null,confirmationStarted:confirmation,canCancel:!confirmation&&phase!=='cancelled'}),subscribe:()=>()=>{},start:async()=>{},recover:async()=>{checks++;},cancel:()=>{cancels++;phase='cancelled';return'cancelled-before-send';}},props={review,sender,renderText:action=>React.createElement('Composer',null,action)};
let view=render(props);assert(button(view,'Cancelar imagem'));assert(!nodes(view).some(n=>n?.type==='MediaWindow'));assert(!button(view,'Preservar detalhes do original'));button(view,'Cancelar imagem').props.onPress();view=render(props);assert(button(view,'Revisar imagem preservada'));assert.equal(cancels,1);assert.equal(discards,0);button(view,'Revisar imagem preservada').props.onPress();assert.equal(prepares,1);
phase='inspection-paused';view=render(props);
assert(nodes(view).includes('Envio pausado'));
const retry=v=>nodes(v).find(n=>n?.type==='ImageUploadRetry');
assert(retry(view));
assert(!button(view,'Conferir envio da imagem'));
assert(!button(view,'Enviar imagem'));
phase='rejected';view=render(props);
assert.equal(button(view,'Enviar imagem').props.disabled,true);
assert(!button(view,'Conferir envio da imagem'));
for(const recoverable of ['inspection-unknown','upload-unknown','inspection-paused']){
 phase=recoverable;view=render(props);assert(!button(view,'Conferir envio da imagem'));assert(retry(view));}
retry(view).props.onPress();assert.equal(checks,1);
for(const other of ['review','waiting','uploading','checking','sending','uncertain','failed','rejected','sent','cancelled']){
 phase=other;view=render(props);assert(!retry(view));}

phase='uncertain';confirmation=true;view=render(props);assert(!button(view,'Cancelar imagem'));assert(!button(view,'Enviar imagem'));assert(button(view,'Conferir envio da imagem'));assert(!nodes(view).some(n=>n?.type==='MediaWindow'));assert(nodes(view).some(n=>n?.type==='Composer'));assert.equal(discards,0);
phase='review';confirmation=false;reason='resolution-loss';view=render(props);assert(button(view,'Preservar detalhes do original'));assert.equal(button(view,'Enviar imagem').props.disabled,false);reason=null;view=render(props);assert(!button(view,'Preservar detalhes do original'));
});

test('sender retry uses the progress circle as an accessible upload action',()=>{
 const source=fs.readFileSync(new URL('../src/ImageTransferProgress.tsx',import.meta.url),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const module={exports:{}};
 const native={View:'View',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator',StyleSheet:{create:s=>s}};
 new Function('require','module','exports',code)(name=>name==='react-native'?native:name.includes('ConnectIcon')?{ConnectIcon:'ConnectIcon'}:require(name),module,module.exports);
 let checks=0;
 const retry=module.exports.ImageUploadRetry({onPress:()=>checks++});
 const action=nodes(retry).find(n=>n?.type==='Pressable');
 const progress=module.exports.ImageTransferProgress({label:'Baixando imagem'});
 assert.equal(action.props.accessibilityRole,'button');
 assert.equal(action.props.accessibilityLabel,'Tentar novamente');
 assert.equal(nodes(retry).find(n=>n?.type==='ConnectIcon').props.name,'upload');
 assert.equal(action.props.style,nodes(progress).find(n=>n?.props?.accessibilityRole==='progressbar').props.style);
 assert(!nodes(progress).some(n=>n?.type==='Pressable'));
 action.props.onPress();assert.equal(checks,1);
});

test('pressing the paused image checks the acknowledged upload and commits it once', async () => {
 const {createScopedReviewedImage}=await import('../src/scoped-reviewed-image.ts');
 const id=n=>'27100000-0000-4000-8000-'+String(n).padStart(12,'0');
 const context={userId:id(1),companyId:id(2),conversationId:id(3),sessionKey:'local-fixture'};
 const preview={uri:'fixture:image',mime:'image/png',mode:'original',bytes:8,profile:null};
 const review={snapshot:()=>({phase:'ready',preview,canRead:true}),subscribe:()=>()=>{},read:async()=>new Uint8Array(8)};
 const calls=[],timers=new Map();
 const receipt=(c,state)=>({companyId:c.companyId,conversationId:c.conversationId,senderId:context.userId,
  clientUploadId:c.clientUploadId,sha256:c.sha256,byteLength:c.byteLength,attachmentId:id(4),state});
 let sequence=0;
 const sender=createScopedReviewedImage({enabled:true,context,review,current:()=>true,timeoutMs:500,inspectionTimeoutMs:7000,
  digest:async()=>'a'.repeat(64),createId:()=>'fixture-'+ ++sequence,
  schedule:(fn,ms)=>{timers.set(fn,ms);return ()=>timers.delete(fn);},
  transport:{active:()=>true,
   upload:async c=>{calls.push(['upload',c]);return receipt(c,'quarantined');},
   status:async c=>{calls.push(['status',c]);return receipt(c,'ready');},
   commit:async(kind,c)=>{calls.push([kind,c]);return {state:'accepted',receipt:{id:id(5),sequence:1,acceptedAt:1}};}
  }});
 try {
  await sender.start();
  const deadline=[...timers].find(([,ms])=>ms===7000);
  assert.ok(deadline);
  deadline[0]();
  assert.equal(sender.snapshot().phase,'inspection-paused');
  const render=()=>load('android')({review,sender,renderText:()=>null});
  const retry=nodes(render()).find(n=>n?.type==='ImageUploadRetry');
  assert.ok(retry);
  await Promise.all([retry.props.onPress(),retry.props.onPress()]);
  assert.equal(sender.snapshot().phase,'sent');
  assert.deepEqual(calls.map(([kind])=>kind),['upload','status','send']);
  assert.equal(calls[0][1],calls[1][1]);
  assert(!nodes(render()).some(n=>n?.type==='ImageUploadRetry'));
 } finally { sender.close(); }
});
