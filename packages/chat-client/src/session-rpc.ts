import{authSessionMetadataAfterUserCheck,type VerifiedAuthSession}from './verified-auth-session.ts';
import{membershipLinkCommand,type MembershipLinkRpc}from './membership-secret-link.ts';
import {canonicalRemovalCommand,type MessageRemovalRpc,type MessageRemovalCommand} from './message-removal.ts';
import{createScopedAudioTransfer,type ReceivedAudioCache}from './scoped-audio-transfer.ts';
import{audioResolveCommand,type AudioResolveRpc}from './audio-message-resolver.ts';
import{audioMessageCommand,type AudioMessageRpc}from './audio-message-rpc.ts';
import{messagesReceivedCommand}from './message-delivery.ts';
import{messagesVisualizedCommand,ownMessageStatusCommand,type MessageReceiptsRpc}from './message-receipts.ts';
import{createAudioTransferCandidate,type AudioTransfer}from './audio-transfer.ts';
import{ownReceiptCommand,type OwnReceiptRpc}from './own-send-receipt.ts';
import {seenMessagesCommand,type SeenMessagesRpc} from './seen-messages.ts';
import type {CompanyRegistryCommand,CompanyRegistryRpc} from './company-registry-rpc.ts';
import {signupReviewPayload,type SignupReviewCommand,type SignupReviewRpc} from './signup-review-rpc.ts';
import type { SubjectBoundRpc } from './supabase-send.ts';
import { onboardingPayload, type SubjectBoundOnboardingRpc, type OnboardingCommand } from './onboarding-rpc.ts';
import type {StaffEmployerRpc} from './staff-employer.ts';
import {membershipPayload,type MembershipRpc} from './membership-directory.ts';
import type {StaffInviteRpc} from './staff-invite-rpc.ts';
import type {StaffInviteReviewRpc} from './staff-invite-review-rpc.ts';
import type {MessageImportanceRpc} from './message-importance.ts';
import type {NotificationPreferencesRpc} from './notification-preferences.ts';
const staffInvitePaths={issue:'/rest/v1/rpc/issue_staff_link_invite_v1',accept:'/rest/v1/rpc/accept_staff_link_invite_v1',revoke:'/rest/v1/rpc/revoke_staff_link_invite_v1'} as const;
type StaffInviteEndpoint=typeof staffInvitePaths[keyof typeof staffInvitePaths];
const staffInviteReviewPaths={preview:'/rest/v1/rpc/preview_staff_link_invite_v1',accept:'/rest/v1/rpc/accept_staff_link_invite_v2'} as const;
type StaffInviteReviewEndpoint=typeof staffInviteReviewPaths[keyof typeof staffInviteReviewPaths];
const messageImportancePaths={read:'/rest/v1/rpc/read_message_importance_v1',set:'/rest/v1/rpc/set_message_importance_v1'} as const;
type MessageImportanceEndpoint=typeof messageImportancePaths[keyof typeof messageImportancePaths];
const notificationPreferencesPaths={get:'/rest/v1/rpc/get_notification_preferences_v1',set:'/rest/v1/rpc/set_notification_preferences_v1'} as const;
type NotificationPreferencesEndpoint=typeof notificationPreferencesPaths[keyof typeof notificationPreferencesPaths];
const membershipPaths={connect_unread_counts:'/rest/v1/rpc/connect_unread_counts',mark_connect_conversation_read:'/rest/v1/rpc/mark_connect_conversation_read',connect_staff_inbox_search:'/rest/v1/rpc/connect_staff_inbox_search',connect_staff_inbox_recent:'/rest/v1/rpc/connect_staff_inbox_recent',search_connect_companies:'/rest/v1/rpc/search_connect_companies',my_connect_memberships:'/rest/v1/rpc/my_connect_memberships',managed_connect_staff:'/rest/v1/rpc/managed_connect_staff',connect_staff_inbox:'/rest/v1/rpc/connect_staff_inbox',link_patient:'/rest/v1/rpc/link_patient',request_staff:'/rest/v1/rpc/request_staff',approve_staff:'/rest/v1/rpc/approve_staff',revoke_staff:'/rest/v1/rpc/revoke_staff',accept_staff_invite:'/rest/v1/rpc/accept_staff_invite'} as const;
type MembershipEndpoint=typeof membershipPaths[keyof typeof membershipPaths];
// Foundation SQL declares exactly these membership functions RETURNS void.
// link_patient returns UUID and must keep the normal 200 JSON path.
const membershipVoidEndpoints=new Set<string>([membershipPaths.request_staff,membershipPaths.approve_staff,membershipPaths.revoke_staff,membershipPaths.accept_staff_invite]);

