# Status do projeto

> Gerado de project-board.json. Não editar manualmente.

Atualizado em: 2026-11-06

Estrutura inicial; sem aplicativo executável, backend implantado ou APK.

Foco: **APP-002 — Validar proposta e preparar primeira fatia Android executável**

Próxima ação: Fixar stack mantida e recorte de APK demonstrativo; preparar instalação autorizada de dependências e resolver uso autorizado do ambiente Android, sem repetir ADB negado sem evidência nova. Compilar/instalar app mínimo e reestimar antes de ampliar chat.

## APP-001 — Criar estrutura independente de trabalho e entrega

Estado: done

- Fila única e status gerado disponíveis
- Escopo, proposta, testes e entrega documentados
- Ambiente inspecionado sem modificar o ResiCheck

Próxima ação: Consultar a proposta técnica antes de iniciar a fatia executável.

Evidências: README.md, docs/project/AMBIENTE.md, docs/testing/ESTRATEGIA.md, docs/delivery/ENTREGAS.md

## APP-002 — Validar proposta e preparar primeira fatia Android executável

Estado: next

- Registrar escolha de stack e dependências compatíveis
- Resolver ambiente de emulador e executar app Android local com dados sintéticos
- Demonstrar fluxo básico empresa/paciente sem backend de produção
- APK demonstrativo próprio abre sem Expo Go/servidor de desenvolvimento e usa somente dados fictícios com simulação identificada; não exige agenda/IA/integrações

Próxima ação: Fixar stack mantida e recorte de APK demonstrativo; preparar instalação autorizada de dependências e resolver uso autorizado do ambiente Android, sem repetir ADB negado sem evidência nova. Compilar/instalar app mínimo e reestimar antes de ampliar chat.

Evidências: docs/architecture/PROPOSTA.md, docs/project/PROTOTIPO-E-DESEMPENHO.md, docs/product/MVP-CHAT.md

## APP-003 — Implementar identidade, empresas, equipe e convite

Estado: backlog

- Subfatias APP-007 a APP-010 demonstradas com dados sintéticos
- Funcionário com ou sem link aguarda aceite antes de acessar a empresa
- Paciente por link ou busca conversa com a empresa sem escolher funcionário
- Testes negativos de isolamento entre duas empresas, papéis e funcionário revogado

Próxima ação: Após APP-002, executar as subfatias APP-007, APP-008, APP-009 e APP-010; especificação não conta como implementação.

Evidências: docs/product/FLUXOS-E-IDENTIDADE.md

## APP-004 — Entregar chat e anexos privados

Estado: backlog

- Todos os funcionários aprovados e ativos veem todas as conversas dos pacientes da própria empresa; acesso não depende de atendente atribuído
- Paciente com vínculo imediato acessa só nome/endereço/telefones públicos da empresa e próprio chat/anexos, onde envia mensagem e aguarda
- Funcionário pendente/revogado, outro paciente, outra empresa e gestor sem papel operacional não acessam conversa
- Chat funciona sem agenda, IA ou APIs externas; mantém mensagens e anexos privados com recuperação de falhas
- Atendente principal e da última mensagem são indicadores da equipe, não permissões; subfatia APP-050 resolve critérios antes de implementação
- [R16] Sem objeto público; limites de link documentados; não prometer apagar cópia já baixada.
- [R17] Arquivo não validado não é distribuído; processamento isolado e limitado; erros não expõem caminhos.
- [R18] Trilha contém remetente, destino, versão e data; não modificar original assinado; sem mistura de acervos.
- [R11] Paciente não escolhe funcionário; todos os funcionários aprovados da empresa podem ler as conversas; autoria real e revogação são preservadas
- [R27] MVP não duplica mensagens por retry e preserva ordenação/autoria e significado dos estados de envio/entrega/leitura escolhidos; não exige desenvolver agenda. Garantias de reserva ficam na fase futura.

Próxima ação: Após identidade e vínculos, implementar chat humano e anexos privados independente de agenda/IA/conectores; aplicar visibilidade por empresa e subfatia de indicadores APP-050.

Evidências: docs/research/INTEGRACAO.md, docs/product/MVP-CHAT.md

## APP-005 — Fase futura: desenvolver agenda de consultas e exames

Estado: backlog

- Fora da primeira fase; ausência de agenda não bloqueia o funcionamento nem a entrega do MVP de chat
- Criar, remarcar e cancelar com regras de disponibilidade
- Duas reservas simultâneas para o mesmo recurso/horário não são confirmadas
- Fuso, duração e permissões são validados pelo servidor

