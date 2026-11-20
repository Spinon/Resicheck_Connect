/** Presentation/file ownership only. This capability grants no server or URI
 * access. Its predicate captures one immutable owner and must never follow a
 * later account, company or conversation. Demo and Recent can supply this port. */
export type ConversationMediaCapability=Readonly<{token:object;current:()=>boolean}>;
export type ConversationMediaScopePort=Readonly<{
 getSnapshot:()=>Readonly<{activeConversationId:string|null}>;
 captureConversationContext:(id:string)=>ConversationMediaCapability|null;
 subscribe:(listener:()=>void)=>()=>void;
}>;
