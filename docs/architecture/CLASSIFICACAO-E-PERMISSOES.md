# Informação por papel, empresa e vínculo

Requisito prioritário definido pelo usuário em 06/11/2026: informações exclusivas de gestor, funcionário, paciente ou ADM da plataforma não podem aparecer a outros papéis. Segurança deve ser aplicada no backend em cada canal, além da interface. Estado: diretriz e critérios; nenhum controle está implementado.

## Classificação proposta

| Classe de informação | Destinatário permitido | Limite |
| --- | --- | --- |
| Identificação pública da empresa | Usuário buscando empresa ou abrindo convite | Somente campos públicos aprovados; nunca acervo, CPFs ou lista de pacientes |
| Perfil e preferências pessoais | Titular autenticado; operação específica autorizada quando necessária | CPF e evidências de identidade minimizados e mascarados; sem busca pública por pessoa |
| Gestão empresarial | Gestor autorizado da empresa | Cadastro, equipe, vínculos e configuração global não ficam disponíveis ao paciente ou funcionário sem permissão específica |
| Operação da equipe | Funcionário aprovado e ativo da empresa | Todos veem todas as conversas dos pacientes da própria empresa; atribuição e indicadores não limitam leitura. Pendente/revogado não acessa; agenda fica para depois |
| Conversa e documentos do paciente | Paciente titular e todos os funcionários aprovados da empresa de contexto | Paciente acessa só o próprio chat/anexos e dados públicos permitidos da empresa; outra empresa, outro paciente e gestor sem papel operacional não recebem conteúdo automaticamente |
| Administração da plataforma | Operador com privilégio explícito para a operação | Metadados necessários, auditoria e logs sanitizados; não recebe conteúdo clínico por padrão |
| Diagnóstico técnico restrito | Operação/engenharia autorizada no ambiente adequado | Stack trace, detalhes internos e logs brutos nunca aparecem a usuários comuns; privilégio de ADM não abre indiscriminadamente todos os ambientes |
| Segredos e credenciais | Somente serviços e operadores estritamente autorizados | Nenhum papel público, app cliente, resposta de API, log ou modelo de IA recebe segredos |
| Discussões privadas de desenvolvimento do projeto | Contexto privado de trabalho autorizado | Não são conteúdo do app; não importar para help, respostas de chat/IA, seeds, mensagens de erro ou analytics |

A matriz detalhada deverá discriminar por recurso: criar, ler, listar/buscar, atualizar, excluir, exportar, assinar eventos e compartilhar. Intersecção de papel + vínculo ativo + empresa + objeto + finalidade é obrigatória; um rótulo de papel isolado não basta. Negar por padrão, explicitando exceções. O gestor da empresa e o ADM da plataforma são papéis diferentes; acúmulo de funções não deve promover acesso silenciosamente.

## Mensagens de erro e suporte

Produção mostra mensagem curta, segura e útil para corrigir a situação: falha de rede, necessidade de autenticar novamente ou código opaco de atendimento. Não devolver exception, stack, SQL, caminho local, payload de outro usuário, nomes de serviços internos, segredo ou conversa privada do projeto. O código de correlação não é um token de autorização e não contém CPF, paciente ou empresa.

Detalhes técnicos sanitizados seguem para canal restrito, segregado por ambiente e função, com retenção e auditoria. Dados de produção não alimentam desenvolvimento/testes. Separar logs de segurança/auditoria de logs de diagnóstico; quem pode consultar um não recebe todos automaticamente. Crash reports e SDKs também respeitam essa política.

## Canais cobertos

Aplicar as mesmas decisões no servidor para API, realtime, storage, miniaturas, busca, exportação, relatórios, jobs, notificações/push, erros, suporte e conectores externos. Não confiar em ocultar menus, tenant enviado pelo cliente ou campos removidos só na tela. Evitar buscar dados proibidos para depois esconder no cliente.

O acesso excepcional do ADM a conteúdo sensível, quando houver necessidade legítima definida, terá permissão própria, finalidade, justificativa, duração, registro e revisão. Não implementar leitura irrestrita de conversas, documentos ou personificação silenciosa como conveniência de suporte.

## Cardinalidade e troca de contexto

Funcionário tem inicialmente uma única empresa; proteger a regra no servidor inclusive em convites/pedidos concorrentes e no aceite. Paciente pode ter várias empresas e escolhe contexto após login ou vincula outra. Ao trocar, cancelar carregamentos/assinaturas do contexto anterior, separar cache e rascunhos e reavaliar a autorização de ações em curso. Nenhuma unificação de histórico clínico entre empresas está autorizada.

## Testes necessários antes de dados reais

Usar sentinelas sintéticas exclusivas por empresa, papel e ambiente e tentar recuperar cada uma por interface, endpoints diretos, erros provocados, eventos, push e exportações. Cobrir funcionário pendente, ativo e revogado; gestor; paciente A1/A2 em duas empresas; ADM com e sem privilégio específico; troca de sessão/contexto; usuário anônimo. Verificar corpo, cabeçalhos e metadados, não apenas tela.

Provocar falhas controladas e confirmar que detalhes técnicos aparecem somente no destino restrito autorizado. Inserir sentinela sintética de desenvolvimento para provar que ela não chega a respostas públicas ou à IA de atendimento. Logs de testes e relatório também devem permanecer sanitizados. Esses testes não foram executados nesta preparação.