Próxima ação: Somente depois do MVP de cadastro/vínculos/chat funcionar sem agenda, revisar escopo e desenvolver reservas; na primeira fase manter apenas fronteiras de arquitetura.

Evidências: docs/research/INTEGRACAO.md

## APP-006 — Homologar APK e disponibilizar lote de teste no Drive

Estado: backlog

- Candidato de chat instala e funciona sem agenda, IA, conectores ou requisitos de publicação em loja ainda não aplicáveis à entrega privada de teste
- APK instalado e jornadas executadas em Android
- Lote contém hash, release notes, imagens sintéticas e evidências
- Upload privado verificado e links registrados sem dados reais

Próxima ação: Após validar cadastro/vínculos/chat Android e proteções pertinentes, montar APK de teste e lote privado autorizado; ausência de agenda/IA/integrações não bloqueia o candidato. Submissão de loja é APP-053.

Evidências: delivery/manifest.template.json, docs/delivery/ENTREGAS.md, docs/research/INTEGRACAO.md, docs/product/MVP-CHAT.md

## APP-007 — Implementar conta individual com CPF e níveis de confirmação de identidade

Estado: backlog

- Conta única por CPF, login e recuperação demonstrados sem enumeração pública de cadastro
- Validação de formato, consulta cadastral oficial, confirmação de contato e identidade mantêm estados distintos
- Gestor recebe confirmação robusta; funcionário e paciente recebem verificação proporcional definida
- Provedor e método autorizados documentados antes de integração; testes usam só respostas sintéticas
- Cadastro indevido não bloqueia permanentemente o titular; contestação e recuperação testadas
- Se Consulta CPF v3 do Serpro for escolhida, contrato inclui CPF e data de nascimento; custo e contratação avaliados antes de uso real
- [R05] Consulta cadastral não comprova identidade; existência de empresa não comprova representação; evidência e prazo de guarda definidos.

Próxima ação: Após APP-002 e pesquisa oficial, decidir métodos por papel e contrato do provedor; implementar com dados sintéticos, sem consultas reais nesta etapa.

Evidências: docs/product/FLUXOS-E-IDENTIDADE.md, docs/research/INTEGRACAO.md

## APP-008 — Implementar cadastro de empresa com CNPJ e comprovação de representação

Estado: backlog

- Gestor autenticado cadastra empresa dentro da sua conta
- Existência e situação cadastral do CNPJ são separadas da autoridade do gestor para representar a empresa
- Empresa pendente não concede privilégios de gestão por simples coincidência de dados
- Duplicidade de CNPJ, disputa e mudança de gestor seguem política explícita e auditada
- CNPJ/QSA e representação são testados com respostas e evidências sintéticas
- CNPJ armazenado como string de 14 posições; interface e cálculo oficial aceitam formatos numérico e alfanumérico com testes sintéticos
- [R06] Sem conversão numérica ou regex apenas numérica; normalização e validação aprovadas; validação não concede representação.

Próxima ação: Após APP-007, consolidar fonte oficial, prova de representação, política de ativação e exceções; então implementar o cadastro.

Evidências: docs/product/FLUXOS-E-IDENTIDADE.md, docs/research/INTEGRACAO.md

## APP-009 — Implementar convite, busca e aceite do vínculo de funcionário

Estado: backlog

- Convite de funcionário identifica empresa e papel, sem conceder acesso antes do aceite
- Conta sem link busca empresa, solicita vínculo de funcionário e aguarda aceite
- Gestor autorizado aprova, recusa e revoga com autoria e histórico
- Pendente ou revogado não acessa chat, eventos, pacientes e anexos por nenhuma rota
- Após aprovação, funcionário pode atender, conversar internamente e fornecer link de paciente no escopo autorizado
- Funcionário tem inicialmente uma única empresa; convite, busca e aceite concorrente não criam segundo vínculo ativo; transferência não migra histórico
- [R07] Nenhum vínculo pendente tem acesso; decisão por ator autorizado; aceite auditável; política de aprovação não é implícita.

Próxima ação: Após APP-007 e APP-008, implementar ambos os caminhos, estados e testes de convite adulterado, pedido duplicado e revogação de sessão ativa.

Evidências: docs/product/FLUXOS-E-IDENTIDADE.md, docs/research/INTEGRACAO.md

## APP-010 — Implementar vínculo de paciente por link e busca da empresa

