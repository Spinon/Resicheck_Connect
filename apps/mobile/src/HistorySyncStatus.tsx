import React from 'react';
import {ActivityIndicator,StyleSheet,Text,View} from 'react-native';
import type {HistoryWindowSnapshot} from '../../../packages/chat-client/src/history-window.ts';
import {HistoryPreparation} from './HistoryPreparation.tsx';
/** First synchronization has measured counts. Reconciliation keeps the saved
 * window visible and uses a compact indicator, without restarting that counter. */
export function HistorySyncStatus({history:h}:{history:Pick<HistoryWindowSnapshot,'busy'|'messages'|'cachedPresentation'|'syncProgress'|'cancelling'|'syncing'>}){
 if(!h.busy&&!h.syncing||h.cancelling)return null;
 if(h.cachedPresentation&&h.messages.length)return <View testID="history-background-sync" accessibilityLabel="Atualizando mensagens salvas" accessibilityState={{busy:true}} style={s.compact}><ActivityIndicator size="small" color="#185C45" accessible={false}/></View>;
 if(!h.syncProgress)return null;
 return <View testID="history-sync-progress" style={s.first}><HistoryPreparation/><Text accessibilityLiveRegion="polite" style={s.caption}>{h.syncProgress.loaded} mensagens conferidas</Text></View>;
}
const s=StyleSheet.create({first:{paddingHorizontal:16,paddingVertical:4},caption:{fontSize:12,lineHeight:18,color:'#52675A'},compact:{position:'absolute',right:12,top:72,zIndex:1,alignItems:'flex-end',padding:4,pointerEvents:'none'}});
