# Extensões planejadas: atendimento por IA e integrações

Data: 06/11/2026. Estado: proposta de arquitetura e critérios para desenvolvimento futuro. Não existem endpoints, conectores, modelo integrado ou automação em operação. A pesquisa regulatória complementar ainda deverá ser incorporada; este documento não certifica conformidade.

Definição explícita do usuário: **o software não é telemedicina**. A IA planejada é de atendimento administrativo/operacional. Demandas clínicas seguem encaminhamento humano; não há autorização de prestação médica ou decisão clínica pela automação. Conteúdo de saúde em chat/anexos continua sujeito às proteções previstas.

Decisão posterior de prioridade: **agenda, APIs de integração e IA não serão desenvolvidas na primeira fase**. Este documento reserva fronteiras para o futuro; o MVP de cadastro/vínculos/chat deve funcionar sem essas funções, provedores ou credenciais. Ver [primeira fase](../product/MVP-CHAT.md). As propostas abaixo não são pré-requisitos de implementação do chat.

## Capacidades solicitadas

- Preparar o chat para uma API generativa realizar atendimentos autonomamente, com revisão dos funcionários.
- Oferecer saída de dados para sistemas externos de agenda, como possível integração futura com ResiCheck ou agenda CPA: paciente, consulta/exame e demais dados pertinentes ao fluxo autorizado.
- Receber agendas, procedimentos, consultas e informações necessárias da empresa por API de entrada.
- Usar IA generativa para ajudar a configurar e desenvolver conectores para diferentes APIs.

ResiCheck e CPA são destinos potenciais. Não foi inspecionada sua API, confirmada a disponibilidade de endpoints ou concedido acesso nesta tarefa. Acesso do usuário a um sistema não define por si só um contrato de integração. Não copiar implementações nem coletar dados desses sistemas para antecipar o trabalho.

## Fronteiras propostas

Manter domínio e chat independentes do fornecedor de IA ou da agenda. Iniciar com interfaces pequenas na base do app/backend; não criar serviços separados apenas para satisfazer este desenho.

| Interface conceitual | Responsabilidade | Limite |
| --- | --- | --- |
| Porta de atendimento automatizado | Receber contexto mínimo autorizado e produzir proposta de resposta/ação estruturada | Não publica mensagem nem chama qualquer ferramenta por conta própria |
| Política de execução e revisão | Classificar intenção/risco, verificar autorização e decidir envio, revisão prévia ou encaminhamento | É executada fora do modelo; texto do modelo não muda regras nem permissões |
| Serviço de conversa | Persistir mensagens, autoria e resultado das ações autorizadas; alternar atendimento humano/automático | Mantém o chat utilizável sem o provedor de IA |
| Contrato canônico de integração | Representar paciente, disponibilidade, serviço e agendamento com versão e origem | Só campos necessários; fornecedor não determina o domínio inteiro |
| Porta de saída | Enviar operação/evento autorizado ao conector e acompanhar confirmação | Não equivale a reservar um horário só porque houve envio HTTP |
| Porta de entrada | Receber, autenticar, validar e aplicar atualização externa | Nenhuma mensagem externa executa SQL, código ou promoção de privilégio |
| Adaptador do sistema externo | Mapear contrato canônico para a API específica e vice-versa | Credenciais, detalhes do fornecedor e tratamento de erro ficam nesta fronteira |
| Assistente de configuração | Propor mapeamento, schema e configuração de conector com documentação e amostras sintéticas | Produção e credenciais não são ferramentas abertas ao modelo |

Nomes e assinaturas finais dependerão da stack e das APIs verificadas. Estas são fronteiras de desenho, não módulos já implementados.

## Chat automatizado e revisão humana

O objetivo de autonomia se aplica primeiro a tarefas administrativas delimitadas: esclarecer informações aprovadas pela empresa, coletar dados necessários, consultar disponibilidade e preparar/realizar operações explicitamente autorizadas pela política. A política de quais ações podem ser automáticas será definida com o produto e a pesquisa complementar.

Proposta de execução: mensagem recebida → autenticação e contexto mínimo → intenção/risco → proposta do modelo → validação determinística → ação automática permitida ou revisão prévia → registro do resultado. Campos propostos: versão da política, empresa/conversa, ator, ação, argumentos estruturados, referências de contexto, estado de revisão e correlação. Nunca aceitar `empresa`, papel, destinatário ou escopo declarado pelo modelo como autorização.

Revisão posterior pode servir para qualidade e acompanhamento de rotinas administrativas previamente liberadas. Diagnóstico, orientação clínica, interpretação de exames, indicação/alteração de tratamento e telemedicina estão fora do escopo atual. Preparação de exame de risco ou situações urgentes também não devem gerar resposta clínica autônoma: encaminhar ao humano apropriado segundo política definida, sem presumir que revisão posterior tornaria essa resposta aceitável. Informações operacionais aprovadas pela empresa devem ser distinguidas dessas decisões.

O atendente pode assumir a conversa, suspender a automação e corrigir uma resposta com histórico. Handoff precisa impedir que o bot responda enquanto o funcionário atende. Indisponibilidade, incerteza ou validação falha encaminham ao humano, sem inventar sucesso de agendamento nem repetir indefinidamente a chamada. Política de SLA e escalonamento ainda será definida.

Na fase futura, o assistente deve se apresentar como virtual e explicar que é uma camada adicional para evitar filas; um atendente pode assumir a qualquer momento com resumo do atendimento para continuidade/revisão. Não prometer tempo de resposta nem se passar por pessoa. Destinatário do resumo e participação das mensagens de IA nos indicadores de atendente continuam em aberto; autoria automática será distinta de funcionário.