Estado: backlog

- Paciente cria ou reutiliza conta individual com CPF e verificações proporcionais
- Link da empresa e busca sem link conduzem ao vínculo de paciente
- Após cadastro da conta, vínculo imediato dá acesso ao próprio chat com a empresa sem escolher funcionário
- Vínculo de paciente é imediato, sem fila de aceite do gestor; mantém autenticação/verificação da conta sem aprovação empresarial adicional
- Busca expõe apenas dados necessários da empresa; vínculo não revela equipe, outros pacientes ou conversas
- Paciente pode ter múltiplas empresas; após login escolhe contexto ou vincula nova empresa, sem unificar históricos
- Paciente só acessa nome/endereço/telefones públicos e próprio chat; troca de contexto separa API, realtime, cache, rascunhos e anexos sem agenda no MVP
- [R08] Encontrar empresa não dá acesso ao acervo; convite não revela saúde; geração só por funcionário aprovado com permissão.

Próxima ação: Após conta e cadastro empresarial, implementar vínculo imediato por link/busca, seleção de empresa e próprio chat, sem aceite do gestor e sem acesso ao acervo empresarial.

Evidências: docs/product/FLUXOS-E-IDENTIDADE.md, docs/research/INTEGRACAO.md, docs/product/MVP-CHAT.md

## APP-011 — Implementar painel da plataforma com empresas, usuários, auditoria e logs

Estado: backlog

- Login administrativo separado do cadastro público, com autenticação reforçada e privilégios definidos
- Painel lista empresas e usuários e oferece auditoria e logs necessários com dados minimizados
- Gestor empresarial e usuário comum não acessam funções administrativas da plataforma
- Papel administrativo não concede leitura irrestrita de chats, anexos ou personificação silenciosa
- Ações privilegiadas têm autoria e trilha; acesso excepcional ao conteúdo depende de regra específica previamente definida e testada
- Dados exclusivos de ADM, logs restritos e informações de desenvolvimento não aparecem ao gestor, funcionário ou paciente por interface/API/push/exportação
- [R10] Gestor/admin não leem chat clínico por padrão; suporte excepcional tem finalidade, prazo e trilha.

Próxima ação: Após definir identidade e entidades, decidir superfície do painel, matriz de privilégios, concessão inicial e operações de suporte; implementar testes negativos antes de ampliar acesso.

Evidências: docs/product/FLUXOS-E-IDENTIDADE.md, docs/testing/ESTRATEGIA.md, docs/architecture/CLASSIFICACAO-E-PERMISSOES.md, docs/research/INTEGRACAO.md

## APP-012 — Preparar atendimento generativo no chat com política de execução e revisão

Estado: backlog

- Não desenvolver nesta primeira fase; manter somente fronteiras documentadas e chat executável sem esta extensão
- Provedor de IA substituível, separado de persistência do chat, autorização e execução de ações
- Atendimento automático limitado ao administrativo/operacional; telemedicina e decisões clínicas fora do escopo atual; demandas clínicas encaminhadas ao humano sem resposta substantiva autônoma
- Contexto mínimo por conversa/empresa; modelo sem acesso irrestrito a banco, documentos ou credenciais
- Handoff, suspensão, falha do provedor e revisão preservam autoria e não geram ações concorrentes ou duplicadas
- Testes sintéticos de autorização, injeção de instruções e validação de ferramentas demonstrados antes de ativação
- [R43] Uso clínico permanece bloqueado até validação do enquadramento e supervisão adequada. Para o piloto administrativo, todos os casos críticos definidos exigem resposta segura ou transferência humana; SLA, responsável e caminho de falha são aprovados.
- [R44] Não usar dados reais no desenvolvimento. Nenhum dado real segue ao fornecedor antes de análise e autorização cabíveis; contrato, base legal, transferência, configuração de retenção e prova de isolamento aprovados.
- [R45] Nenhuma escrita externa ocorre sem regras determinísticas e autorização válidas. Critérios e amostras são aprovados antes do piloto; resultados, falhas e revisão são registrados sem excesso de dados; regressão e rollback demonstrados.
- Na fase futura, assistente se identifica como virtual/camada extra para evitar filas; atendente assume a qualquer momento com resumo de continuidade, sem resposta automática concorrente

Próxima ação: Fase posterior ao app de chat funcional: Após APP-004, identidade/autorização e pesquisa complementar, definir tarefas administrativas permitidas, revisão por risco e encaminhamento humano de demandas clínicas; iniciar em modo rascunho isolado, sem telemedicina.