type SessionInput = Readonly<{ userId: string; sessionKey: string; accessToken: string; expiresAt: number }>;
type Lease = Readonly<{ verifiedAuthSession?:VerifiedAuthSession; userId: string; sessionKey: string; rpc: SubjectBoundRpc; onboarding:SubjectBoundOnboardingRpc; staffEmployer:StaffEmployerRpc; membership:MembershipRpc; staffInvites:StaffInviteRpc; staffInviteReview:StaffInviteReviewRpc; messageImportance:MessageImportanceRpc; notificationPreferences:NotificationPreferencesRpc; signupReview?:SignupReviewRpc; companyRegistry?:CompanyRegistryRpc; membershipLinks?:MembershipLinkRpc; membershipLinkCompany?:(id:string,signal:AbortSignal)=>Promise<unknown>; seenMessages?:SeenMessagesRpc; receiptLookup:OwnReceiptRpc; audioTransfer?:AudioTransfer;audioResolve?:AudioResolveRpc;audioMessage?:AudioMessageRpc; messageReceipts?:MessageReceiptsRpc; messageRemoval?:MessageRemovalRpc; close: () => void }>;
type Options = { receivedAudioCache?:ReceivedAudioCache; projectUrl: string; publishableKey: string; fetch: typeof globalThis.fetch;
  now: () => number; schedule: (callback: () => void, ms: number) => () => void;
  timeoutMs: number; maxPending?: number; companyRegistryCheckTimeoutMs?:number; enableSignupReview?:boolean; enableCompanyRegistry?:boolean; enableCompanyPreview?:boolean; enableMembershipLinks?:boolean; enableSeenMessages?:boolean; enableAudioTransfer?:boolean;enableScopedAudioTransfer?:boolean;enableAudioMessages?:boolean; enableMessageReceipts?:boolean; enableMessageRemoval?:boolean; audioDigest?:(bytes:Uint8Array)=>Promise<string> };
const unavailable = () => new Error('Session transport unavailable');
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const denied = () => Object.freeze({ data: null, error: Object.freeze({ code: '42501' }) });
const MAX_RESPONSE = 512 * 1024;

