import React,{createContext,useContext}from'react';
export type ConnectBuildInfo=Readonly<{versionName:string;versionCode:number;internalQa?:boolean}>;
const Context=createContext<ConnectBuildInfo|null>(null);
/** Public compile-time identity only; never authorization or credentials. */
export function ConnectBuildInfoProvider({value,children}:{value:ConnectBuildInfo;children:React.ReactNode}){
 if(!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?$/.test(value.versionName)||!Number.isSafeInteger(value.versionCode)||value.versionCode<1)throw Error('Build information unavailable');
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useConnectBuildInfo=()=>useContext(Context);