Evidências: docs/architecture/EXTENSOES-IA-E-INTEGRACOES.md, docs/testing/ESTRATEGIA.md, docs/research/INTEGRACAO.md, docs/product/MVP-CHAT.md

## APP-013 — Implementar API de saída versionada para sistemas externos de agenda

Estado: backlog

- Não desenvolver nesta primeira fase; manter somente fronteiras documentadas e chat executável sem esta extensão
- Contrato canônico e adaptador específico versionados; disponibilidade e autorização da API externa verificadas
- Escopos por empresa, destino e operação; envio mínimo de paciente, consulta/exame e campos explicitamente autorizados
- Credenciais somente no backend; nenhum segredo no app, contexto de IA ou logs
- Mapeamento de IDs, serviços, fuso e estados validado sem equivalência clínica adivinhada
- Idempotência, retry após timeout, confirmação externa, revogação e auditoria testados com sistemas simulados
- [R46] Cada integração tem dono, direção, fonte de verdade, campos, permissões, ambiente sandbox e evidência do fornecedor. Ausência de API autorizada mantém conector bloqueado; nenhuma chave ou dado real consta do documento.

Próxima ação: Fase posterior ao app de chat funcional: Após APP-003 e APP-005, verificar documentação/contrato de uma API de destino autorizada; definir fonte de verdade e conector mínimo. ResiCheck/CPA são candidatos ainda não conectados.

Evidências: docs/architecture/EXTENSOES-IA-E-INTEGRACOES.md, docs/testing/ESTRATEGIA.md, docs/research/INTEGRACAO.md, docs/product/MVP-CHAT.md

## APP-014 — Implementar API de entrada versionada para agendas e procedimentos

Estado: backlog

- Não desenvolver nesta primeira fase; manter somente fronteiras documentadas e chat executável sem esta extensão
- Origem autenticada e autorizada por empresa/escopo; schema e limites validados antes de aplicar dados
- Agenda, disponibilidade e catálogo de consultas/procedimentos mapeados para contrato interno com origem e versão
- Evento repetido, fora de ordem, payload divergente e falha parcial têm resultado consistente e auditável
- Sincronização de entrada e saída não cria ciclos; conflito respeita fonte de verdade definida por entidade/campo
- Disponibilidade importada não substitui reserva autoritativa; testes sintéticos cobrem concorrência, fuso e IDs ambíguos
- [R47] Sem evento duplicado ou mistura de tenants; estados solicitados não são mostrados como confirmados sem evidência; reconciliação e revogação verificadas; ações irreversíveis não são repetidas cegamente.

Próxima ação: Fase posterior ao app de chat funcional: Após APP-003 e APP-005 e alinhamento do contrato de APP-013, decidir mecanismo de entrada, fontes autoritativas e reconciliação; testar primeiro com origem simulada.

Evidências: docs/architecture/EXTENSOES-IA-E-INTEGRACOES.md, docs/testing/ESTRATEGIA.md, docs/research/INTEGRACAO.md, docs/product/MVP-CHAT.md

## APP-015 — Criar configuração de conectores assistida por IA com revisão e testes

Estado: backlog

- Não desenvolver nesta primeira fase; manter somente fronteiras documentadas e chat executável sem esta extensão
- IA propõe mapeamento/configuração a partir de documentação e exemplos sintéticos, sem acesso a segredos ou dados reais
- Schema, contrato e adaptador gerados são revisados e testados em ambiente isolado antes de ativação autorizada
- Documentação não confiável não promove privilégio, escolhe destino arbitrário ou executa código em produção
- Mudanças versionadas têm diff, responsável, testes e possibilidade de desativar/reverter configuração
- Mapeamento ambíguo de dados ou procedimento exige decisão explícita; nenhum conector universal é presumido
- [R48] Proposta é separada de execução; nenhum segredo entra no contexto por padrão; validação determinística, revisão, versão e rollback obrigatórios; conexão real permanece desativada até aprovação de responsável autorizado.

Próxima ação: Fase posterior ao app de chat funcional: Após um conector determinístico validado em APP-013/APP-014, definir formato de configuração e ferramenta assistiva com rede restrita; começar por proposta revisável, sem autoativação.

Evidências: docs/architecture/EXTENSOES-IA-E-INTEGRACOES.md, docs/testing/ESTRATEGIA.md, docs/research/INTEGRACAO.md, docs/product/MVP-CHAT.md

