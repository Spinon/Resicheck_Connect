import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{createRequire}from'node:module';
const require=createRequire(new URL('../package.json',import.meta.url)),React=require('react'),ts=require('typescript');
function load(file,{platform='android',allowed=()=>true,append=''}={}){
 const hooks={...React,memo:fn=>fn,useCallback:fn=>fn,useSyncExternalStore:(_s,get)=>get(),useEffect:()=>{},useState:v=>[typeof v==='function'?v():v,()=>{}],useRef:v=>({current:v})};
 const rn={useWindowDimensions:()=>({width:390,height:844,fontScale:1,scale:1}),Platform:{OS:platform},View:'View',Text:'Text',Pressable:'Pressable',ActivityIndicator:'ActivityIndicator',StyleSheet:{create:v=>v}};
 const src=fs.readFileSync(new URL('../src/'+file,import.meta.url),'utf8')+'\n'+append;
 const code=ts.transpileModule(src,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,m={exports:{}};
 new Function('require','module','exports',code)(name=>{
  if(name==='react')return hooks;if(name==='react-native')return rn;if(name==='react/jsx-runtime')return require(name);
  if(name.includes('MediaPrivacy'))return{useMediaPrivacy:()=>({allowed,view:{mediaVisible:true}}),MediaPrivacySurface:'MediaPrivacySurface'};
  if(name.includes('PrivateImageMessage'))return{PrivateImageMessage:'PrivateImageMessage'};
  if(name.includes('LocalImagePreviewView'))return{LocalImagePreviewView:'LocalImagePreviewView'};
  if(name.includes('message-calendar'))return{messageCalendar:()=>null};
  if(name.includes('ConnectIcon'))return{ConnectIcon:'ConnectIcon'};
  return{};
 },m,m.exports);return m.exports;
}
function nodes(node){if(node==null||typeof node==='boolean')return[];if(typeof node!=='object')return[node];return[node,...React.Children.toArray(node.props?.children).flatMap(nodes)];}
test('image bubble labels remain identifiable in selection and forward the actual message selection without reading media',()=>{
 for(const platform of['android','web']){
  const ui=load('RecentConversationView.tsx',{platform,append:'export{MessageBubble as TestMessageBubble};'}),selected=[],item={id:'00520000-0000-4000-8000-000000000001',kind:'image',sequence:1,text:'',senderRole:'patient',acceptedAt:0};
  let mediaReads=0;const props={item,own:true,onSelect:id=>selected.push(id),imageMessageFactory:()=>{mediaReads++;throw Error('Not a selection operation');}};
  const bubble=ui.TestMessageBubble(props);assert.match(bubble.props.accessibilityLabel,/Imagem/);bubble.props.onLongPress();
  const child=nodes(bubble).find(n=>n?.type==='PrivateImageMessage');assert(child);child.props.onSelect();assert.deepEqual(selected,[item.id,item.id]);assert.equal(mediaReads,0);
  const active=ui.TestMessageBubble({...props,selectionActive:true,selected:true});assert.equal(active.props.accessibilityRole,'checkbox');assert.equal(active.props.accessibilityState.checked,true);assert(nodes(active).includes('Imagem'));assert(!nodes(active).some(n=>n?.type==='PrivateImageMessage'));
  const removed=ui.TestMessageBubble({...props,selectionActive:true,item:{...item,removedScope:'all',text:'SYNTHETIC ORIGINAL MUST STAY HIDDEN'}});assert(nodes(removed).includes('Mensagem removida'));assert(!nodes(removed).includes('SYNTHETIC ORIGINAL MUST STAY HIDDEN'));assert.equal(mediaReads,0);
 }
});
test('image open/retry/loading and ready controls preserve distinct selection and load operations',async()=>{
 const ui=load('PrivateImageMessage.tsx',{append:'export{ImageBody as TestImageBody};'});let picks=0,reads=0,phase='idle';
 const reader={subscribe:()=>()=>{},snapshot:()=>({phase,preview:phase==='ready'?{uri:'synthetic-preview://owned',width:16,height:16,mime:'image/png'}:null}),load:()=>{reads++;return Promise.resolve(false);}};
 const render=()=>ui.TestImageBody({reader,onSelect:()=>picks++});
 for(const value of['idle','failed']){phase=value;const button=nodes(render()).find(n=>n?.type==='Pressable');assert(button);button.props.onLongPress();assert.equal(reads,value==='idle'?0:1);button.props.onPress();assert.equal(button.props.delayLongPress,350);assert.deepEqual(button.props.accessibilityActions,[{name:'select',label:'Selecionar mensagem de imagem'}]);}
 assert.equal(reads,2);phase='loading';const loading=render();loading.props.onAccessibilityAction({nativeEvent:{actionName:'select'}});assert.equal(reads,2);assert.equal(picks,3);
 phase='ready';const ready=render();assert.equal(ready.type,'LocalImagePreviewView');ready.props.onSelect();assert.equal(picks,4);assert.equal(reads,2);
 phase='idle';reader.load=()=>{throw Error('synthetic unavailable reader');};assert.doesNotThrow(()=>nodes(render()).find(n=>n?.type==='Pressable').props.onPress());reader.load=()=>Promise.reject(Error('synthetic closed reader'));nodes(render()).find(n=>n?.type==='Pressable').props.onPress();await new Promise(r=>setImmediate(r));
});
test('thumbnail action keeps tap-to-expand and only offers private, enabled selection when configured',()=>{
 let allowed=true,opens=0,picks=0;const ui=load('LocalImagePreviewView.tsx',{allowed:()=>allowed});
 const base={label:'Ampliar imagem recebida',onPress:()=>opens++,onSelect:()=>picks++},button=ui.ImageAction(base);
 button.props.onLongPress();button.props.onAccessibilityAction({nativeEvent:{actionName:'select'}});assert.equal(picks,2);assert.equal(opens,0);button.props.onPress();assert.equal(opens,1);
 allowed=false;button.props.onPress();button.props.onLongPress();button.props.onAccessibilityAction({nativeEvent:{actionName:'select'}});assert.equal(picks,2);assert.equal(opens,1);
 allowed=true;const disabled=ui.ImageAction({...base,disabled:true});disabled.props.onPress();disabled.props.onLongPress();disabled.props.onAccessibilityAction({nativeEvent:{actionName:'select'}});assert.equal(picks,2);assert.equal(opens,1);
 const ordinary=ui.ImageAction({label:'Mais zoom',onPress:()=>opens++});assert.equal(ordinary.props.onLongPress,undefined);assert.equal(ordinary.props.accessibilityActions,undefined);ordinary.props.onPress();assert.equal(opens,2);
});
