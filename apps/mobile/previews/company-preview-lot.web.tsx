import{createConnectWebRoot}from'../App.web.tsx';
/** Source-only lot selection. No registerRootComponent, env, URL switch or I/O here.
 * Existing releases/default root stay unchanged. Backend preview remains OFF until
 * a coordinated validation window/promotion; invitation screens are selected only here.
 * This client selection grants no server access and does not register/publish the root. */
export function createCompanyPreviewLotWebRoot(imageMode?:'candidate-private-v1'){
 return createConnectWebRoot('candidate-on-demand-check','candidate-scoped-chat','candidate-own-company','candidate-selection-v1','candidate-secret-v1','candidate-preview-v1',imageMode);
}