// Candidate HTTP binding, not a login/refresh/store implementation. All network
// comes from the explicitly injected fetch; tests inject synthetic responses.
export function createSessionRpcTransport({ receivedAudioCache, projectUrl, publishableKey, fetch: fetchRequest, now, schedule, timeoutMs, maxPending = 8, companyRegistryCheckTimeoutMs=timeoutMs, enableSignupReview=false, enableCompanyRegistry=false, enableCompanyPreview=false, enableMembershipLinks=false, enableSeenMessages=false, enableAudioTransfer=false, enableScopedAudioTransfer=false, enableAudioMessages=false, enableMessageReceipts=false, enableMessageRemoval=false, audioDigest }: Options) {
  if (!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(projectUrl)
    || !/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(publishableKey)
    || typeof fetchRequest !== 'function' || typeof now !== 'function' || typeof schedule !== 'function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000
    || !Number.isSafeInteger(companyRegistryCheckTimeoutMs)||companyRegistryCheckTimeoutMs<1||companyRegistryCheckTimeoutMs>60000
    || typeof enableSignupReview!=='boolean'|| typeof enableCompanyRegistry!=='boolean'||typeof enableCompanyPreview!=='boolean'||typeof enableMembershipLinks!=='boolean'|| typeof enableSeenMessages!=='boolean'||typeof enableAudioMessages!=='boolean'||typeof enableAudioTransfer!=='boolean'||typeof enableMessageReceipts!=='boolean'||typeof enableMessageRemoval!=='boolean'||typeof enableScopedAudioTransfer!=='boolean'||enableScopedAudioTransfer&&(enableAudioTransfer||!enableAudioMessages)||(enableAudioTransfer||enableScopedAudioTransfer)&&typeof audioDigest!=='function'
    || !Number.isSafeInteger(maxPending) || maxPending < 1 || maxPending > 100) throw unavailable();
  type Job = { abort: () => void };
  type Run = { token: string | null; userId: string; sessionKey: string; expiresAt: number;
    invalidation: 'local' | 'auth-denied' | null; jobs: Set<Job>; cancelExpiry: () => void;audioTransfer?:AudioTransfer };
  let run: Run | null = null;
  let generation = 0;
  function close(reason: 'local' | 'auth-denied' = 'local') {
    const activation = ++generation, previous = run;
    run = null;
    if (previous) {
      previous.invalidation = reason;
      previous.token = null;previous.audioTransfer?.close();
      const jobs = [...previous.jobs]; previous.jobs.clear();
      try { previous.cancelExpiry(); } catch { /* No diagnostic escapes. */ }
      for (const job of jobs) job.abort();
    }
    return activation;
  }
  const active = (current: Run) => {
    if (run !== current || current.token === null) return false;
    let timestamp: number;
    try { timestamp = now(); } catch { if (run === current) close(); return false; }
    if (run !== current) return false;
    if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp >= current.expiresAt) { close(); return false; }
    return run === current && current.token !== null;
  };
  async function request(current: Run, endpoint: `/rest/v1/companies?${string}` | `/rest/v1/rpc/${import('./membership-secret-link.ts').MembershipLinkCommand['name']}` | '/rest/v1/rpc/resolve_connect_audio_message_v1'|'/rest/v1/rpc/send_connect_audio_message_v1'|'/rest/v1/rpc/lookup_connect_audio_message_v1'|'/rest/v1/rpc/mark_connect_messages_received_v1'|'/rest/v1/rpc/mark_connect_messages_visualized_v1'|'/rest/v1/rpc/lookup_connect_own_message_status_v1'|'/rest/v1/rpc/lookup_connect_own_send_receipt_v1' | '/rest/v1/rpc/mark_connect_messages_seen_v1' | '/auth/v1/user' | '/rest/v1/rpc/send_text' | '/rest/v1/rpc/my_connect_staff_employer' | MembershipEndpoint | StaffInviteEndpoint | StaffInviteReviewEndpoint | MessageImportanceEndpoint | NotificationPreferencesEndpoint | `/rest/v1/rpc/${OnboardingCommand['name'] | SignupReviewCommand['name'] | CompanyRegistryCommand['name'] | MessageRemovalCommand['name']}`, body?: string, callerSignal?: AbortSignal, maxResponse=MAX_RESPONSE,requestTimeoutMs=timeoutMs) {
    if (!active(current) || callerSignal?.aborted || current.jobs.size >= maxPending) throw unavailable();
    const controller = new AbortController();
    let reject!: (reason: Error) => void;
    const interrupted = new Promise<never>((_, r) => { reject = r; });
    void interrupted.catch(() => {});
    let done = false, cancel = () => {};
    const stream = { reader: null as ReadableStreamDefaultReader<Uint8Array> | null };
    const job = { abort: () => {
      if (done) return;
      reject(unavailable()); controller.abort();
      try { void stream.reader?.cancel().catch(() => {}); } catch { /* A faulty stream cannot expose an error. */ }
    } };
    current.jobs.add(job);
    const onAbort = () => job.abort();
    try {
      callerSignal?.addEventListener('abort', onAbort, { once: true });
      cancel = schedule(job.abort, requestTimeoutMs);
      if (!active(current) || controller.signal.aborted || callerSignal?.aborted) throw unavailable();
      // Token is captured from this run, never read from a mutable SDK client.
      const headers = Object.freeze({ apikey: publishableKey, Authorization: 'Bearer ' + current.token,
        Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(endpoint.startsWith('/rest/v1/companies?')||['issue_membership_secret_link_v1','accept_membership_secret_link_v1','revoke_membership_secret_link_v1','list_membership_secret_links_v1'].some(n=>endpoint==='/rest/v1/rpc/'+n)||endpoint === '/rest/v1/rpc/remove_connect_messages_v1'||endpoint === '/rest/v1/rpc/lookup_connect_message_removal_v1'||endpoint === '/rest/v1/rpc/connect_message_removal_changes_v1'||endpoint === '/rest/v1/rpc/resolve_connect_audio_message_v1'||endpoint === '/rest/v1/rpc/send_connect_audio_message_v1'||endpoint === '/rest/v1/rpc/lookup_connect_audio_message_v1'||endpoint === '/rest/v1/rpc/mark_connect_messages_received_v1'||endpoint === '/rest/v1/rpc/mark_connect_messages_visualized_v1'||endpoint === '/rest/v1/rpc/lookup_connect_own_message_status_v1'||endpoint === '/rest/v1/rpc/lookup_connect_own_send_receipt_v1' || endpoint === '/rest/v1/rpc/mark_connect_messages_seen_v1' || endpoint === '/rest/v1/rpc/request_company_registry_check' || endpoint === '/rest/v1/rpc/my_company_registry_check' || endpoint === '/rest/v1/rpc/finalize_registry_company' || endpoint === '/rest/v1/rpc/send_text' || endpoint === '/rest/v1/rpc/my_connect_staff_employer' || Object.values(membershipPaths).includes(endpoint as MembershipEndpoint) || Object.values(staffInvitePaths).includes(endpoint as StaffInviteEndpoint) || Object.values(staffInviteReviewPaths).includes(endpoint as StaffInviteReviewEndpoint) || Object.values(messageImportancePaths).includes(endpoint as MessageImportanceEndpoint) || Object.values(notificationPreferencesPaths).includes(endpoint as NotificationPreferencesEndpoint) ? { 'Content-Profile': 'public', 'Accept-Profile': 'public' } : {}) });
      const url = projectUrl + endpoint;
      const operation = async () => {
        const response = await fetchRequest(url, { method: body === undefined ? 'GET' : 'POST', headers,
          body, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
        if (!active(current) || controller.signal.aborted) { try { await response.body?.cancel(); } catch {} throw unavailable(); }
        if (response.redirected || response.url && response.url !== url) throw unavailable();
        const status = response.status;
        if (status === 401 || status === 403) { if (run === current) close('auth-denied'); throw unavailable(); }
        if (status === 429) { try { await response.body?.cancel(); } catch {} return { status, value: null }; }
        if (status >= 500 || status < 200 || status >= 300 && status !== 400 && status !== 409 && status !== 422) throw unavailable();
        if(status===204&&membershipVoidEndpoints.has(endpoint)){
          const body204=response.body,length204=response.headers.get('content-length');
          if(length204!==null&&length204!=='0'){
            try{await body204?.cancel();}catch{}throw unavailable();
          }
          // Expo FetchResponse exposes a ReadableStream even for native 204.
          // Acknowledge only proven EOF with strictly zero bytes, never JSON
          // fabrication or an unbounded stream of zero-length chunks. Reuse
          // the existing reader owner, deadline and lease/abort cancellation.
          if(body204!==null){
            if(typeof body204.getReader!=='function')throw unavailable();
            stream.reader=body204.getReader();let emptyChunks=0;
            while(true){
              const part=await stream.reader.read();
              if(!active(current)||controller.signal.aborted)throw unavailable();
              if(part.done===true){if(part.value!==undefined)throw unavailable();break;}
              if(part.done!==false||!(part.value instanceof Uint8Array)||part.value.byteLength!==0||++emptyChunks>16)throw unavailable();
            }
          }
          if(!active(current)||controller.signal.aborted)throw unavailable();
          return {status,value:null};
        }
        if (!/^(?:application\/json)(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) throw unavailable();
        const length = response.headers.get('content-length');
        if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxResponse)) throw unavailable();
        if (!response.body || typeof response.body.getReader !== 'function') throw unavailable();
        stream.reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
          const part = await stream.reader.read();
          if (!active(current) || controller.signal.aborted) throw unavailable();
          if (part.done) break;
          if (!(part.value instanceof Uint8Array) || (size += part.value.byteLength) > maxResponse) throw unavailable();
          chunks.push(part.value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        return { status, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown };
      };
      const result = await Promise.race([interrupted, operation()]);
      if (!active(current) || callerSignal?.aborted) throw unavailable();
      return result;
    } catch { throw unavailable(); }
    finally {
      done = true; current.jobs.delete(job);
      try { cancel(); } catch {}
      try { callerSignal?.removeEventListener('abort', onAbort); } catch {}
      try { void stream.reader?.cancel().catch(() => {}); stream.reader?.releaseLock(); } catch {}
      controller.abort();
    }
  }
  async function bindSession(input: SessionInput): Promise<Readonly<{ ok: true; value: Lease } | { ok: false }>> {
    const activation = close(); // Fail closed immediately, including a failed replacement.
    let current: Run;
    try {
      const { userId, sessionKey, accessToken, expiresAt } = input;
      const timestamp = now();
      if (activation !== generation || !uuid(userId) || typeof sessionKey !== 'string' || !sessionKey.trim() || sessionKey.length > 200
        || typeof accessToken !== 'string' || !/^[A-Za-z0-9_.-]{1,8192}$/.test(accessToken) || accessToken.startsWith('sb_')
        || !Number.isSafeInteger(timestamp) || timestamp < 0 || !Number.isSafeInteger(expiresAt)
        || expiresAt <= timestamp || expiresAt - timestamp > 24 * 60 * 60 * 1000) return Object.freeze({ ok: false });
      current = { token: accessToken, userId, sessionKey, expiresAt, invalidation: null, jobs: new Set(), cancelExpiry: () => {} };
      run = current;
      const cancelExpiry = schedule(() => { if (run === current) close(); }, expiresAt - timestamp);
      if (!active(current)) { cancelExpiry(); return Object.freeze({ ok: false }); }
      current.cancelExpiry = cancelExpiry;
      const verified = await request(current, '/auth/v1/user');
      if (verified.status !== 200 || !record(verified.value) || verified.value.id !== userId || verified.value.role !== 'authenticated' || !active(current)) throw unavailable();
      const rpc: SubjectBoundRpc = async (name, params, signal) => {
        if (!active(current)) return denied();
        try {
          if (name !== 'send_text' || !params) throw unavailable();
          const { p_company, p_conversation, p_client_id, p_body } = params;
          if (!uuid(p_company) || !uuid(p_conversation) || typeof p_client_id !== 'string'
            || !/^[A-Za-z0-9_-]{1,80}$/.test(p_client_id) || typeof p_body !== 'string'
            || p_body.length > 65536) throw unavailable();
          const payload = JSON.stringify({ p_company, p_conversation, p_client_id, p_body });
          const response = await request(current, '/rest/v1/rpc/send_text', payload, signal);
          if (!active(current)) throw unavailable();
          if (response.status === 200) return Object.freeze({ data: response.value, error: null });
          const code = response.status === 429 ? 'RATE_LIMITED' : record(response.value)
            && ['P0001', '42501', '40001', '40P01'].includes(response.value.code as string) ? response.value.code : 'UNCLASSIFIED';
          return Object.freeze({ data: null, error: Object.freeze({ code }) });
        } catch {
          // Local cancellation after dispatch does not prove server rejection.
          // Preserve an uncertain acknowledgement; the queue's session guard
          // discards it on account switch. A server401/403 is a definite denial.
          if (current.invalidation === 'auth-denied') return denied();
          throw unavailable();
        }
      };
      const onboarding:SubjectBoundOnboardingRpc=async(command,signal)=>{
        if(!active(current)||command.name==='preview_company_registry_data_v1'&&!enableCompanyPreview)return denied();
        try{
          const payload=onboardingPayload(command);
          const response=await request(current,`/rest/v1/rpc/${payload.name}`,payload.body,signal,payload.name==='preview_company_registry_data_v1'?4096:undefined);
          if(!active(current))throw unavailable();
          if(response.status===200)return Object.freeze({data:response.value,error:null});
          const code=response.status===429?'RATE_LIMITED':record(response.value)&&['P0001','42501','40001','40P01'].includes(response.value.code as string)?String(response.value.code):'UNCLASSIFIED';
          return Object.freeze({data:null,error:Object.freeze({code})});
        }catch{if(current.invalidation==='auth-denied')return denied();throw unavailable();}
      };
      const signupReview:SignupReviewRpc=async(command,signal)=>{
        if(!enableSignupReview||!active(current))return denied();
        try{
          const payload=signupReviewPayload(command);
          const response=await request(current,`/rest/v1/rpc/${payload.name}`,payload.body,signal,4096);
          if(!active(current))throw unavailable();
          if(response.status===200)return Object.freeze({data:response.value,error:null});
          const code=response.status===429?'RATE_LIMITED':record(response.value)&&['P0001','42501','40001','40P01'].includes(response.value.code as string)?String(response.value.code):'UNCLASSIFIED';
          return Object.freeze({data:null,error:Object.freeze({code})});
        }catch{if(current.invalidation==='auth-denied')return denied();throw unavailable();}
      };
      // IDs-only opt-in capability on this same verified run. Keep validation
      // inline so existing assemblies add no runtime dependency on this feature.
      const membershipLinks:MembershipLinkRpc=async(raw,signal)=>{
        if(!enableMembershipLinks||!active(current)||signal.aborted)return denied();
        try{const command=membershipLinkCommand(raw);const response=await request(current,`/rest/v1/rpc/${command.name}`,JSON.stringify(command.params),signal,command.name==='list_membership_secret_links_v1'?32768:4096);
          if(!active(current))return denied();return response.status===200?{data:response.value,error:null}:{data:null,error:{code:response.status===429?'RATE_LIMITED':'UNAVAILABLE'}};
        }catch{return {data:null,error:{code:current.invalidation==='auth-denied'?'42501':'UNAVAILABLE'}};}
      };
      const membershipLinkCompany=async(id:string,signal:AbortSignal)=>{
        if(!enableMembershipLinks||!active(current)||!uuid(id)||signal.aborted)throw unavailable();
        const query=new URLSearchParams({select:'id,name,address,phone',id:'eq.'+id,limit:'1'});
        const response=await request(current,`/rest/v1/companies?${query.toString()}`,undefined,signal,4096);
        if(!active(current)||response.status!==200)throw unavailable();return response.value;
      };
      const companyRegistry:CompanyRegistryRpc=async(command,signal)=>{
        if(!enableCompanyRegistry||!active(current))return denied();
        try{
          if(!record(command)||Reflect.ownKeys(command).length!==2||!Object.hasOwn(command,'name')||!Object.hasOwn(command,'params'))throw unavailable();
          const {name,params}=command;if(!record(params))throw unavailable();
          let endpoint:'/rest/v1/rpc/request_company_registry_check'|'/rest/v1/rpc/my_company_registry_check'|'/rest/v1/rpc/finalize_registry_company',body:string;
          const fields=name==='my_company_registry_check'?['p_request']:name==='request_company_registry_check'?['p_request','p_operation']:name==='finalize_registry_company'?['p_request','p_proof','p_operation']:null;
          if(!fields||Reflect.ownKeys(params).length!==fields.length||Reflect.ownKeys(params).some(k=>typeof k!=='string'||!fields.includes(k)))throw unavailable();
          const {p_request}=params;if(!uuid(p_request))throw unavailable();
          if(name==='my_company_registry_check'){endpoint='/rest/v1/rpc/my_company_registry_check';body=JSON.stringify({p_request});}
          else if(name==='request_company_registry_check'){const {p_operation}=params;if(!uuid(p_operation))throw unavailable();endpoint='/rest/v1/rpc/request_company_registry_check';body=JSON.stringify({p_request,p_operation});}
          else if(name==='finalize_registry_company'){const {p_proof,p_operation}=params;if(!uuid(p_proof)||!uuid(p_operation))throw unavailable();endpoint='/rest/v1/rpc/finalize_registry_company';body=JSON.stringify({p_request,p_proof,p_operation});}
          else throw unavailable();
          const response=await request(current,endpoint,body,signal,4096,name==='request_company_registry_check'?companyRegistryCheckTimeoutMs:timeoutMs);if(!active(current))throw unavailable();
          if(response.status===200)return Object.freeze({data:response.value,error:null});
          const code=response.status===429?'RATE_LIMITED':record(response.value)&&['P0001','42501','40001','40P01'].includes(response.value.code as string)?String(response.value.code):'UNCLASSIFIED';
          return Object.freeze({data:null,error:Object.freeze({code})});
        }catch{if(current.invalidation==='auth-denied')return denied();throw unavailable();}
      };
      // Fixed parameterless surface: the caller cannot select a subject, schema,
      // company or endpoint. Shares the verified run and cancellation machinery.
      const staffEmployer:StaffEmployerRpc=async(signal)=>{
        if(!active(current))return denied();
        try{
          const response=await request(current,'/rest/v1/rpc/my_connect_staff_employer','{}',signal,4096);
          if(!active(current))return denied();
          if(response.status===200)return Object.freeze({data:response.value,error:null});
          return Object.freeze({data:null,error:Object.freeze({code:response.status===429?'RATE_LIMITED':'UNAVAILABLE'})});
        }catch{return Object.freeze({data:null,error:Object.freeze({code:current.invalidation==='auth-denied'?'42501':'UNAVAILABLE'})});}
      };
      const membership:MembershipRpc=async(command,signal)=>{
        if(!active(current))return denied();
        try{
          // Snapshot getters once, validate the allowlist, and project only the
          // documented fields. Never interpolate caller-supplied endpoint names.
          const payload=membershipPayload({name:command.name,params:{...command.params}});
          if(!Object.hasOwn(membershipPaths,payload.name))throw unavailable();
          const endpoint=membershipPaths[payload.name as keyof typeof membershipPaths];
          const response=await request(current,endpoint,JSON.stringify(payload.params),signal,64*1024);
          if(!active(current))throw unavailable();
          if(response.status===200||response.status===204&&membershipVoidEndpoints.has(endpoint))return Object.freeze({data:response.value,error:null});
          const code=response.status===429?'RATE_LIMITED':record(response.value)&&['P0001','42501','40001','40P01'].includes(response.value.code as string)?String(response.value.code):'UNCLASSIFIED';
          return Object.freeze({data:null,error:Object.freeze({code})});
        }catch{if(current.invalidation==='auth-denied')return denied();throw unavailable();}
      };
      const staffInvites:StaffInviteRpc=async(command,signal)=>{
        if(!active(current))return denied();
        try{
          // A caller-selected name is never interpolated into a URL. Read each
          // projected primitive once, then validate and serialize that snapshot.
          const name=command.name;let endpoint:StaffInviteEndpoint,body:string;
          switch(name){
            case 'issue_staff_link_invite_v1':{
              const {p_request,p_company,p_token,p_expires}=command.params;
              if(!uuid(p_request)||!uuid(p_company)||typeof p_token!=='string'||!/^[0-9a-f]{64}$/.test(p_token)
                ||typeof p_expires!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p_expires)
                ||!Number.isFinite(Date.parse(p_expires))||new Date(p_expires).toISOString()!==p_expires)throw unavailable();
              endpoint=staffInvitePaths.issue;body=JSON.stringify({p_request,p_company,p_token,p_expires});break;
            }
            case 'accept_staff_link_invite_v1':{
              const {p_invite,p_token}=command.params;
              if(!uuid(p_invite)||typeof p_token!=='string'||!/^[0-9a-f]{64}$/.test(p_token))throw unavailable();
              endpoint=staffInvitePaths.accept;body=JSON.stringify({p_invite,p_token});break;
            }
            case 'revoke_staff_link_invite_v1':{
              const {p_invite}=command.params;if(!uuid(p_invite))throw unavailable();
              endpoint=staffInvitePaths.revoke;body=JSON.stringify({p_invite});break;
            }
            default:throw unavailable();
          }
          const response=await request(current,endpoint,body,signal,4096);
          if(!active(current))throw unavailable();
          if(response.status===200)return Object.freeze({data:response.value,error:null});
          return Object.freeze({data:null,error:Object.freeze({code:response.status===429?'RATE_LIMITED':'UNAVAILABLE'})});
        }catch{if(current.invalidation==='auth-denied')return denied();throw unavailable();}
      };
      // Separate wire contracts: reviewed acceptance requires expected company.
      // Legacy staffInvites remains isolated for existing local candidates; it
      // cannot substitute for this surface and is never a fallback for v2.
      const staffInviteReview:StaffInviteReviewRpc=async(command,signal)=>{
        if(!active(current))return denied();
        try{
          const name=command.name;let endpoint:StaffInviteReviewEndpoint,body:string;
          switch(name){
            case 'preview_staff_link_invite_v1':{
              const {p_invite,p_token}=command.params;
              if(!uuid(p_invite)||typeof p_token!=='string'||!/^[0-9a-f]{64}$/.test(p_token))throw unavailable();
              endpoint=staffInviteReviewPaths.preview;body=JSON.stringify({p_invite,p_token});break;
            }
            case 'accept_staff_link_invite_v2':{
              const {p_invite,p_token,p_expected_company}=command.params;
              if(!uuid(p_invite)||typeof p_token!=='string'||!/^[0-9a-f]{64}$/.test(p_token)||!uuid(p_expected_company))throw unavailable();
              endpoint=staffInviteReviewPaths.accept;body=JSON.stringify({p_invite,p_token,p_expected_company});break;
            }
            default:throw unavailable();
          }
          const response=await request(current,endpoint,body,signal,4096);
          if(!active(current))throw unavailable();
          if(response.status===200)return Object.freeze({data:response.value,error:null});
          return Object.freeze({data:null,error:Object.freeze({code:response.status===429?'RATE_LIMITED':'UNAVAILABLE'})});
        }catch{if(current.invalidation==='auth-denied')return denied();throw unavailable();}
      };
      const messageImportance:MessageImportanceRpc=async(command,signal)=>{
        if(!active(current))return denied();
        try{
          const name=command.name;let endpoint:MessageImportanceEndpoint,body:string;
          switch(name){
            case 'read_message_importance_v1':{
              const {p_company,p_conversation,p_message}=command.params;
              if(!uuid(p_company)||!uuid(p_conversation)||!uuid(p_message))throw unavailable();
              endpoint=messageImportancePaths.read;body=JSON.stringify({p_company,p_conversation,p_message});break;
            }
            case 'set_message_importance_v1':{
              const {p_company,p_conversation,p_message,p_operation,p_expected_revision,p_important}=command.params;
              if(!uuid(p_company)||!uuid(p_conversation)||!uuid(p_message)||!uuid(p_operation)
                ||typeof p_expected_revision!=='number'||!Number.isInteger(p_expected_revision)||p_expected_revision<0||p_expected_revision>2147483647
                ||typeof p_important!=='boolean')throw unavailable();
              endpoint=messageImportancePaths.set;body=JSON.stringify({p_company,p_conversation,p_message,p_operation,p_expected_revision,p_important});break;
            }
            default:throw unavailable();
          }
          // This versioned CAS surface never falls back to set_message_important.
          const response=await request(current,endpoint,body,signal,4096);
          if(!active(current))throw unavailable();
          if(response.status===200)return Object.freeze({data:response.value,error:null});
          const sqlCode=record(response.value)?response.value.code:undefined;
          const code=response.status===429?'RATE_LIMITED':sqlCode==='40001'?'40001':'UNAVAILABLE';
          // Strip private PostgREST diagnostics; only the authorized CAS code is
          // exposed so the bound adapter can distinguish conflict from unknown.
          return Object.freeze({data:null,error:Object.freeze({code})});
        }catch{if(current.invalidation==='auth-denied')return denied();throw unavailable();}
      };
      const notificationPreferences:NotificationPreferencesRpc=async(command,signal)=>{
        if(!active(current))return denied();
        try{
          const name=command.name;let endpoint:NotificationPreferencesEndpoint,body:string;
          switch(name){
            case 'get_notification_preferences_v1':{
              const {p_installation}=command.params;if(!uuid(p_installation))throw unavailable();
              endpoint=notificationPreferencesPaths.get;body=JSON.stringify({p_installation});break;
            }
            case 'set_notification_preferences_v1':{
              const {p_installation,p_operation,p_expected_revision,p_privacy,p_filter}=command.params;
              if(!uuid(p_installation)||!uuid(p_operation)||typeof p_expected_revision!=='number'||!Number.isInteger(p_expected_revision)||p_expected_revision<0||p_expected_revision>2147483647
                ||typeof p_privacy!=='number'||!Number.isInteger(p_privacy)||p_privacy<1||p_privacy>4
                ||p_filter!==null&&p_filter!=='all'&&p_filter!=='important')throw unavailable();
              endpoint=notificationPreferencesPaths.set;body=JSON.stringify({p_installation,p_operation,p_expected_revision,p_privacy,p_filter});break;
            }
            default:throw unavailable();
          }
          // Installation is public routing metadata, never a caller-selected
          // subject or proof of device ownership. Auth comes from this run.
          const response=await request(current,endpoint,body,signal,4096);
          if(!active(current))throw unavailable();
          if(response.status===200)return Object.freeze({data:response.value,error:null});
          const sqlCode=record(response.value)?response.value.code:undefined;
          const code=response.status===429?'RATE_LIMITED':sqlCode==='40001'?'40001':'UNAVAILABLE';
          return Object.freeze({data:null,error:Object.freeze({code})});
        }catch{if(current.invalidation==='auth-denied')return denied();throw unavailable();}
      };
      const messageRemoval:MessageRemovalRpc=async(command,signal)=>{
        if(!enableMessageRemoval||!active(current)||signal.aborted)throw unavailable();
        try{
          const canonical=canonicalRemovalCommand(command);
          const endpoint='/rest/v1/rpc/'+canonical.name;
          const response=await request(current,endpoint as '/rest/v1/rpc/remove_connect_messages_v1'|'/rest/v1/rpc/lookup_connect_message_removal_v1'|'/rest/v1/rpc/connect_message_removal_changes_v1',JSON.stringify(canonical.params),signal);
          if(!active(current)||signal.aborted||response.status!==200)throw unavailable();
          return response.value;
        }catch{throw unavailable();}
      };
      const messageReceipts:MessageReceiptsRpc=async(command,signal)=>{
        if(!enableMessageReceipts||!active(current))return denied();
        try{
          const {p_company,p_conversation,p_messages}=command.params;if(typeof p_messages!=='string'||p_messages.length>1000)throw unavailable();const ids=JSON.parse(p_messages);
          const canonical=command.name==='mark_connect_messages_received_v1'?messagesReceivedCommand(p_company,p_conversation,ids):command.name==='mark_connect_messages_visualized_v1'?messagesVisualizedCommand(p_company,p_conversation,ids):command.name==='lookup_connect_own_message_status_v1'?ownMessageStatusCommand(p_company,p_conversation,ids):null;
          if(!canonical||JSON.stringify(command.params)!==JSON.stringify(canonical.params))throw unavailable();
          const endpoint=({mark_connect_messages_received_v1:'/rest/v1/rpc/mark_connect_messages_received_v1',mark_connect_messages_visualized_v1:'/rest/v1/rpc/mark_connect_messages_visualized_v1',lookup_connect_own_message_status_v1:'/rest/v1/rpc/lookup_connect_own_message_status_v1'}as const)[canonical.name];
          const response=await request(current,endpoint,JSON.stringify(canonical.params),signal,16384);
          if(!active(current))return denied();if(response.status===200)return Object.freeze({data:response.value,error:null});
          const code=record(response.value)&&['P0001','42501'].includes(response.value.code as string)?String(response.value.code):'UNAVAILABLE';return Object.freeze({data:null,error:Object.freeze({code})});
        }catch{return Object.freeze({data:null,error:Object.freeze({code:current.invalidation==='auth-denied'?'42501':'UNAVAILABLE'})});}
      };
      const audioResolve:AudioResolveRpc=async(command,signal)=>{if(!enableAudioMessages||!active(current))return denied();try{const p=command.params,c=audioResolveCommand(p.p_company,p.p_conversation,p.p_message);if(command.name!==c.name||JSON.stringify(p)!==JSON.stringify(c.params))throw unavailable();const response=await request(current,'/rest/v1/rpc/resolve_connect_audio_message_v1',JSON.stringify(c.params),signal,4096);if(!active(current))return denied();return response.status===200?{data:response.value,error:null}:{data:null,error:{code:'UNAVAILABLE'}};}catch{return{data:null,error:{code:current.invalidation==='auth-denied'?'42501':'UNAVAILABLE'}};}};
      const audioMessage:AudioMessageRpc=async(command,signal)=>{
       if(!enableAudioMessages||!active(current))return denied();try{const p=command.params,canonical=audioMessageCommand(command.name==='send_connect_audio_message_v1'?'send':'lookup',p.p_company,p.p_conversation,p.p_client,p.p_attachment);if(command.name!==canonical.name||JSON.stringify(p)!==JSON.stringify(canonical.params))throw unavailable();const response=await request(current,canonical.name==='send_connect_audio_message_v1'?'/rest/v1/rpc/send_connect_audio_message_v1':'/rest/v1/rpc/lookup_connect_audio_message_v1',JSON.stringify(canonical.params),signal,4096);if(!active(current))return denied();if(response.status===200)return{data:response.value,error:null};return{data:null,error:{code:record(response.value)&&response.value.code==='P0001'?'P0001':'UNAVAILABLE'}};}catch{return{data:null,error:{code:current.invalidation==='auth-denied'?'42501':'UNAVAILABLE'}};}
      };
      const audioTransfer=enableScopedAudioTransfer?createScopedAudioTransfer({receivedCache:receivedAudioCache,enabled:true,origin:projectUrl,publishableKey,userId,current:()=>active(current),token:()=>active(current)?current.token:null,denied:()=>{if(run===current)close('auth-denied');},fetch:fetchRequest,digest:audioDigest!,now,schedule,timeoutMs}):enableAudioTransfer?createAudioTransferCandidate({origin:projectUrl,publishableKey,userId,current:()=>active(current),token:()=>active(current)?current.token:null,denied:()=>{if(run===current)close('auth-denied');},fetch:fetchRequest,digest:audioDigest!,schedule,timeoutMs}):undefined;
      current.audioTransfer=audioTransfer;
      const receiptLookup:OwnReceiptRpc=async(command,signal)=>{
        if(!active(current))return denied();
        try{
          const {p_company,p_conversation,p_client_id}=command.params;
          const payload=ownReceiptCommand({userId,sessionKey,companyId:p_company,conversationId:p_conversation},p_client_id);
          if(command.name!==payload.name||JSON.stringify(command.params)!==JSON.stringify(payload.params))throw unavailable();
          const response=await request(current,'/rest/v1/rpc/lookup_connect_own_send_receipt_v1',JSON.stringify(payload.params),signal,4096);
          if(!active(current))return denied();
          if(response.status===200)return Object.freeze({data:response.value,error:null});
          const code=record(response.value)&&['P0001','42501'].includes(response.value.code as string)?String(response.value.code):'UNAVAILABLE';
          return Object.freeze({data:null,error:Object.freeze({code})});
        }catch{return Object.freeze({data:null,error:Object.freeze({code:current.invalidation==='auth-denied'?'42501':'UNAVAILABLE'})});}
      };
      const seenMessages:SeenMessagesRpc=async(command,signal)=>{
        if(!enableSeenMessages||!active(current))return denied();
        try{
          const name=command.name,{p_company,p_conversation,p_messages}=command.params;
          if(name!=='mark_connect_messages_seen_v1'||typeof p_messages!=='string'||p_messages.length>1000)throw unavailable();
          const payload=seenMessagesCommand(p_company,p_conversation,JSON.parse(p_messages));
          const response=await request(current,'/rest/v1/rpc/mark_connect_messages_seen_v1',JSON.stringify(payload.params),signal,4096);
          if(!active(current))return denied();
          if(response.status===200)return Object.freeze({data:response.value,error:null});
          const code=record(response.value)&&['P0001','42501'].includes(response.value.code as string)?String(response.value.code):'UNAVAILABLE';
          return Object.freeze({data:null,error:Object.freeze({code})});
        }catch{return Object.freeze({data:null,error:Object.freeze({code:current.invalidation==='auth-denied'?'42501':'UNAVAILABLE'})});}
      };
      const verifiedAuthSession=enableMembershipLinks?authSessionMetadataAfterUserCheck(accessToken,userId,projectUrl,expiresAt,now()):null;
      return Object.freeze({ ok: true, value: Object.freeze({ userId, sessionKey,...(verifiedAuthSession?{verifiedAuthSession}:{}), receiptLookup,...(enableMembershipLinks?{membershipLinks,membershipLinkCompany}:{}),...(enableMessageRemoval?{messageRemoval}:{}),...(enableAudioMessages?{audioMessage,audioResolve}:{}), ...(enableMessageReceipts?{messageReceipts}:{}), ...(audioTransfer?{audioTransfer}:{}), rpc, onboarding, staffEmployer, membership, staffInvites, staffInviteReview, messageImportance, notificationPreferences, ...(enableSeenMessages?{seenMessages}:{}), ...(enableSignupReview?{signupReview}:{}), ...(enableCompanyRegistry?{companyRegistry}:{}),
        close: () => { if (run === current) close(); } }) });
    } catch { if (generation === activation) close(); return Object.freeze({ ok: false }); }
  }
  return Object.freeze({ bindSession, signOut: () => { close(); } });
}
