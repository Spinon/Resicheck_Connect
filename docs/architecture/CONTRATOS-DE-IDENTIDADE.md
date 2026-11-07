# Contratos de identidade e vínculos

Proposta para a fatia local de APP-003 e APP-007 a APP-010, em 06/11/2026. Complementa [fluxos](../product/FLUXOS-E-IDENTIDADE.md) e [classificação e permissões](CLASSIFICACAO-E-PERMISSOES.md). Não escolhe backend, provedor de identidade ou método de comprovação. Contratos e testes sintéticos não demonstram autenticação, autorização distribuída ou segurança de produção.

## Fronteiras e estados independentes

| Conceito | Contrato | Não concede |
| --- | --- | --- |
| Conta individual | Identificador interno opaco e estável; CPF normalizado tratado como dado restrito para unicidade e contestação | Papel empresarial ou acesso a conversas |
| Formato de CPF/CNPJ | Resultado da validação local de formato/dígitos, separado da entrada original | Existência cadastral, identidade ou representação |
| Consulta cadastral | Resultado, origem, instante e referência de evidência; estados como não consultado, compatível, divergente ou indisponível | Prova de que a pessoa da sessão é titular ou representante |
| Contato confirmado | Controle de um canal pelo método escolhido, com instante e validade | Titularidade de CPF ou poder sobre CNPJ |
| Identidade confirmada | Resultado de método autorizado que associa pessoa e identidade declarada; evidência restrita, validade e reavaliação | Vínculo ativo ou privilégio administrativo |
| Empresa | ID interno, CNPJ normalizado como string de 14 posições, dados públicos permitidos e estado de ativação | Representação do usuário que informou o CNPJ |
| Representação empresarial | Evidência de poderes de uma pessoa sobre uma empresa; estado e validade próprios | Operação de chat ou administração da plataforma por padrão |

Não reduzir essas dimensões a `verified: true`. CPF/CNPJ não são senha, chave pública de busca de pessoas nem identificador de URL. Preservar zeros iniciais; CNPJ admite formato numérico e alfanumérico conforme regra oficial já registrada no projeto. Esta fatia não consulta identificadores reais. O resultado de consulta indisponível não é confirmação nem acusação de fraude.

Uma conta por CPF é uma regra de cadastro, não prova de titularidade: uma reivindicação indevida não pode bloquear permanentemente o titular. Normalização, unicidade e recuperação/contestação precisam de política e transação próprias; mensagens públicas não revelam se um CPF está cadastrado.

## Principal autenticado e decisão de acesso

O adaptador de autenticação no servidor valida a sessão e produz um principal interno imutável. Contrato mínimo proposto: `subjectId`, `sessionId`, `issuedAt`, `expiresAt` e contexto de autenticação necessário à operação. O principal não é aceito do JSON, cabeçalho arbitrário ou armazenamento do cliente. Em teste local, o adaptador sintético é explicitamente substituído pelo teste; não é endpoint público nem autenticador de produção.

O cliente pode solicitar uma empresa de contexto e uma ação. O servidor resolve o recurso e sua empresa real, obtém conta/sessão/vínculos atuais e decide a interseção **ator + ação + objeto + empresa + estado do vínculo + finalidade**. `role`, `userId`, `approved`, `companyId` ou `patientId` enviados pelo cliente não elevam privilégio nem mudam a titularidade. Claims antigos não substituem a checagem de revogação e do vínculo atual.

| Identidade/permissão efetiva | Limite obrigatório |
| --- | --- |
| Paciente com vínculo ativo | Dados públicos permitidos da empresa e próprio chat/anexos; nunca conversa de outro paciente |
| Funcionário ativo e autorizado | Todas as conversas dos pacientes da sua única empresa; não de outra empresa |
| Funcionário pendente ou revogado | Sem chats, pacientes, anexos ou assinaturas operacionais |
| Gestor com representação/permissão de gestão ativa | Operações de gestão autorizadas da sua empresa; conteúdo do chat exige papel operacional explícito |
| ADM da plataforma | Operações administrativas explicitamente concedidas; sem acesso automático a conteúdo sensível ou personificação |

