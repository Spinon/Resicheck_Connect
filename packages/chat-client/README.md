# Fila local de envio de texto

Fatia independente de APP-004. Módulo TypeScript portátil, sem SDK, rede, credenciais, IO, persistência, assinatura de eventos ou integração com o app. Reutiliza `packages/session/src/session-scope.ts` para invalidar resultados antigos e `packages/text/src/message-text.ts` para preservar/validar Unicode. Nenhuma dependência instalada.

## Contrato mínimo

`createTextSendQueue({ transport, createId, schedule, timeoutMs, maxEntries? })` recebe:

- `transport(request)`: Promise de resultado **desconhecido**. O pedido contém somente `companyId`, `conversationId`, `clientMessageId` e `text`. O adaptador futuro autentica e chama o backend; a fila não fornece credenciais, papel nem autoridade.
- `createId()`: identificador imprevisível e globalmente único para cada nova intenção, incluindo após reinício, logout e A → B → A. Usar gerador UUID seguro da plataforma na integração. Formato compatível com o contrato atual: 1–80 caracteres ASCII alfanuméricos, `_` e `-`. A fila detecta colisão no contexto atual; não consegue detectar IDs repetidos de contextos descartados ou outros processos.
- `schedule(callback, delayMs)`: agenda um único timeout e retorna cancelamento síncrono. O cancelamento deve ser idempotente e não lançar; a fila também impede que exceção de limpeza deixe promessa pendente. O scheduler não pode reter callbacks cancelados indefinidamente.
- `timeoutMs`: limite técnico positivo e finito, configurado pelo adaptador.
- `maxEntries`: inteiro positivo, padrão **100 itens** por contexto, incluindo aceitos/falhos. Limite técnico local, não decisão de produto. O teto combinado é aproximadamente 100 × 64 KiB de corpos UTF-8, além do overhead de strings/estruturas. Enfileirar acima do teto retorna `QUEUE_FULL`; não descarta silenciosamente mensagens. A fila inicial não expurga itens aceitos; uma política de consumo/retirada precisa ser definida na integração, sem esvaziar intenções incertas apenas para liberar espaço.

`openContext({ sessionKey, userId, companyId, conversationId })` devolve um handle vinculado àquela ativação. `sessionKey` é um identificador **local** do ciclo de sessão, nunca token. Estes campos não são prova de permissão. Abrir contexto sempre invalida os handles anteriores, mesmo com valores iguais, limpa o estado local e resolve tentativas em andamento como `discarded`. Chamar ao trocar login, usuário, empresa ou conversa; não chamar a cada render.

O handle fornece `enqueue(text)`, `send(clientMessageId)`, `snapshot()` e `revoke()`. `signOut()` na fila invalida o contexto atual. `revoke()` deve ser chamado pela integração ao receber sinal confiável de revogação; handle antigo não pode revogar uma sessão nova. Não há descoberta de revogação, renovação de sessão nem política de autorização no cliente.

## Estados e retries

| Estado | Significado |
| --- | --- |
| `pending` | Texto válido enfileirado, sem chamada ao transporte |
| `sending` | Tentativa em andamento; chamadas simultâneas de `send` para o mesmo ID recebem a mesma Promise |
| `accepted` | Resposta validada confirma aceite do comando pelo serviço; **não significa entregue ou lido** |
| `failed` | Confirmação não obtida ou comando rejeitado, com código/mensagem públicos fixos |

Um retry explícito mantém **exatamente** o mesmo `clientMessageId`, destino e corpo, inclusive espaços, NFD e emojis completos. Não há edição de uma intenção já criada, retry automático, backoff, envio em background ou reenvio após revogação. Timeout/falha de transporte marcam `acceptanceUncertain`: o servidor pode ter aceitado a mensagem. Retry idempotente resolve essa incerteza quando o backend cumpre seu contrato; a fila sozinha não garante ausência de duplicação no servidor.

`UNAVAILABLE`, `INVALID_INPUT`, `CONFLICT` e resposta inválida bloqueiam retry desse item; `TIMEOUT`, `NETWORK` e `RETRY_LATER` permitem tentativa explícita. Erros arbitrários, detalhes e envelopes do transporte não entram no snapshot. `enqueue` usa códigos locais fixos: `INACTIVE`, `INVALID_INPUT`, `LOCAL_ERROR` ou `QUEUE_FULL`; a futura UI deve mapear esses códigos para texto público.

A resposta aceita deve corresponder a usuário, empresa, conversa e texto originais; ID, sequência e instante são validados. Somente `{ id, sequence, acceptedAt }` é copiado como recibo. O adaptador deve corresponder à Promise da requisição correta; o DTO atual do serviço não devolve `clientMessageId`. Snapshots, itens, falhas e recibos são imutáveis.

Resultados de tentativa expirada não sobrescrevem tentativa nova. Logout/troca/revogação removem os itens do estado atual e invalidam callbacks. Isso **não cancela nem desfaz um comando já enviado/aceito**, não recupera cópias de snapshots que o chamador reteve e não preserva intenção pendente após saída. Transporte real deve limitar suas próprias requisições/conexões: uma Promise que nunca conclui pode continuar retendo dados fora da fila, mesmo após timeout local. Não transportar credenciais nem registrar corpo/erro bruto em logs.

## Evidência e limites

```powershell
npm --prefix packages/chat-client test
npm --prefix packages/chat-client run typecheck
```

Testes usam Promises/timers controlados e fixtures sintéticas. Um teste integra a fila com `packages/chat/src/chat.ts::sendText`: o serviço de referência aceita o comando, a confirmação é retida, o timeout ocorre e o retry recupera o mesmo ID/linha/auditoria. Cobrem também resposta antiga durante retry, logout, empresa/conversa/usuário/sessão, revogação sinalizada, falhas seguras, recibos inválidos, Unicode integral, capacidade e snapshots imutáveis.

Validação de 2026-11-06: **13/13 testes passaram**, TypeScript estrito passou e `project:check` passou. `validation.json` registra comandos, escopo e hashes dos arquivos desta fatia. A verificação do projeto confirma consistência documental, não funcionamento do app.

Fontes: `packages/chat/README.md` e `src/chat.ts` (deduplicação por remetente/empresa/conversa/clientMessageId, autorização antes de retornar recibo); `docs/architecture/CONTRATOS-DE-IDENTIDADE.md` (isolamento/revogação/idempotência); `docs/product/EMOJIS-E-UNICODE.md` (texto íntegro); `packages/session/src/session-scope.ts` (guard de apresentação).

Não é evidência de Supabase Auth, transporte real, persistência, banco concorrente, backend seguro, notificação, entrega/leitura, Android/Hermes ou disponibilidade offline. O alinhamento Unicode do SQL e a integração autenticada continuam pendentes. Board, app e arquivos Android não foram alterados por esta fatia.

Histórico paginado local: `text-history.ts` valida páginas, cursor, timeout e contexto, limpa conteúdo após negativa e não expõe diagnósticos. 22 testes combinados (14 fila +8 histórico). Ainda sem integração Android/realtime/Auth. Ver [relatório](../../docs/testing/HISTORICO-CLIENTE-0.1.md).

Capacidade corrigida após revisão: confirmações antigas liberam espaço para envios novos, mantendo pendências/retries e snapshot limitado. O gerador de IDs deve garantir unicidade além do cache. [Regressões e limites](../../docs/testing/FILA-CAPACIDADE-0.1.md).