## APP-016 — Definir identidade visual e experiência Android do ResiCheck Connect

Estado: backlog

- Nome provisório ResiCheck Connect e referências de chat traduzidos em identidade própria
- Logo ResiCheck localizado e origem/variante verificada antes de incorporar; ausência tem fallback textual
- Conceito visual revisado em contexto Android sem tratá-lo como app implementado
- Lista, conversa, teclado e ações principais validados para uso com uma mão, fonte ampliada e tecnologias assistivas

Próxima ação: Usar exemplos v0.2 e verde padrão aprovados como direção do protótipo, verificar logo autorizado e definir tokens/navegação; validar a implementação Android e acessibilidade sem marcar a aprovação visual como teste.

Evidências: docs/product/DIRECAO-VISUAL.md, docs/research/INTEGRACAO.md

## APP-017 — Implementar temas com precedência pessoal, empresa e padrão

Estado: backlog

- Antes do vínculo e sem logo válido permanece padrão neutro/pastel com destaque verde aprovado
- Paleta empresarial inicial deriva do logo com fallback e contraste verificável
- Gestor altera cores globais; usuário sobrescreve só sua preferência na precedência usuário > empresa > padrão
- Claro/escuro, reset pessoal, logo sem cores úteis e troca de sessão/empresa preservam legibilidade e isolamento
- Troca de logo não apaga personalização global sem política explícita e revisão

Próxima ação: Após APP-016, definir tokens configuráveis e abrangência da preferência pessoal; implementar e testar a resolução de tema.

Evidências: docs/product/DIRECAO-VISUAL.md, docs/testing/ESTRATEGIA.md

## APP-018 — Implementar upload seguro de logo e extração de paleta

Estado: backlog

- Só gestor autorizado altera logo da empresa; autorização no servidor
- Tipo real, limites, decodificação e conteúdo ativo são tratados antes de extrair cores
- Variante estática segura e metadados minimizados; preview antes da configuração global
- Arquivo inválido ou extração falha preserva último tema válido e oferece fallback
- Logos de teste são sintéticos; upload não muda compartilhamento de anexos

Próxima ação: Após APP-016 e autorização da empresa, decidir formatos/limites/visibilidade e demonstrar pipeline isolado com testes sintéticos.

Evidências: docs/product/DIRECAO-VISUAL.md, docs/testing/ESTRATEGIA.md

## APP-019 — Fixar finalidade e enquadramento

Estado: backlog

- [R01] Cada função tem decisão justificada; pendência clínica bloqueia a função afetada.

Próxima ação: Revisar requisito R01, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-020 — Inventariar dados e bases legais

Estado: backlog

- [R02] Todo campo/integração tem finalidade; dados sensíveis não usam legítimo interesse como base.
- Classificação por destinatário e matriz por papel/vínculo/objeto cobrem gestor, funcionário, paciente e ADM; conversas privadas do projeto e dados de desenvolvimento ficam fora do produto

Próxima ação: Revisar requisito R02, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md, docs/architecture/CLASSIFICACAO-E-PERMISSOES.md

## APP-021 — Formalizar governança e contratos

Estado: backlog

- [R03] Responsáveis e contatos definidos; nenhuma dispensa presumida apenas por porte ou rótulo SaaS.

Próxima ação: Revisar requisito R03, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-022 — Avaliar impacto e ameaças

Estado: backlog

- [R04] Cada risco tem dono, controle e evidência; alto risco residual requer decisão antes do piloto.

Próxima ação: Revisar requisito R04, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-023 — Isolar empresas e pacientes

Estado: backlog

- [R09] Zero acesso cruzado nos casos definidos; tenant vindo do cliente não é prova; regressão automatizada.
- Regra de uma empresa por funcionário e multivínculo de paciente protegida no backend, sem fusão de históricos entre empresas
- Testes negativos cobrem dados exclusivos por nível de conta em API, interface, push, exportação, realtime e erros de produção seguros

Próxima ação: Revisar requisito R09, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md, docs/architecture/CLASSIFICACAO-E-PERMISSOES.md

## APP-024 — Proteger autenticação e recuperação

Estado: backlog

- [R12] Testes negativos passam; sem conta privilegiada compartilhada; recuperação não contorna controles de identidade.

Próxima ação: Revisar requisito R12, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-025 — Revogar sessões e dispositivos

Estado: backlog

- [R13] Acesso servidor cessa após revogação confirmada; cache segue política; notificações não chegam à conta anterior.

