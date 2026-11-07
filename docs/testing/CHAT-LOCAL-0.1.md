# Chat e notificações: referência local 0.1

06/11/2026. Implementação isolada em `packages/chat`, posterior ao APK demonstrativo entregue. Não altera a versão instalada, o arquivo no Drive nem seu hash. Sem serviços, credenciais, permissões do sistema ou dados reais; sem nova publicação pública.

**Resultado:** TypeScript estrito e 22 testes passaram: 11 de chat, 10 de prévias e uma integração HTTP temporária em loopback. TAP em `output/chat-reference/result.tap`. A suíte de contratos de acesso anterior contém outros 18 testes; não somar como testes Android.

## Evidência

| Área | Exercitado localmente |
| --- | --- |
| Conversa | Paciente vinculado cria/reutiliza um chat por empresa, sem escolher atendente; funcionário não cria chat em nome de paciente com parâmetro arbitrário |
| Autoria | ID, remetente, papel, sequência e instante do servidor; campos adicionais do cliente rejeitados; ambiguidade de dois papéis operacionais nega até decisão |
| Retry | Mesma chave/contexto e conteúdo retornam mesmo ID sem nova mensagem/auditoria; alteração de conteúdo conflita; revogação é verificada antes de devolver recibo |
| Isolamento | Outro paciente, outra empresa, pendente, revogado, gestor sem papel operacional e ADM não enviam/listam conteúdo; dois funcionários aprovados podem responder |
| Ordem/paginação | Sequência por conversa, inclusive timestamps iguais; páginas sem duplicação no conjunto estático; limite até 100 e cursor válido; sem misturar empresa |
| Conteúdo | Limite provisório Unicode, vazio/controles proibidos; espaços e quebras preservados; DTO não contém chave do cliente; auditoria sem texto |
| Falhas | Colisão de ID/tempo inválido não cria mutação parcial; respostas externas genéricas; parser rejeita campos extras, IDs inválidos e JSON malformado no teste HTTP |
| Importância | Somente equipe autorizada atribui true/false; repetição não alterna indevidamente nem duplica auditoria; não cria política de renotificação |
| Prévia | Quatro níveis exatos, default seguro, permissão explícita, filtro all/important, campos mínimos sem envelope/IDs ocultos; ausência de atendente não inventa nome |
| Revogação/push | Autoridade atual por mensagem e empresa; principal antigo não restaura acesso; paciente multivínculo só recebe contexto próprio; rejeita prefs/eventos inválidos e limites excedidos |
| HTTP local | Sessões sintéticas resolvidas pelo servidor; envio, retry, leitura, importância, projeção de prévia e revogação encadeados; sem serializar store/auditoria/claims |

O teste HTTP usa `127.0.0.1` e porta efêmera, encerrados ao fim. Sessões fixas de fixture **não são login**; não expor esse adaptador. Nenhum pacote novo instalado.

## Pendências reais

Não há autenticação, persistência, concorrência de banco, eventos/arquivos/push reais, criptografia/retencão, processamento de anexos, áudio ou integração Android. Somente o aceite em memória é demonstrado: não comprova entrega/leitura ou recuperação após reiniciar o servidor. Parser de comando e projeção são parte da fronteira; não dispensam limites de transporte, mecanismos do banco e revisão do adaptador.

Dependem da coordenação: escolher backend/adaptadores; métodos de identidade e representação; regras de convite; acúmulo de papéis; políticas de importância/renotificação; preferências por usuário/dispositivo; indicadores de atendente. Ausência dessas decisões não bloqueou a referência local, mas não autoriza ativar serviços ou decidir silenciosamente as regras pendentes.

APP-004 continua em andamento: esta fatia comprova contratos locais de texto, não chat operacional ou anexos privados. Segurança de produção e requisitos regulatórios não foram marcados como concluídos.
