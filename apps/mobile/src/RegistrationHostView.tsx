import React,{useSyncExternalStore} from 'react';
import {RegistrationScreens} from './RegistrationScreens';
import type {createRegistrationHost} from './registration-host';
// Host lifecycle belongs to the caller; do not dispose an externally owned host
// from a React effect (StrictMode may replay setup/cleanup).
export function RegistrationHostView({host}:{host:ReturnType<typeof createRegistrationHost>}){
  useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot);
  return <RegistrationScreens {...host.bind()}/>;
}