Próxima ação: Revisar requisito R13, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-026 — Proteger armazenamento móvel

Estado: backlog

- [R14] Sem tokens públicos ou em logs; informação pessoal de saúde não é persistida em iCloud; política de backup comprovada.

Próxima ação: Revisar requisito R14, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-027 — Proteger trânsito e chaves

Estado: backlog

- [R15] Conexões inválidas falham; segredos fora do código; plano de rotação testado; TLS não anunciado como E2EE.

Próxima ação: Revisar requisito R15, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-028 — Implementar notificações com privacidade progressiva e telemetria mínima

Estado: backlog

- Padrão seguro proposto nível 1: somente app; quatro níveis aplicados ao payload e à apresentação por usuário/dispositivo, sem mensagem clínica por padrão
- Filtro todas/somente importantes não supera autorização nem presume permissão do sistema; troca de conta/empresa e revogação não vazam conteúdo
- Logs, analytics e crash reports não recebem conteúdo de mensagem/segredos; exposição adicional em notificação só conforme escolha e escopo autorizados
- [R19] Nível 1 não revela empresa, atendente ou mensagem; níveis superiores refletem escolha explícita e autorização. Logs analíticos permanecem minimizados e sem conteúdo sensível. Preferência no app não presume permissão Android/iOS.

Próxima ação: Definir política de importância inicial, preferência por usuário/dispositivo e preview; implementar transporte/payload com nível 1 por padrão e testes de lockscreen/permissão negada. Configuração e marcação são subfatia APP-051.

Evidências: docs/research/INTEGRACAO.md, docs/product/NOTIFICACOES.md

## APP-029 — Proteger interfaces com o sistema

Estado: backlog

- [R20] Entrada externa não concede acesso nem executa conteúdo arbitrário; falha segura.

Próxima ação: Revisar requisito R20, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-030 — Auditar ações e acessos

Estado: backlog

- [R21] Eventos reconstruíveis com hora do servidor; logs minimizados e protegidos; acesso ao log auditável.
- Logs de diagnóstico, auditoria e dados de desenvolvimento separados por papel/ambiente; usuário comum vê mensagem segura e código opaco, sem stack, SQL, segredos ou discussões privadas

Próxima ação: Revisar requisito R21, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md, docs/architecture/CLASSIFICACAO-E-PERMISSOES.md

## APP-031 — Definir retenção e descarte

Estado: backlog

- [R22] Prazos justificados por categoria; seis meses de acesso não viram regra de conteúdo; vinte anos não são universais.

Próxima ação: Revisar requisito R22, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-032 — Atender direitos e excluir conta

Estado: backlog

- [R23] Exportação só autorizada; retenção explicada; exclusão nos caminhos de loja aplicáveis; não confundir desativação com eliminação.

Próxima ação: Revisar requisito R23, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-033 — Responder a incidentes

Estado: backlog

- [R24] Processo suporta prazo legal aplicável; decisão fundamentada e registro por cinco anos; SLA interno menor é contratual.

Próxima ação: Revisar requisito R24, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-034 — Restaurar serviço e dados

Estado: backlog

- [R25] RPO/RTO medidos e aprovados; não misturar tenants nem reativar acesso revogado; evidência preservada.

Próxima ação: Revisar requisito R25, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-035 — Controlar fornecedores e transferências

Estado: backlog

- [R26] Todo fluxo internacional tem mecanismo e evidência; região local não é prova suficiente de ausência de transferência.

Próxima ação: Revisar requisito R26, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-036 — Versionar verificação OWASP

Estado: backlog

- [R28] Cada controle tem ID, caso, evidência, resultado e revisor; distinguir teste manual; não declarar certificação OWASP/LGPD.

Próxima ação: Revisar requisito R28, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-037 — Proteger desenvolvimento e cadeia de dependências

Estado: backlog

- [R29] Artefato liga a commit e evidência; sem dados de produção em teste; segredos e dependências críticas revisados.

Próxima ação: Revisar requisito R29, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-038 — Executar teste de segurança independente

Estado: backlog

- [R30] Sem crítico/alto explorável aberto; demais riscos têm dono, decisão e prazo; relatório usa dados sintéticos.

Próxima ação: Revisar requisito R30, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-039 — Preparar privacidade nas lojas

Estado: backlog

- [R32] Declarações consistentes; política Play pública, ativa, sem geobloqueio e não apenas PDF.

