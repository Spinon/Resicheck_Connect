# Referência local de chat humano e prévias

Parte independente de APP-004 e das notificações do MVP. Nenhuma conexão com serviços, credenciais, dados reais ou APK entregue. Não é backend de produção; todo estado fica em memória e os testes usam fixtures sintéticas.

Na raiz:

```powershell
npm run chat:typecheck
npm run chat:test
```

Reutiliza Node e TypeScript já instalados. O teste HTTP abre somente porta efêmera em `127.0.0.1` e encerra o servidor ao fim; nesta sessão loopback exige execução fora do sandbox restritivo. Não há servidor permanente ou endpoint de login.

## Comandos de referência

- `ensurePatientConversation`: cria/reutiliza o próprio chat por empresa e paciente já vinculado, sem escolher funcionário. Não aceita paciente/autor vindo do cliente.
- `sendText`: parser estrito, autorização atual, autoria/ID/instante/ordem atribuídos no servidor; texto imutável. Chave de repetição por remetente/empresa/conversa/clientMessageId. Repetição igual retorna mesmo ID sem nova linha/auditoria; conteúdo diferente gera conflito genérico. Revalidar acesso antes de retornar recibo, inclusive após revogação.
- `setImportant`: atribui booleano, sem toggle sujeito a retry; somente funcionário autorizado. Não decide se marcar depois gera outra notificação.
- `listMessages`: autorização por conversa, paginação por sequência de servidor e projeção explícita; não retorna clientMessageId, auditoria ou estado interno.
- `toAccessSnapshot`: compõe referências atuais do chat com conta/empresa/vínculos atuais do adaptador de autoridade. Não armazena claims antigos como autorização.
- `buildNotification`: aplica autorização e filtro, exige permissão explícita e limita campos ao nível 1–4. Somente payload mínimo, sem IDs/debug/corpo escondido. Não envia push.

## Garantias e limites da referência

Mensagens aceitas por este modelo têm apenas confirmação de **aceite no estado local do servidor de teste**. Não significam entrega, leitura, persistência durável, notificação ou recebimento em outro dispositivo. Em código de produção, não chamar esse estado de “entregue/lido”.

O store recebe snapshots internos confiáveis e retorna novo estado de forma serializada. Não implementa restrições/transações concorrentes, fila persistente, banco, idempotência durável, outbox, rede ou recuperação após processo encerrar. Um adaptador persistente deverá gravar mensagem, recibo, sequência e auditoria atomicamente, com unicidades por conversa/ordem e chave de repetição; testar corrida, rollback e perda de resposta no mecanismo real.

O texto tem orçamento **provisório de engenharia** de 2.000 grapheme clusters e 64 KiB UTF-8 independentes, sem controles C0/DEL (exceto tab/quebras de linha), vazio proibido e espaços preservados. IDs de comando têm até 80 caracteres ASCII seguros; IDs opacos reais e versões de API serão fixados no adaptador. Alteração desses limites pede testes compatíveis. Não há sanitização HTML porque isto não é HTML: consumidores deverão renderizar texto, nunca interpretar marcação como código.

Registros internos não são respostas. IDs, sequência, autor e data não são aceitos no comando de envio. Histórico não é compartilhado entre empresas. Dois papéis operacionais simultâneos na própria conversa não escolhem autoria silenciosamente: o modelo nega esse envio até decisão explícita. Indicadores principal/último, empate, edição/exclusão, reativação e IA não são implementados.

Prévia: é necessário `systemPermissionGranted === true` e filtro `all` ou `important`; ausência/invalidez suprime notificação nesta referência. Privacidade ausente/inválida cai para nível 1. Isso não define onboarding definitivo. Labels e importância são resolvidos pelo servidor, nunca pelo cliente. Limites provisórios (IDs 128, empresa 160, atendente 120, mensagem 500 graphemes; payload selecionado até3.072 bytes UTF-8) e controles inválidos suprimem o evento sem truncá-lo, mesmo no nível mínimo; esse comportamento conservador precisa ser refinado antes do push real. Nenhum nome é inventado quando não há atendente humano.

Nenhuma auditoria é durável; eventos locais contêm só IDs/ação/instante, sem texto ou chave do cliente. Segredos, logs brutos e discussões privadas nunca são payloads do produto. Retenção, criptografia, sessões revogadas, mídia privada, assinaturas realtime, abertura via notificação e lockscreen continuam pendentes.

Anexos/áudio reais, compactação, agenda, IA e conectores não fazem parte desta fatia. Ver [relatório](../../docs/testing/CHAT-LOCAL-0.1.md).

Suporte Unicode atualizado em APP-057: instalar também o pacote compartilhado com `npm ci --prefix packages/text --ignore-scripts`. A mensagem é preservada sem normalização/truncamento e surrogates inválidos são recusados. Testes gravam/releem arquivo sintético UTF-8 e exercem transporte HTTP local com decodificação fatal de UTF-8 inválido (envelope até256 KiB). Isso não conecta o app ao backend nem comprova persistência Supabase; ver `docs/testing/EMOJIS-0.1.md`.
