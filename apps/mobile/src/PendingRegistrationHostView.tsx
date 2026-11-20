import{companyRegistryRegistrationPresentation}from'./company-registry-registration-presentation.ts';
import React,{useSyncExternalStore} from 'react';
import {RegistrationScreens,type RegistrationScreenProps} from './RegistrationScreens.tsx';
import type {createRegistrationHost} from './registration-host.ts';
import {pendingRegistrationPresentation} from './pending-registration-presentation.ts';

// Offline copy remains the default. The connected candidate explicitly selects
// pending-only server copy; this presentation choice enables no I/O by itself.
export function PendingRegistrationHostView({host,connectedPending=false,companyRegistryRequestIds,companyRegistryCorrections=false,restoreSession,onCompanyPreview}:{host:ReturnType<typeof createRegistrationHost>;connectedPending?:boolean;companyRegistryRequestIds?:readonly string[];companyRegistryCorrections?:boolean;restoreSession?:Readonly<{available:boolean;retry:()=>void}>;onCompanyPreview?:RegistrationScreenProps['onCompanyPreview']}){
 useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot);
 return <RegistrationScreens {...(companyRegistryCorrections?companyRegistryRegistrationPresentation(host.bind()):pendingRegistrationPresentation(host.bind()))} connectedPending={connectedPending} companyRegistryRequestIds={companyRegistryRequestIds} restoreSession={restoreSession} onCompanyPreview={onCompanyPreview}/>;
}