Próxima ação: Revisar requisito R32, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-040 — Revisar saúde e conteúdo nas lojas

Estado: backlog

- [R33] Sem alegações não comprovadas; salvaguardas de conteúdo e exigências de saúde mapeadas para a função real.

Próxima ação: Revisar requisito R33, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-041 — Validar permissões e SDKs móveis

Estado: backlog

- [R34] Sem acesso amplo injustificado; permissão opcional negada não torna fluxo inseguro; relatório Xcode revisado.

Próxima ação: Revisar requisito R34, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-042 — Tratar menores e representantes

Estado: backlog

- [R36] Regras aprovadas antes de habilitar; responsável não recebe acesso clínico irrestrito por padrão.

Próxima ação: Revisar requisito R36, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-043 — Reavaliar eventual assistência remota

Estado: backlog

- [R37] Requisitos institucionais e SRES resolvidos quando aplicáveis; ausência de vídeo não exclui telemedicina.

Próxima ação: Revisar requisito R37, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-044 — Reavaliar prontuário e emissão médica

Estado: backlog

- [R38] Integridade e assinatura verificáveis; sem descarte automático genérico; foto de assinatura não substitui qualificada.

Próxima ação: Revisar requisito R38, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-045 — Reavaliar função SaMD

Estado: backlog

- [R39] Nenhuma função SaMD liberada sem obrigações resolvidas; normas selecionadas têm versão e justificativa.

Próxima ação: Revisar requisito R39, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-046 — Integrar TISS quando aplicável

Estado: backlog

- [R40] Versão e cronograma por componente registrados; PDF de guia não é apresentado como conformidade TISS.

Próxima ação: Revisar requisito R40, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-047 — Revisar governança continuamente

Estado: backlog

- [R41] Cadência e donos aprovados; evidência preservada; nenhuma equivalência ISO/ABNT ou certificação sem verificação.

Próxima ação: Revisar requisito R41, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-048 — Controlar mudança de escopo e saída

Estado: backlog

- [R42] Sem acesso comercial indevido remanescente; dados sujeitos à guarda seguem plano; nova finalidade reabre R01.

Próxima ação: Revisar requisito R42, sua aplicabilidade e dependências antes da execução; registrar responsável e evidência do marco pertinente.

Evidências: docs/research/INTEGRACAO.md

## APP-049 — Validar acessibilidade das jornadas completas por plataforma

Estado: backlog

- [R31] Jornadas essenciais completadas com tecnologia assistiva; evidência manual além de scanner; não declarar selo sem avaliação.
- Cobrir temas padrão, empresarial e pessoal no claro/escuro; conceito visual não substitui testes de jornada no Android

Próxima ação: Após os fluxos essenciais e R01/R27, executar matriz de acessibilidade móvel e, se houver web, WCAG no seu escopo; registrar testes manuais e limitações.

Evidências: docs/product/DIRECAO-VISUAL.md, docs/research/INTEGRACAO.md, docs/testing/ESTRATEGIA.md

## APP-050 — Implementar indicadores de atendente principal e da última mensagem

Estado: backlog

- Principal corresponde ao funcionário que mais enviou mensagens na conversa, sem restringir acesso dos demais aprovados
- Indicador da última mensagem identifica autoria humana sem atribuir mensagem de paciente ao funcionário
- Antes de implementar, decidir empate, ausência de mensagens de funcionário, janela/itens contados, edição/exclusão, desligado e ordenação concorrente
- Mensagens futuras de IA têm autoria distinta; participação nos indicadores permanece decisão futura
- Visibilidade inicial dos indicadores destinada à equipe; eventual apresentação ao paciente exige decisão explícita

Próxima ação: Durante a fatia de chat APP-004, consolidar as decisões pendentes dos indicadores e testar com históricos sintéticos; não inventar política de desempate.

Evidências: docs/product/MVP-CHAT.md

## APP-051 — Implementar marcação de importância e configurações de notificação

Estado: backlog

- Funcionário aprovado pode marcar mensagem importante na empresa autorizada; paciente, pendente/revogado e outra empresa não podem
- Usuário escolhe todas ou apenas importantes e um dos quatro níveis app; app+empresa; app+empresa+atendente; app+empresa+atendente+mensagem
- Controle acessível de quatro paradas com descrição e preview sintético; padrão seguro proposto nível 1
- Preferências por usuário/dispositivo e permissão do sistema tratadas separadamente, sem herança indevida entre contas
- Importância inicial antes de marcação, renotificação, desmarcação e casos sem atendente são decisões validadas antes de implementar