Modelo recebe somente contexto necessário da empresa e conversa autorizadas. Sem acesso geral ao banco, documentos, outras conversas ou segredos. Conteúdo de chat, arquivo e documentação externa é dado não confiável; não pode instruir a troca de permissões, exfiltração ou chamadas arbitrárias. Downloads e ferramentas são mediados no servidor, com escopos, limites e destinos permitidos. Autorização é reavaliada na execução e não herdada da geração do rascunho.

Auditoria distingue mensagem humana, proposta da IA, envio automático, revisão, alteração e ação externa; registra política/modelo/configuração e IDs necessários sem copiar indiscriminadamente conteúdo clínico para logs. Retenção, fornecedor, uso de dados para treinamento, localização do processamento e comunicação ao paciente são decisões pendentes de avaliação.

## Contratos de entrada e saída

Propor contrato versionado, como uma futura família `v1`, com esquema explícito. Cada operação carrega empresa/instalação autorizada, ID externo e interno quando disponíveis, revisão, origem, data/hora com fuso, ID de correlação e chave de idempotência ou ID único do evento. O contrato deve distinguir payload de paciente, catálogo de serviços, disponibilidade e agendamento. Nomes definitivos, protocolos e formatos serão escolhidos depois; não inventar rotas do ResiCheck/CPA.

### Autorização e dados

- Cada conector é instalado para uma empresa e destino determinados, por usuário autorizado. Leitura e escrita são escopos independentes: pacientes, disponibilidade, serviços e agendamentos. Chat e documentos não entram no pacote por padrão.
- Separar dados necessários à marcação (identificação mínima, contato quando necessário, serviço/procedimento, horário e recursos) de documentos e conteúdo clínico. “Demais dados pertinentes” exige lista explícita de campos, finalidade e permissão, sem exportação irrestrita.
- IDs de paciente no sistema externo são mapeados por empresa e conector; CPF não deve ser enviado ou usado para fusão automática apenas por conveniência. Resolver identidade ambígua antes de atualizar cadastro.
- Credenciais ficam no backend em armazenamento apropriado, por instalação e escopo, com rotação e revogação. Não embutir no APK, não enviar ao modelo e não registrar em evidências ou logs.
- A entrada autentica a origem e valida assinatura/credencial conforme protocolo escolhido, prazo, repetição e tamanho. Isolamento e autorização são rechecados no servidor. Configuração de destinos deve impedir chamadas arbitrárias a redes internas ou envio para destino fora do autorizado.

### Mapeamento e integridade

- Mapear códigos de procedimentos/consultas, profissionais, unidades, duração, fuso e estados por configuração versionada. Não adivinhar equivalência clínica pelo nome do serviço.
- Validar esquema, tipos, limites e regras do domínio antes de aplicar a operação. Campo ausente é diferente de exclusão explícita. Lote inválido recebe resultado por item ou rejeição consistente definida em contrato.
- Reenvio da mesma operação não duplica paciente, agendamento ou mensagem. Mesma chave com payload divergente produz conflito tratável. Na entrada, evento repetido ou fora de ordem não reverte estado novo.
- Manter trilha de entrega e recepção, retries limitados, backoff e fila de falhas para revisão. Timeout não prova falha: consultar/reconciliar antes de repetir efeito não idempotente.
- Não usar última gravação indiscriminadamente. Definir quem é fonte de verdade de cada entidade/campo. Para agenda externa, intenção enviada e confirmação externa são estados distintos; reserva depende do sistema responsável.
- Evitar ciclos entrada→saída→entrada por identificação de origem/correlação. Disponibilidade importada pode envelhecer: concorrência e reserva definitiva continuam exigindo confirmação autoritativa.
- Alterações incompatíveis pedem nova versão, migração e teste de contrato. Desabilitar um conector deve preservar histórico, permitir reconciliação e interromper novas trocas.

## IA para configurar conectores

Fluxo proposto: pessoa autorizada fornece documentação da API e exemplos sintéticos → IA sugere mapeamento/configuração ou código de adaptador → validação de esquema e revisão → testes de contrato e autorização em simulador/ambiente isolado → ativação autorizada e gradual.

Não publicar ou executar código gerado diretamente em produção. Propostas não recebem segredos, acesso de administrador ao banco ou egress irrestrito. Documentação da API pode conter instruções maliciosas e deve ser tratada como fonte de dados. Referências a segredos são resolvidas fora do modelo no runtime. Quando mapeamento for ambíguo, apontar o campo e pedir decisão em vez de escolher semântica de procedimento clínico.

Versionar contrato, adaptador e mapeamento; guardar diff, resultado dos testes e responsável pela aprovação. Começar por um conector determinístico antes de generalizar a geração assistida por IA. Configuração assistida não elimina a manutenção e os testes próprios de cada fornecedor.

## Ordem e decisões pendentes

Preparar somente fronteiras durante a primeira fase de chat; agenda e extensões serão desenvolvidas depois de o app funcionar sem elas. APP-005 e APP-012 a APP-015 ficam posteriores ao MVP; este documento não cria outra fila nem bloqueia chat pela falta dessas capacidades.

Pendências: escopo administrativo autônomo; revisão prévia/posterior por intenção; confirmação do paciente em operações; fornecedor e política de dados de IA; contratos e autorização das agendas externas; fonte de verdade; protocolo de entrada/saída; conjuntos mínimos de dados; estado de reserva; regras de conflito; operação e limites de custo; pesquisa regulatória complementar. Nada disso está ativado por este planejamento.
