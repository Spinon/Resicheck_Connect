# Controle local de sessão e contexto

Primitiva para a futura integração nativa de autenticação. Não contém SDK, credencial, armazenamento, rede nem regra de autorização do servidor. Integrada ao store de cenários fictícios da demonstração em `apps/mobile/src/demo-session.ts`; continua sem autenticação real. Evidência da integração em `docs/testing/SESSAO-E-ACESSO-NA-INTERFACE.md`.

`createSessionScope(clearPrivateView)` invalida tickets de operações assíncronas ao iniciar autenticação, aceitar identidade, encerrar sessão e trocar/remover empresa. Cada instância tem seus próprios tickets; voltar de empresa A para B e novamente A não recupera tickets antigos. O estado exposto é imutável e contém somente IDs. Selecionar empresa aqui **não comprova vínculo**: o adaptador precisa obter vínculos permitidos do backend; cada requisição continua sujeita a RLS.

Uso esperado pelo futuro adaptador:

```ts
const ticket = scope.capture(); // Antes de iniciar a requisição.
const response = await fetchConversationAuthorizedByBackend();
scope.commit(ticket, () => { setConversation(response); });
```

O callback de commit é síncrono (`() => undefined`). Não iniciar trabalho assíncrono nele: cada trabalho assíncrono deve capturar ticket e verificar na conclusão. Não colocar credenciais no escopo. Assinaturas de realtime, timers e requests devem ser encerrados/cancelados pelo adaptador quando possível; tickets impedem aplicar resultados obsoletos, mas não cancelam transporte nem removem dados de outros caches sozinhos.

Antes do login/restauração, chamar `beginAuthentication`; somente o resultado correspondente pode chamar `acceptIdentity`. O ticket é consumido. Eventos de refresh do mesmo usuário não são um novo login: devem preservar o contexto atual, aplicando seus resultados com ticket corrente. Logout chama `signOut` imediatamente, antes de aguardar rede/armazenamento. A limpeza injetada deve apagar toda a visão/cache privado de forma síncrona; em falha, escopo fica sem usuário e tickets antigos permanecem inválidos, mas a camada de interface ainda precisa bloquear/remover qualquer conteúdo cuja limpeza falhou. Não confundir isso com remoção persistida ou revogação remota já confirmadas.

`publicAuthError` converte somente códigos permitidos em mensagens fixas. Códigos desconhecidos, erros de rede não classificados, objetos malformados ou propriedades que lançam erro usam fallback genérico. Nunca retorna message/details/hint arbitrários. Diagnóstico administrativo requer mecanismo separado e sanitizado; este pacote não faz logging.

Validação em 06/11/2026: typecheck estrito e **10 testes locais** passaram. Promessas controladas verificam respostas de chat/login após logout ou troca de contexto; também há replay de callback, instâncias separadas, limpeza falha e códigos de erro desconhecidos. Revisão independente identificou que o tipo void permitiria limpeza assíncrona: corrigido para `() => undefined`, com duas verificações de compilação que rejeitam cleanup/commit async. Não são testes de Supabase/Auth real, persistência nativa, revogação de JWT ou RLS.

Comandos na raiz: `npm run session:typecheck` e `npm run session:test`. Próxima integração deve testar AppState, armazenamento protegido, expiração, reinício do processo, logout offline e troca de conta no Android. Não foi gerado novo APK ou alterado o backend nesta fatia.
