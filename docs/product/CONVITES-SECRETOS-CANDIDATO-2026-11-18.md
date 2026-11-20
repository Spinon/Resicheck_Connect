# Convites secretos — candidato local, 18/11/2026

## Decisão aplicada ao candidato
Orientação recebida de Lucas pelo coordenador: links para funcionário e cliente, secretos, de uso único, revogáveis e com sete dias por padrão; aceitar exige login. Não presumir que o portador seja uma pessoa previamente identificada. Sem implantação, ativação ou publicação.

O primeiro usuário autenticado e elegível que consumir o segredo fica vinculado. Uma repetição do mesmo usuário apenas confirma a mesma operação, sem duplicar vínculo ou evento. Se alguém encaminhar ou interceptar o link antes do consumo, outro portador elegível pode usá-lo primeiro: login identifica a conta que aceitou, não prova que ela era o destinatário pretendido. A confirmação visual da empresa e da conta deve existir na integração normal futura.

## Implementação
- SQL separado: supabase/candidates/membership-secret-links/links.LOCAL.sql. Não altera a fundação nem os candidatos históricos.
- Três tabelas privadas: política, convites com digest SHA-256 e eventos sem segredo/conteúdo.
- Três RPCs públicos SECURITY INVOKER: issue_membership_secret_link_v1, accept_membership_secret_link_v1 e revoke_membership_secret_link_v1. Implementações privilegiadas ficam privadas, com search_path vazio. Nenhum EXECUTE operacional é concedido pela fonte candidata.
- Três pontes novas e restritas mantêm o owner confiável da fundação: checar sessão atual/relógio, checar o emissor, aplicar o efeito exato do convite. Somente o runtime NOLOGIN executa essas pontes. Esse owner e os grants precisam ser revisados na baseline gerenciada antes de qualquer promoção; o candidato ainda não é instalador gerenciado.
- Runtime local NOLOGIN sem SUPERUSER/BYPASSRLS e sem SELECT de accounts ou memberships. Não recebe Auth admin nem credencial de usuário.
- Gestor ativo da empresa emite funcionário. O aceite usa a regra existente de entrada direta e uma empresa por funcionário, sem segunda aprovação.
- Funcionário ativo da empresa emite cliente. Gestor sem papel operacional não herda essa permissão. O aceite usa link_patient para o próprio usuário, cria/reutiliza sua conversa e preserva multivínculo de cliente.
- Conta/sessão/emissor/empresa/prazo são rechecados no servidor após locks/efeitos. Tipo e empresa esperados precisam coincidir; parâmetros e user_metadata não concedem papel.
- Conta do emissor serializa a admissão da quota; consumo bloqueia contas e o próprio convite. Quem perde a disputa de consumo não ganha vínculo.
- Revogar o link não revoga um vínculo já aceito e não apaga originais/eventos. O próprio emissor autorizado ou gestor atual da empresa pode revogar; gestor de outra empresa não pode.
- Campos de configuração são privados. Emissão e aceite iniciam OFF; revogação pode ser usada durante um fechamento, com autorização atual e sem reabrir o gate.

## Parâmetros configuráveis do candidato
Política por tipo (staff/patient):
- padrão de validade: 604800 segundos (7 dias);
- mínimo inicial: 300 segundos; máximo inicial: 604800 segundos;
- até 25 convites não consumidos, não revogados e não expirados por emissor/empresa/tipo;
- até 100 emissões nessa combinação nas últimas 24 horas. Revogar não devolve o orçamento diário.

Esses limites são escolhas iniciais de engenharia, não números exigidos por lei nem definidos pessoalmente por Lucas. São configuráveis pelo mantenedor confiável, sem RPC de configuração exposta a clientes. O teto de segurança deste candidato é 7 dias; aumentar esse teto requer revisar a fonte. Retry exato não consome outro orçamento nem estende validade.

## Cliente candidato
packages/chat-client/src/membership-secret-link.ts fornece codec e cliente com contexto exato de usuário/sessão/empresa, emissão, compartilhamento explícito, aceite e revogação. Prazo padrão de sete dias, configurável pelo chamador e limitado pelo servidor. Não faz login, não guarda chave administrativa, não persiste segredo e não executa retry automático.