Gestor e ADM são distintos. Concessão de ADM não existe no cadastro público. Papel de paciente não se transforma em funcionário por parâmetro; acúmulo de papéis não promove permissões silenciosamente. Política de acúmulo ainda será definida.

Erros externos têm códigos seguros, por exemplo `AUTH_REQUIRED`, `NOT_ALLOWED` e `CONFLICT`, com mensagem genérica e correlação opaca. Não incluir CPF, existência de conta, token, stack ou detalhes de outro vínculo. Em recursos privados, não distinguir existência de recurso de ausência de autorização para um ator sem acesso. Auditoria restrita registra ator interno, ação, alvo interno, resultado e instante, sem conteúdo de chat, documentos, tokens ou identificadores completos.

## Comandos e transições

Todos os comandos abaixo recebem o principal pelo canal interno do servidor e aceitam apenas os dados necessários. Nomes são contratos conceituais, não rotas já implementadas.

| Comando | Pré-condição e resultado |
| --- | --- |
| Cadastrar empresa | Conta autenticada; cadastro e representação ficam separados. Existência de CNPJ ou coincidência de nomes não ativa gestão |
| Emitir convite de funcionário | Gestor atualmente autorizado na empresa; servidor fixa empresa e papel. Link opaco não expõe CPF, pacientes ou dados de saúde |
| Resgatar convite de funcionário | Conta autenticada e apta pelo método definido; convite íntegro, válido e utilizável. Cria vínculo **ativo diretamente**, sem segunda aprovação do gestor |
| Solicitar vínculo sem convite | Conta autenticada solicita empresa; cria pedido **pendente**, sem acesso operacional |
| Decidir pedido | Gestor autorizado da mesma empresa aprova ou recusa pedido pendente. Aprovação cria vínculo ativo respeitando exclusividade |
| Vincular paciente por link ou busca | Conta autenticada e apta; destino empresarial válido. Vínculo **imediato**, sem aprovação empresarial; repetição não duplica vínculo/chat |
| Revogar vínculo | Ator com permissão explícita; encerra acesso e preserva trilha. Não transfere histórico para outra empresa |

Estados de pedido: pendente → aprovado, recusado ou cancelado. Estados de vínculo: ativo → revogado. Reativação ou transferência exigem comando/política explícitos, sem reutilizar silenciosamente um aceite antigo. Aceite de pedido já recusado/revogado não pode ressuscitar acesso por corrida.

Cardinalidades obrigatórias: no máximo **um vínculo ativo de funcionário por conta** em toda a plataforma; paciente pode ter vínculos com várias empresas, com unicidade por conta/empresa/papel. Pedidos pendentes não concedem acesso. Se eles também reservam exclusividade é decisão em aberto; o estado pendente nunca autoriza dois vínculos ativos futuros.

## Transação, revogação e repetição

1. Autorização e pré-condições são revalidadas no instante efetivo da alteração. Aceite de pedido, ativação de vínculo e consumo de convite aplicável pertencem à mesma transação; uma falha desfaz o conjunto.
2. Exclusividade de funcionário e unicidade de paciente precisam de restrição persistente ou mecanismo transacional equivalente, não apenas consulta seguida de inserção. Convites ou aprovações concorrentes para empresas distintas resultam em no máximo um sucesso de ativação; conflito não revela a empresa alheia.
3. Revogação de convite ou de autoridade do emissor concorrente ao resgate deve ter ordem consistente: se a revogação prevalecer antes do commit, o resgate não ativa vínculo. Autoridade de quem aprova também é revalidada no commit.
4. Repetição da mesma intenção usa idempotência associada ao ator, comando e conteúdo canônico. Mesma chave com conteúdo diferente não reaplica o comando. Não consumir convite nem criar auditoria de transição duplicada após resposta perdida; tentativas podem ter registro próprio sanitizado.
5. Política de prazo, destinatário e limite de uso do convite permanece pendente. O mecanismo deve suportar esses controles sem converter convite válido em pedido aguardando segunda aprovação. Uso único, quando escolhido, exige consumo atômico.
6. Cada operação e entrega de evento reavalia a autorização vigente. Revogar vínculo invalida permissões derivadas, encerra assinaturas e impede novas entregas/jobs/push de seu escopo; não é preciso apagar a conta inteira de quem continua paciente em outras empresas. Revogar sessão/conta é uma operação distinta.
7. Respostas ou arquivos já entregues não podem ser recuperados do destinatário. Cache local deve ser segregado e invalidado no contexto revogado; TTL de links assinados, revogação imediata de downloads e tratamento de ações em curso exigem mecanismo/teste no backend escolhido. Não prometer isso com modelo em memória.

