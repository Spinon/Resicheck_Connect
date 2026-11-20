import{createConnectedScopedAudioRoot}from'./connected-scoped-audio-root.tsx';
/** Source-only lot selection; no registration, config/credential lookup or build.
 * Reuses native privacy, cache, receipts and audio. Invitation screens are opted in for this candidate; images remain OFF.
 * The eventual QA/release entry supplies its own reviewed build identity/version. */
export function createCompanyPreviewLotAndroidRoot(config:unknown,fetcher:typeof fetch,imageMode?:'candidate-private-v1'){
 return createConnectedScopedAudioRoot(config,fetcher,'connected-pilot','candidate-observed-v1','candidate-on-demand-check','candidate-own-company','candidate-selection-v1','candidate-secret-v1','candidate-preview-v1',imageMode);
}