O segredo tem 32 bytes obtidos por CSPRNG confiável. WebCrypto é a implementação padrão quando disponível; não existe fallback para Math.random. Temporários binários são zerados; referências às strings são descartadas ao fechar/trocar contexto, sem prometer zeragem física de strings JavaScript. Falta confirmar/prover o adapter CSPRNG nativo antes da integração normal Android; nenhuma dependência foi instalada.

Uma instância mantém no máximo uma emissão própria. A confirmação perdida retém exatamente ID/token/prazo para retry explícito; outra emissão não substitui silenciosamente essa tentativa. O snapshot não contém URL/token. A função de compartilhamento só recebe o link por chamada explícita, enquanto o contexto e o prazo continuarem válidos. Compartilhamentos externos já realizados não podem ser recolhidos; por isso existe a revogação no servidor.

Rota candidata nova: /v1/membership-invites/{staff|patient}/{companyId}/{inviteId}#token=...
Não inclui identidade pessoal do destinatário. O fragmento não protege contra scripts, histórico, clipboard ou captura de tela; a integração precisa evitar logs/telemetria da URL e dos corpos RPC que carregam segredo. Não foi publicado um handler dessa rota.

O link público existente /v1/patient-companies/{companyId} continua sendo apenas localizador de empresa, com suas regras atuais. Convite secreto não é uma alteração silenciosa da busca pública nem uma proibição de vínculo por outros caminhos já autorizados.

## Evidência focada
PostgreSQL17 real e descartável, somente loopback; Auth/JWT/atores e tokens são fixtures públicas. Nenhuma chamada ao Supabase.
- 16 etapas, 52 asserções; uma única rodada PostgreSQL.
- Disputa real observada em pg_stat_activity: dois atores tentaram consumir o mesmo link; apenas um usuário e um evento de aceite persistiram.
- Emissão autorizada e negativas por papel/empresa/login, padrão de sete dias, prazo configurável, tipo/empresa/token incorretos, aceite direto de funcionário, cliente com acesso só à própria conversa, multivínculo separado, sessão/emissor revogados, revogação, expiração e quotas configuráveis.
- Configuração local restaurada OFF e seis EXECUTEs da fixture revogados (três wrappers e três funções privadas).
- Cluster próprio encerrado com sequência de status 0 → stop → 3, sem incerteza.
- Intervalo registrado: 12:44:12.753Z–12:44:14.604Z (1851 ms, não inclui initdb). Resultado: supabase/candidates/membership-secret-links/validation.json.
- Cliente: 6 testes, 0 falhas, 87.375 ms; CSPRNG WebCrypto real em um caso, demais transportes/sessões/compartilhamento simulados. Tipos verificados apenas para os arquivos novos e dependências importadas.

A primeira passagem do cliente teve cinco casos; após concluir validação UTC e contexto, rodaram os seis casos finais. Uma incompatibilidade de tipo do WebCrypto foi corrigida usando buffer ArrayBuffer próprio, sem cast inseguro. Logs iniciais preservados. A suíte móvel ampla, áudio e recibos concluídos não foram reexecutados.

## O que ainda falta
- Interface normal de emissão/revisão/compartilhamento e consumo da rota em web/Android; não adicionar botões sem integrar o transporte real.
- Adapter CSPRNG Android, distribuição HTTPS/App Links, remoção de fragmento antes de logs e tratamento da perda de processo/gestão de links emitidos.
- Conferência da baseline Supabase real e instalador/reversão com dados preservados, owners, grants, limites globais de abuso e política segura de logs.
- Provas Auth/JWT/PostgREST reais e jornadas renderizadas de web e Android; regressões pertinentes perto do lote. Não há prova em telefone físico.
- Nenhuma imagem, prova Linux, conta reservada, senha, worker de áudio, VPS/Palworld, site principal ou artefato entregue foi alterado.

Referência oficial consultada: [Supabase — Database Functions](https://supabase.com/docs/guides/database/functions), para fronteira SECURITY INVOKER/DEFINER, search_path e privilégios EXECUTE. Os testes acima são evidência própria, não garantia de produção fornecida pela documentação.
