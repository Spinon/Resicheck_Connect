# Menu e opção de apagar — requisito registrado em17/11/2026

Lucas pediu: segurar mensagem, áudio ou imagem abre menu com opção de apagar. Registrado como APP-262, sem interromper APP-261/260 (teclado, recibos e crash) nem implementar exclusão nesta etapa.

Hoje as bolhas conectadas de texto/áudio não têm menu de pressão longa. Há menu na linha da inbox para marcar conversa como lida; isso não apaga mensagens. O laboratório de imagens permite remover arquivos locais que não foram enviados; isso não é exclusão do chat. Imagens conectadas continuam na APP-052.

Conferência remota somente de metadados: public.messages existe com RLS; authenticated e anon não têm DELETE; nenhuma política ALL/DELETE na tabela e nenhuma função pública com nome de excluir/remover mensagem foi encontrada. Registro: apps/mobile/message-delete-existing-readonly.json. Isso descreve a superfície pública atual consultada; não é auditoria de todas as funções privadas do banco. Nenhuma permissão ou dado foi alterado por essa conferência.

Antes da implementação, faltam decisões de produto: apagar somente para a própria conta/dispositivo ou retirar para todos? Quem pode retirar para todos (autor, gestão ou outro papel)? Há prazo ou condições para retirar? Deve aparecer um aviso de mensagem retirada? Não presumir essas respostas nem apresentar exclusão definitiva como reversível.

Proposta de engenharia para a frente: menu contextual acessível em app e web, com rótulo que explique o alcance escolhido e confirmação proporcional; uma operação autorizada no backend, isolada por conta/empresa/conversa, com histórico/auditoria mínimo da ação e idempotência. Planejar a invalidação do cache e sincronização em outros dispositivos; referências de áudio/imagem e objetos privados precisam de política própria, sem apagar arquivos compartilhados ou pendentes por acidente. Limpar cache não substitui apagar uma mensagem. Imagens entram quando estiverem disponíveis; não anunciar esse envio como concluído.

Nenhuma mensagem ou mídia apagada, nenhuma função/grant/RLS criada, nenhum APK/publicação por este requisito.


## Definição posterior de Lucas — substitui a proposta inicial de menu

Prioridade imediata depois do refresh APP-265, antes de retomar imagens. Segurar uma mensagem entra em modo de seleção, com barra superior contextual, seleção múltipla e alternativa acessível. A barra prevê Remover, Editar, Encaminhar e Responder, mostrando apenas ações compatíveis com conteúdo e autorização. Responder também terá gesto lateral, sem conflito com a rolagem e com alternativa sem gesto. Editar/encaminhar/responder não estão implementados nem devem bloquear a primeira fatia de remoção.

**Remover não apaga conteúdo do banco nem dos logs.** Lucas definiu as duas opções: remover para mim e remover para todos. A projeção mostra um balão de mensagem removida. Texto, áudio e imagens devem respeitar a ocultação; originais/auditoria ficam preservados. Não perguntar novamente quais alcances ele deseja. Não executar remoções sobre conversas existentes como prova: usar mensagens sintéticas identificadas da própria regressão.

A engenharia precisa verificar todas as rotas reais de leitura, reprodução, cache e acesso direto antes de escolher a migração. Esconder só a bolha no cliente não atende ao requisito. Tombstones e máscaras por espectador devem sobreviver a sincronização, falhas, replay e reabertura; conteúdo pendente de envio e arquivos fonte não são exclusão do chat. Cópias externas já obtidas não podem ser recolhidas por uma alteração no servidor.

Regra mínima de autorização proposta para implementação: usuário com acesso atual pode ocultar da própria exibição uma mensagem que consegue acessar; retirar para todos exige ser o autor e continuar autorizado na conversa. Ser gestor ou funcionário não concede, por si só, permissão para retirar mensagens de outros autores. Não criar prazo arbitrário nem moderação geral. Caso o produto precise disso, registrar separadamente; não bloquear a remoção restrita por uma permissão mais ampla.

Estado: requisitos atualizados; nenhuma tabela, grant, política, exclusão ou publicação aplicada por esta atualização. A conferência histórica acima continua sendo somente leitura, não uma validação do futuro desenho.