Próxima ação: Definir as políticas em aberto e executar junto de APP-028; verificar payload e apresentação Android/iOS nos respectivos marcos, com lockscreen e permissão negada.

Evidências: docs/product/NOTIFICACOES.md, docs/testing/ESTRATEGIA.md

## APP-052 — Validar e implementar compactação de imagem com prévia e opção original

Estado: backlog

- Envio de imagem compactada tem prévia e opção explícita como documento original; não copia parâmetros proprietários do WhatsApp
- Texto pequeno, QR e códigos de barras fictícios passam por testes de leitura/decodificação antes de fixar parâmetros
- Documento original preserva bytes; não recomprimir PDF assinado nem invalidar assinatura; fonte do usuário não é apagada
- EXIF, orientação, cópia temporária e retenção são tratados por política explícita sem modificar silenciosamente o original
- Falha/resultado inadequado permite recuperação e escolha consciente do original; nenhum percentual ou garantia de legibilidade presumido
- Compactação no celular antes do upload, em cópia da fonte, com prévia ampliável; original mantém bytes/metadados sem excluir arquivo no aparelho
- Perfil candidato de resolução mínima/qualidade só é fixado após testes e trade-offs registrados; sombras/desfoque incluídos e atendente pode ampliar/pedir foto melhor

Próxima ação: Após pesquisa técnica, registrar perfil candidato de resolução mínima/qualidade e executar testes sintéticos antes de fixá-lo; compactar no dispositivo antes do envio, com prévia ampliável e original opcional, sem regravar PDF/assinatura.

Evidências: docs/product/ANEXOS-E-IMAGENS.md, docs/testing/ESTRATEGIA.md

## APP-053 — Preparar submissão às lojas após candidato funcional de chat

Estado: backlog

- [R35] Revalidar na data: consulta atual indica API 36+ e Xcode 26+/SDK iOS 26; revisão não utiliza pacientes reais.
- Submissão às lojas não bloqueia a geração de APK privado de teste; requisitos Apple aplicam-se antes da entrega iOS

Próxima ação: No marco de publicação autorizado, concluir dependências R30–R34 pertinentes, revalidar regras de loja e preparar demonstração sintética. Não executar publicação nesta etapa.

Evidências: docs/research/INTEGRACAO.md, docs/delivery/ENTREGAS.md

## APP-054 — Definir e medir orçamento de desempenho em aparelho modesto

Estado: backlog

- Registrar alvos candidatos de tamanho, abertura, resposta visual, rolagem, memória e cache antes de medir, com build e aparelho identificados
- Medição usa build representativo de release e carga sintética paginada; separar UI local de rede e confirmação do servidor
- Chat e anexos não carregam histórico inteiro, originais ou SDKs de funções futuras no caminho crítico; compressão no celular não trava interface
- Validar 2–3 GB RAM como perfil candidato de aparelho modesto, sem declarar número de emulador como desempenho físico
- Regressão, limites e trade-offs registrados; nenhum orçamento é apresentado como alcançado sem evidência

Próxima ação: Depois do primeiro build, medir baseline e ajustar alvos propostos com justificativa; usar emulador para funcionalidade e aparelho acessível para validar desempenho físico.

Evidências: docs/project/PROTOTIPO-E-DESEMPENHO.md, docs/testing/ESTRATEGIA.md

## APP-055 — Fixar compatibilidade mínima e testar Android antigo suportado

Estado: backlog

- Escolher stack estável/mantida e confirmar versão mínima de cada dependência e ABI; não congelar biblioteca insegura só para ampliar suporte
- Distinguir minSdk, compileSdk e targetSdk; SDK 36 disponível não define o Android mínimo
- Avaliar Android 7/API 24 como candidato conforme referência Expo consultada, sem prometer suporte antes de executar na versão mínima
- Matriz cobre Android mínimo/atual, fonte ampliada, teclado, rede/memória restritas, permissões e anexos em aparelhos modestos
- iOS tem requisito e validação próprios antes de entrega iPhone; não declarar suporte por base compartilhada ou regra de loja

Próxima ação: Durante APP-002, fixar versões e matriz mínima; obter uso autorizado de imagem/dispositivo correspondente e testar. A imagem atualmente observada é apenas Android 36.

Evidências: docs/project/PROTOTIPO-E-DESEMPENHO.md, docs/testing/ESTRATEGIA.md