Ao trocar empresa, cancelar carregamentos e assinaturas anteriores e separar cache, anexos e rascunhos por ator/empresa/conversa. O servidor ignora contexto antigo como fonte de autoridade. Nenhum histórico é unificado entre empresas.

## Casos a testar com dados sintéticos

| Caso | Resultado esperado |
| --- | --- |
| Formato aceito; cadastro não consultado; contato confirmado | Identidade e representação continuam não comprovadas; sem promoção de papel |
| Cliente falsifica papel, titular, aprovação ou empresa | Servidor ignora a alegação ou rejeita a entrada; nenhum acesso adicional |
| Principal ausente, expirado, de sessão revogada ou sujeito diferente | Rejeição; sem conteúdo sensível na resposta/erro |
| Gestor/ADM sem papel operacional tenta ler chat | Negado; gestão/administração não implica leitura |
| Convite válido x expirado/revogado/adulterado | Válido ativa diretamente; demais não ativam; nenhuma segunda aprovação no caminho válido |
| Busca sem convite e tentativa de acesso antes do aceite | Pedido pendente; todas as rotas privadas negadas |
| Dois convites/aceites simultâneos de funcionário para empresas distintas | No máximo um vínculo ativo, inclusive após falha e repetição |
| Resgate simultâneo à revogação; aprovação por gestor revogado | Resultado consistente com a ordem transacional; nenhuma autorização antiga prevalece após revogação efetiva |
| Paciente vincula duas empresas e repete uma vinculação | Dois contextos isolados, sem duplicidade no mesmo contexto e sem escolher funcionário |
| Paciente altera ID da conversa ou funcionário troca tenant | Negado por titularidade/empresa, inclusive lista, anexo, evento e exportação |
| Comando repetido após perda da resposta; mesma chave com payload alterado | Mesmo resultado da intenção original ou conflito seguro; nenhuma ativação dupla |
| Vínculo revogado com sessão ainda válida | Sessão não restaura o vínculo; chat/eventos/anexos/jobs/push deixam de autorizar aquele escopo |
| Troca de empresa ou logout durante carregamento | Resposta antiga não aparece no novo contexto; rascunho/cache não cruza ator ou empresa |
| Falha de armazenamento entre ativação e consumo do convite | Rollback sem vínculo parcial nem convite consumido sem ativação |

Testes locais podem demonstrar invariantes do modelo e contratos. Concorrência real, restrições persistentes, autenticador, sessões, API, realtime, storage e revogação distribuída exigem testes de integração no mecanismo escolhido antes de dados reais.

## Decisões em aberto

- Métodos/níveis de identidade por papel, recuperação/contestação, menores e responsáveis; provedor, custos, guarda e acesso a evidências.
- Critério de ativação de empresa e representação; CNPJ duplicado, filiais, disputa, substituição de gestor e poderes delegados.
- Prazo, uso máximo, destinatário e política de convite comprometido; pedidos simultâneos, transferência de funcionário e eventual acúmulo de papéis.
- Backend, transações/restrições, armazenamento mínimo de CPF/CNPJ, autenticador e estratégia de revogação/cache/downloads; concessão e revisão de privilégios ADM.

Essas pendências não autorizam afrouxar as invariantes já definidas. Até a decisão e integração correspondentes, o comportamento é local/sintético e deve ser apresentado assim.
