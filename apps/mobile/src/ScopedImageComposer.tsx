import React,{useEffect,useMemo,useState,useSyncExternalStore}from'react';
import{Text,View}from'react-native';
import type{createScopedImageReviewHost}from'./scoped-image-review-host.ts';
import type{createRecentConversationHost}from'./recent-conversation-host.ts';
import{ImageReviewComposer}from'./ImageReviewComposer.tsx';
import type{ReviewedImageSender}from'./scoped-reviewed-image.ts';
import type{createImageReview}from'./image-review.ts';
import{AudioButton,type ComposerSlots}from'./AudioControls.tsx';
type SenderFactory=(review:ReturnType<typeof createImageReview>)=>ReviewedImageSender;
/** OFF by omission. Factory owns a captured authenticated image transport. */
export function ScopedImageComposer({images,conversation,controls,renderText,createSender}:{createSender?:SenderFactory;images:ReturnType<typeof createScopedImageReviewHost>;conversation:ReturnType<typeof createRecentConversationHost>;controls:ComposerSlots;renderText?:(action:React.ReactNode)=>React.ReactNode}){
 const bound=useMemo(()=>images.bind(conversation),[images,conversation]);const v=useSyncExternalStore(bound.subscribe,bound.snapshot,bound.snapshot);
 const text=(action?:React.ReactNode)=>renderText?renderText(action):<>{controls.before}<View style={{flexDirection:'row',alignItems:'flex-end',gap:8}}>{controls.input}{action}{controls.send}</View>{controls.after}</>;
 if(v.blocked)return <>{text()}<Text accessibilityRole="alert">Não foi possível preparar as imagens. O texto continua disponível.</Text><AudioButton icon="refresh" label="Tentar imagens novamente" onPress={()=>{bound.retryCleanup();}}/></>;
 if(!v.available||!v.review)return text();
 return <Delivery review={v.review} createSender={createSender} disabled={controls.disabled} pick={bound.pick} renderText={text}/>;
}

function Delivery({review,createSender,...rest}:{review:ReturnType<typeof createImageReview>;createSender?:SenderFactory;disabled:boolean;pick:()=>Promise<boolean>;renderText:(action:React.ReactNode)=>React.ReactNode}){
 const v=useSyncExternalStore(review.subscribe,review.snapshot,review.snapshot),preview=v.preview;
 const [owned,setOwned]=useState<Readonly<{preview:typeof preview;factory:SenderFactory;sender:ReviewedImageSender}>|null>(null);
 useEffect(()=>{if(!preview||!createSender)return;let sender:ReviewedImageSender;try{sender=createSender(review);}catch{return;}setOwned({preview,factory:createSender,sender});return()=>sender.close();},[review,preview,createSender]);
 const sender=owned?.preview===preview&&owned?.factory===createSender?owned.sender:undefined;
 return <ImageReviewComposer review={review} sender={sender} {...rest}/>;
}
