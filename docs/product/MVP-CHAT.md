# Primeira fase: cadastro, vínculo e chat

Decisão explícita do usuário em 06/11/2026, posterior ao plano de agenda e extensões. Estado: planejamento; nenhuma capacidade está implementada por este documento.

## Entrega da primeira fase

ResiCheck Connect Android com conta individual, cadastro/verificação de empresa, convite e aceite de funcionários, vínculo imediato de pacientes e chat empresa-paciente com anexos privados. Cada funcionário tem inicialmente uma empresa; pacientes podem ter várias, escolhem contexto após login ou vinculam nova.

Notificações e suas configurações fazem parte do produto de chat, conforme [NOTIFICACOES.md](NOTIFICACOES.md), sem depender das extensões adiadas. Negar permissão de notificação não impede acesso ao chat.

Anexos incluem proposta de [compactação de imagens com prévia e opção de original](ANEXOS-E-IMAGENS.md), sujeita a pesquisa e testes de legibilidade. Não recomprimir PDF assinado ou modificar o original do usuário.

Todos os funcionários aprovados e ativos da empresa podem ver **todas as conversas dos pacientes daquela empresa**, inclusive antes de terem enviado mensagem. A autorização de leitura não depende de atribuição a um atendente específico. Funcionário pendente, recusado, revogado ou de outra empresa não acessa. Isso não dá acesso a dados exclusivos de gestor/ADM ou a documentos fora das conversas autorizadas. Gestor sem papel operacional não herda acesso ao conteúdo apenas por administrar a empresa.

O paciente se vincula imediatamente por link ou busca, sem aguardar aceite da empresa. Mantêm-se autenticação e verificações da conta já definidas, sem criar uma fila de aprovação de vínculo. Acesso do paciente: nome, endereço e telefones públicos da empresa e **somente seu próprio chat**, onde envia mensagens/anexos e aguarda resposta. Não recebe lista de funcionários, outros pacientes, conversas alheias, registros internos, logs, configuração de gestor ou dados privados da empresa. Indicadores de atendimento abaixo são destinados à equipe; exibição adicional ao paciente não está decidida.

## Indicadores para a equipe

- **Atendente principal:** funcionário que enviou mais mensagens naquela conversa. É um indicador derivado do histórico, não dono exclusivo da conversa nem regra de autorização.
- **Atendente da última mensagem:** identificar o funcionário autor da mensagem pertinente mais recente, sem atribuir mensagens do paciente a um funcionário. A regra de exibição quando a última mensagem geral é do paciente precisa ser definida.

Decisões ainda necessárias antes de implementar os indicadores: desempate no maior número de mensagens; janela de contagem (histórico inteiro ou período); o que conta como mensagem (texto, anexo, aviso de sistema, edição/exclusão); comportamento sem nenhuma mensagem de funcionário; funcionário desligado e preservação de autoria; critério de ordenação no servidor para envios simultâneos; texto apresentado quando o paciente escreveu por último. Não inventar empate por nome, horário ou prioridade nesta etapa.

Na fase futura de IA, mensagens automáticas precisam ter autoria própria e não podem contar silenciosamente como envio de funcionário. Como incluí-las nos indicadores é decisão futura. Nenhum indicador é uma atribuição permanente ou limita o acesso dos demais funcionários aprovados.

## Fora da primeira fase

Não desenvolver agenda local, reserva de horário, importação de disponibilidade/procedimentos, conectores/API externa de entrada/saída, atendimento generativo ou configuração de conector por IA. O chat deve funcionar e ser testado sem provedores, credenciais, tabelas ou serviços dessas extensões.

Preparar somente separação de domínio, contexto de empresa, autoria e portas de adaptação que comportem os dados e interações futuros. Não criar telas de agenda vazias ou executar chamadas externas para simular integração. APIs internas necessárias à autenticação, autorização e persistência do chat continuam necessárias; a postergação é das integrações externas e da agenda/IA.

Telemedicina permanece fora do escopo. O backlog futuro é preservado, sem bloquear o MVP pela falta dessas funções. Os requisitos de proteção de dados e permissões do chat continuam aplicáveis.

## Assistente virtual — proposta para depois do app funcional

Quando essa fase for autorizada, o assistente virtual deve se identificar e explicar que é uma camada adicional de atendimento para evitar filas. Não se apresentar como funcionário humano, prometer fim das filas ou prazo não garantido. Um atendente pode assumir a qualquer momento, com resumo do atendimento para continuidade e revisão. Definir destinatário e conteúdo do resumo; respeitar a autorização da conversa.

Handoff futuro deve suspender respostas automáticas concorrentes, preservar autoria e permitir correção do resumo pela equipe. Dados enviados ao modelo continuam mínimos e autorizados, sem decisões clínicas ou acesso irrestrito. Esta descrição não implementa nem ativa assistente ou resumo automático.
