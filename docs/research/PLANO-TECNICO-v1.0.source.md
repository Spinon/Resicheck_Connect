# Plano técnico para aplicativo de saúde

Versão 1.0 | Proposto para revisão | 6 de novembro de 2026

## Resumo e decisão proposta

Este plano orienta um aplicativo Android e iOS multiempresa com chat, agenda e compartilhamento de guias/documentos. A prioridade é impedir acesso indevido entre empresas e pacientes e tornar identidade, vínculos, compartilhamento e operação verificáveis.

Decisão atual informada: o software não é telemedicina. O escopo é administrativo/operacional, inclusive para IA. Perguntas clínicas devem ser encaminhadas a uma pessoa, sem diagnóstico, prognóstico ou decisão terapêutica automatizados. Requisitos assistenciais aparecem apenas como limites para eventual mudança futura de finalidade.

Plano técnico para revisão por produto, engenharia, segurança, privacidade e responsáveis clínicos. Não é parecer jurídico, auditoria, certificação ou prova de conformidade. Nenhum controle foi implementado ou testado neste trabalho. Não contém dados de pacientes ou credenciais reais.

Versão 1.0 | Proposto para revisão | Pesquisa de 6 de novembro de 2026 | 48 itens de backlog. Responsáveis são papéis sugeridos, não pessoas designadas.

## Fluxos informados e decisões ainda necessárias

O gestor cria conta com CPF e verificação de identidade, cadastra empresa pelo CNPJ e verifica sua existência. Depois convida funcionários, com vínculo aguardando aceite. Funcionários também podem buscar a empresa e solicitar vínculo. Esses são fluxos informados, não autorização para tratar qualquer documento ou biometria sem definição de finalidade e proteção.

Funcionários aprovados geram links para pacientes. O paciente entra por link ou busca, vincula-se à empresa e conversa com ela, sem selecionar funcionário. A equipe precisa definir quem aprova solicitações, como o link expira, se é reutilizável e como a atribuição interna distribui o atendimento. O plano não presume regras de aprovação que não foram informadas.

O administrador da plataforma lista empresas/usuários e consulta auditoria/logs. O acesso global deve limitar-se a metadados necessários; ver conteúdo clínico é permissão separada e excepcional. O gestor da empresa tampouco recebe leitura clínica automática.

Validade cadastral, identidade da pessoa e representação da empresa são verificações diferentes. Uma consulta de CPF não prova que quem opera é seu titular; a existência do CNPJ não prova poderes de representação. Não incluir números pessoais em relatórios de teste. O identificador empresarial deve ser tratado como texto e admitir a evolução alfanumérica conforme especificação oficial.

Decidir antes da implementação: documento apenas recebido ou também emitido; fonte oficial do registro; grupos profissionais; dependentes e menores; integrações, cobrança e distribuição. A exclusão atual de telemedicina deve ser traduzida em limites funcionais, orientações à equipe e testes do chat/IA.

A Receita Federal confirmou o primeiro CNPJ alfanumérico em julho/2026 e publica a especificação de cálculo. A Consulta CPF Serpro v3 exige CPF e data de nascimento; avaliar necessidade, fundamento, fornecedor e retenção antes de integrar. Tarifas não foram verificadas. [S44 S45 S46]

## Capacidades futuras: IA e conectores

Foram solicitadas capacidades futuras de IA generativa para atendimentos autônomos no chat com revisão posterior pela equipe, APIs de saída para agendas externas ResiCheck/CPA, APIs de entrada para agendas/procedimentos/dados pertinentes e IA para ajudar a configurar conectores. São intenções de produto, não funções já homologadas nem autorização para transmitir dados reais.

A IA pretendida é administrativa/operacional. Perguntas clínicas devem ser encaminhadas a uma pessoa, sem diagnóstico, prognóstico ou decisão terapêutica automatizados. Revisão humana posterior não basta para prevenir respostas perigosas: impor limites antes do envio, transferência humana e tratamento seguro de incerteza. Uso clínico não faz parte do escopo atual; requisitos clínicos/sanitários são gates para mudança futura, não funções desejadas. Informar claramente quando o usuário fala com IA. [S01 S09 S10 S14]

Decisões exclusivamente automatizadas que afetem interesses exigem avaliação do art. 20 da LGPD, incluindo revisão e informação sobre critérios quando aplicável; não equiparar toda resposta de chatbot a tal decisão. Proibir reutilização de conversas para treino ou outra finalidade por simples conveniência; verificar base, contrato, necessidade, direitos e transferência internacional. [S01 S05]

As integrações devem nascer de documentação e contratos confirmados dos fornecedores. Não foi comprovada a disponibilidade das APIs ResiCheck/CPA. O desenho prevê contratos versionados, sandbox sintético, idempotência, reconciliação, isolamento e autorização por empresa. A configuração assistida por IA deve gerar proposta validável, sem ativação autônoma de credenciais, permissões ou conexões.

Como limite regulatório separado de telemedicina, a Resolução CFM 2454/2026 rege IA na medicina e deve ser avaliada segundo o contexto dos médicos e instituições envolvidos. Seu art. 5 §2 veda ao médico delegar comunicação diagnóstica, prognóstica ou terapêutica sem mediação humana. Isto não altera o escopo administrativo definido. OWASP LLM Top 10 2026 complementa os testes; FHIR R5 é opção de contrato de interoperabilidade, não exigência presumida para ResiCheck/CPA. [S47 S48 S49]

## Prioridades e natureza dos requisitos

P0 bloqueia dados reais ou a função condicional correspondente. P1 bloqueia o marco de lançamento indicado. P2 organiza melhoria contínua. As dependências orientam sequência, não estimativa de duração. O backlog não altera board, código ou contrato.

LEGAL indica lei/regulamento no campo aplicável. LOJA indica condição de distribuição. NORMA VOLUNTÁRIA indica referência técnica sem obrigatoriedade geral presumida. RECOMENDAÇÃO indica escolha técnica ou de gestão proposta. CONDICIONAL exige confirmar um gatilho de escopo.

Itens mistos separam obrigação de resultado e forma de implementação recomendada. MFA, tecnologia de criptografia, RPO/RTO ou uma ferramenta específica não são apresentados como exigência literal universal da LGPD. A equipe deve aprovar valores operacionais ausentes antes do marco relevante.

## Base legal e governança

A LGPD exige finalidade, necessidade, transparência, base legal, segurança e prestação de contas. Saúde é dado sensível; agenda e metadados podem revelar saúde conforme contexto. Legítimo interesse não é base para dados sensíveis. Consentimento não é a única hipótese possível; quando usado deve ser específico e demonstrável. [S01]

Papéis de controlador/operador derivam de decisões reais, não apenas de contrato. A plataforma pode operar para a clínica e controlar atividades próprias distintas. Resolução 18/2024 disciplina encarregado; dispensa e tratamento de pequeno porte exigem análise. Dados sensíveis isoladamente não bastam para a definição combinada de alto risco da Resolução 2/2022. [S04]

Incidente com risco ou dano relevante tem prazo geral de três dias úteis para comunicação pelo controlador, observadas condições/exceções. Registrar inclusive incidentes não comunicados por pelo menos cinco anos. Contrato deve prever aviso operacional rápido, sem confundir SLA interno com prazo legal. [S02 S03]

Transferência internacional exige mecanismo válido. A adequação da UE em 2026 deve ser considerada no seu âmbito. LGPD não exige genericamente servidor no Brasil; região local não elimina transferência por suporte, SDK ou backup. [S05]

Seis meses do Marco Civil referem-se a registros de acesso de provedores abrangidos, não ao conteúdo integral do chat. Regras de prontuário não autorizam transformar vinte anos em prazo universal nem em eliminação automática. Direitos dos titulares precisam ser reconciliados com conservação obrigatória. O prazo de quinze dias do art. 19 LGPD não é um SLA universal de todos os direitos. [S01 S07 S08 S11]

## Gatilhos clínicos e sanitários

Os itens deste bloco são limites de mudança futura, não escopo atual. Caso o produto passe a realizar assistência clínica por texto, mesmo assíncrona, reavaliar Lei 14510/2022 e CFM 2314/2022: consentimento, registros, autonomia, continuidade e responsabilidade. Examinar SRES/NGS2 e art. 17 no modelo concreto, sem declarar que todo mensageiro exige CRM. [S09 S10]

Emitir receita, atestado ou pedido de exame é diferente de transportar arquivo recebido. As Resoluções CFM 2381/2024 e 2299/2021 estabelecem requisitos aplicáveis à emissão eletrônica e plataformas abrangidas; foto de assinatura não equivale a assinatura qualificada. Se houver prontuário oficial, criar política documental própria. [S11 S12 S13]

Comunicação, agenda ou prontuário isolados não tornam o software SaMD. Finalidade de diagnóstico, tratamento ou monitoramento pode acionar RDC 657/2022, classificação da RDC 751/2022, requisitos essenciais da RDC 848/2024 e demais obrigações sanitárias pertinentes. [S14 S15 S16]

TISS se aplica às trocas abrangidas de saúde suplementar. A página oficial encontrada é setembro/2026, mas os componentes têm versões próprias. PDF de guia não comprova integração TISS. Para menores, avaliar LGPD, ECA Digital em vigor desde 17/3/2026 e regulamentação. [S17 S18 S19 S20]

Não estão presumidos: pesquisa com seres humanos, prescrição controlada, todas as profissões de saúde, publicidade médica, integração SUS/RNDS ou cobrança digital. Se incluídos, exigem análise e requisitos adicionais antes de liberar.

## Padrões e cobertura técnica

MASVS 2.1.0 orienta o aplicativo móvel; MASTG v2 orienta execução e rastreabilidade de testes. Cobrir armazenamento, criptografia, autenticação, rede, plataforma, código, resiliência e privacidade segundo ameaça. Fixar versão/commit e justificar não aplicáveis. Não transportar níveis antigos do MASVS para a estrutura atual sem análise. [S24 S25]

ASVS 5.0.0 orienta API, backend e web. Proposta inicial: avaliar nível 2 e ampliar controles segundo risco, sem declarar cobertura integral antes da matriz. IDs devem incluir versão. Testar aplicativo móvel não comprova segurança do servidor, e vice-versa. [S26]

ISO IEC 27001:2022, 27002:2022, 27701:2025 e ISO 27799:2025 são referências de gestão e controles. IEC 62304:2006 com emenda 2015, ISO 14971:2019 e IEC 82304-1:2016 merecem análise quando o escopo se aplicar. Norma pode ser incorporada por contrato ou regulação; isso não cria certificado universal de LGPD. [S37 S38 S39 S40 S41 S42 S43]

Foram consultados metadados públicos, não adquiridos textos integrais pagos ISO/ABNT. Confirmar edição nacional e texto licenciado antes de numerar cláusulas contratuais. Não presumir que adoção ABNT sempre tem o mesmo ano da ISO.

Propor WCAG 2.2 AA para web e matriz ABNT NBR 17060:2022 para aplicativos, combinando testes de plataforma. A aplicação jurídica deve ser separada da escolha técnica AA. O art. 63 da LBI menciona sítios, não literalmente todos os apps nativos. [S21 S22 S23]

## Regras de distribuição móvel

Na Play, completar declaração de saúde, Data safety, política pública e permissões necessárias. As alegações e avisos devem refletir o enquadramento real; a política distingue dispositivo médico e demais apps de saúde. [S27 S28 S30]

Criação de conta exige caminhos de exclusão aplicáveis, com explicação de dados conservados legalmente. Desativar login não é o mesmo que eliminar dados devidos. [S29 S33]

Na Apple, avaliar entidade publicadora, limites de uso de dados de saúde, proibição de persistir informação pessoal de saúde em iCloud e salvaguardas de conteúdo enviado por usuários. Isso não substitui análise sanitária. [S32]

Revisar SDKs, manifestos e práticas reais de coleta. Consulta de 6/11/2026: Android comum exige target API 36+; Apple requer Xcode 26+ e SDK iOS 26 desde 28/4/2026. Revalidar regras e exceções na submissão; esses requisitos não determinam sozinhos a versão mínima de sistema suportada. [S31 S34 S35 S36]

## Marcos de execução

Marco A Definição: concluir R01 a R04 e regras de identidade/vínculo R05 a R08. Saída: escopo, fluxos, donos e riscos documentados. Nenhum dado real necessário.

Marco B Fundação: concluir controles P0 aplicáveis, especialmente R09 a R27. Saída: isolamento, documentos, sessão, retenção, direitos, incidentes e restauração demonstrados com dados sintéticos.

Marco C Piloto: executar R28 a R31 e resolver P0 condicionais que serão usados. Saída: testes e riscos residuais aprovados; grupos e empresas limitados ao piloto autorizado.

Marco D Lançamento: concluir R32 a R35 e R42; repetir regressão no artefato final. A aprovação das lojas é decisão externa e não é garantida pelo plano.

Marco E Operação: executar R41 em cadência aprovada e reabrir R01 ao mudar finalidade, público ou integração. Produto deve estimar esforço após revisão da arquitetura e equipe; este plano não promete datas.

Marco F Capacidades futuras: liberar R43 a R48 somente após controles e testes próprios de IA administrativa e conectores. A inclusão desse marco não autoriza uso clínico. Obter documentação oficial dos fornecedores antes de estimar integração; revisar gates específicos a cada mudança.

## Protocolo de aceite e evidências

Cada item deve guardar ID, build/commit, ambiente, caso, dados sintéticos, esperado/observado, resultado, evidência, revisor, data e decisão. Não aplicabilidade exige justificativa e condição de reabertura.

Matriz mínima: Android/iOS reais, versões mínima e atual suportadas, dois tenants, dois pacientes por tenant, multivínculo, representante, usuário sem permissão, sessão revogada, rede instável, upload inválido, restauração e exclusão. Não usar dados de produção.

Proposta de liberação: nenhum P0 aplicável pendente, nenhum crítico/alto explorável aberto, P1 do marco atendidos e aprovação dos donos de produto, engenharia, segurança e privacidade. Responsável clínico/regulatório participa nos gatilhos. Trata-se de governança proposta, não selo de conformidade.

## Backlog completo

### R01 Fixar finalidade e enquadramento
Prioridade: P0 | Natureza: LEGAL CONDICIONAL
Responsável sugerido: Produto e jurídico
Dependências: Nenhuma
Requisito: Classificar chat, guia, registro, emissão, algoritmo e público.
Teste: Revisar jornadas, contratos e alegações comerciais.
Aceite: Cada função tem decisão justificada; pendência clínica bloqueia a função afetada.
Fontes: S01 S09 S10 S11 S14 S17 S19
Status: Planejado para revisão

### R02 Inventariar dados e bases legais
Prioridade: P0 | Natureza: LEGAL
Responsável sugerido: Privacidade e arquitetura
Dependências: R01
Requisito: Mapear finalidade, dados, fundamento, controlador, operador e destinatário.
Teste: Percorrer cadastro, agenda, chat, arquivos, suporte, push e logs com dados sintéticos.
Aceite: Todo campo/integração tem finalidade; dados sensíveis não usam legítimo interesse como base.
Fontes: S01
Status: Planejado para revisão

### R03 Formalizar governança e contratos
Prioridade: P0 | Natureza: LEGAL
Responsável sugerido: Jurídico e encarregado
Dependências: R02
Requisito: Definir instruções, subprocessadores, direitos, incidentes, saída e papel do encarregado.
Teste: Comparar contratos e fluxo real; avaliar enquadramento de pequeno porte.
Aceite: Responsáveis e contatos definidos; nenhuma dispensa presumida apenas por porte ou rótulo SaaS.
Fontes: S01 S04
Status: Planejado para revisão

### R04 Avaliar impacto e ameaças
Prioridade: P0 | Natureza: RECOMENDAÇÃO com gatilho LEGAL
Responsável sugerido: AppSec e privacidade
Dependências: R01 R02
Requisito: Modelar vazamento entre empresas, abuso interno, aparelho perdido e destinatário errado; avaliar RIPD.
Teste: Revisar riscos por fluxo e impacto ao paciente.
Aceite: Cada risco tem dono, controle e evidência; alto risco residual requer decisão antes do piloto.
Fontes: S06 S24 S26
Status: Planejado para revisão

### R05 Separar identidade e representação
Prioridade: P0 | Natureza: LEGAL objetivo e RECOMENDAÇÃO
Responsável sugerido: Identidade e jurídico
Dependências: R02 R04
Requisito: Distinguir validade cadastral, identidade da pessoa e poderes para representar empresa. Minimizar documentos e biometria.
Teste: Simular cadastro com identificador válido de terceiro e gestor sem poderes; avaliar revisão manual e contestação.
Aceite: Consulta cadastral não comprova identidade; existência de empresa não comprova representação; evidência e prazo de guarda definidos.
Fontes: S01 S24 S26 S46
Status: Planejado para revisão

### R06 Validar cadastro empresarial sem ambiguidade
Prioridade: P0 | Natureza: RECOMENDAÇÃO e regra cadastral aplicável
Responsável sugerido: Backend e produto
Dependências: R05
Requisito: Tratar identificador empresarial como texto; admitir formato alfanumérico conforme regra oficial e compatibilidade com cadastros existentes. O formato alfanumérico entrou em produção em julho de 2026.
Teste: Usar fixtures oficiais, zeros iniciais, letras admitidas, dígitos verificadores, busca e integração externa.
Aceite: Sem conversão numérica ou regex apenas numérica; normalização e validação aprovadas; validação não concede representação.
Fontes: S01 S26 S44 S45
Status: Planejado para revisão

### R07 Controlar convites e solicitações
Prioridade: P0 | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: Backend e produto
Dependências: R05 R06
Requisito: Modelar pendente, aceito, recusado, expirado e revogado; distinguir convite do gestor e solicitação do funcionário.
Teste: Tentar autoaprovação, aceite por outra identidade, token reutilizado e corrida entre aprovação e revogação.
Aceite: Nenhum vínculo pendente tem acesso; decisão por ator autorizado; aceite auditável; política de aprovação não é implícita.
Fontes: S01 S26
Status: Planejado para revisão

### R08 Proteger vínculo de pacientes por link ou busca
Prioridade: P0 | Natureza: LEGAL objetivo e RECOMENDAÇÃO
Responsável sugerido: Produto e backend
Dependências: R07
Requisito: Links não expõem identificadores pessoais; vínculo exige destinatário/empresa corretos e regra explícita de aceite.
Teste: Testar link expirado, reutilizado, empresa trocada, paciente incorreto e busca em massa.
Aceite: Encontrar empresa não dá acesso ao acervo; convite não revela saúde; geração só por funcionário aprovado com permissão.
Fontes: S01 S26
Status: Planejado para revisão

### R09 Isolar empresas e pacientes
Prioridade: P0 | Natureza: LEGAL objetivo e RECOMENDAÇÃO
Responsável sugerido: Backend e AppSec
Dependências: R02 R07 R08
Requisito: Aplicar autorização no servidor por tenant, paciente e objeto em API, realtime, storage, busca, cache e jobs.
Teste: Executar tentativas cruzadas com duas empresas, dois pacientes e profissional multivínculo.
Aceite: Zero acesso cruzado nos casos definidos; tenant vindo do cliente não é prova; regressão automatizada.
Fontes: S01 S08 S26
Status: Planejado para revisão

### R10 Separar perfis e acesso administrativo
Prioridade: P0 | Natureza: LEGAL objetivo e RECOMENDAÇÃO
Responsável sugerido: Produto e segurança
Dependências: R09
Requisito: Definir recepção, clínico, faturamento, gestor, suporte e admin global. Listas globais usam mínimos metadados.
Teste: Testar escalada de privilégio, troca de papel e acesso do admin a conteúdo clínico.
Aceite: Gestor/admin não leem chat clínico por padrão; suporte excepcional tem finalidade, prazo e trilha.
Fontes: S01 S08 S26
Status: Planejado para revisão

### R11 Gerir conversa da empresa e atribuição interna
Prioridade: P0 | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: Produto e backend
Dependências: R09 R10
Requisito: Paciente conversa com a empresa; atribuição interna a funcionário não altera tenant ou propriedade da conversa.
Teste: Testar transferência, funcionário removido, equipes simultâneas e envio enquanto atribuição muda.
Aceite: Paciente não precisa escolher funcionário; acesso interno segue função; autor real é auditável; desligado perde acesso.
Fontes: S01 S26
Status: Planejado para revisão

### R12 Proteger autenticação e recuperação
Prioridade: P0 | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: Identidade e AppSec
Dependências: R05 R10
Requisito: Exigir contas individuais, propor MFA para privilégios e proteger recuperação e operações sensíveis.
Teste: Testar enumeração, força bruta, recuperação indevida e reuso de token.
Aceite: Testes negativos passam; sem conta privilegiada compartilhada; recuperação não contorna controles de identidade.
Fontes: S08 S24 S26
Status: Planejado para revisão

### R13 Revogar sessões e dispositivos
Prioridade: P0 | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: Backend e mobile
Dependências: R12
Requisito: Revogar refresh tokens, realtime e push ao desligar vínculo/conta.
Teste: Revogar com app aberto, WebSocket ativo, offline e troca de conta.
Aceite: Acesso servidor cessa após revogação confirmada; cache segue política; notificações não chegam à conta anterior.
Fontes: S24 S26
Status: Planejado para revisão

### R14 Proteger armazenamento móvel
Prioridade: P0 | Natureza: RECOMENDAÇÃO e LOJA
Responsável sugerido: Android e iOS
Dependências: R02 R13
Requisito: Usar armazenamento seguro para segredos; minimizar e proteger cache e backup.
Teste: Inspecionar arquivos, banco local, logs, clipboard, backup, troca de usuário e reinstalação.
Aceite: Sem tokens públicos ou em logs; informação pessoal de saúde não é persistida em iCloud; política de backup comprovada.
Fontes: S24 S25 S32
Status: Planejado para revisão

### R15 Proteger trânsito e chaves
Prioridade: P0 | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: Infraestrutura e segurança
Dependências: R04
Requisito: Autenticar transporte, proteger repouso e separar gestão de chaves; decidir pinning conforme ameaça e rotação.
Teste: Testar certificado/hostname inválido, HTTP, rotação e restauração de chaves.
Aceite: Conexões inválidas falham; segredos fora do código; plano de rotação testado; TLS não anunciado como E2EE.
Fontes: S24 S26 S38
Status: Planejado para revisão

### R16 Restringir documentos e URLs
Prioridade: P0 | Natureza: LEGAL objetivo e RECOMENDAÇÃO
Responsável sugerido: Backend e documentos
Dependências: R09 R10
Requisito: Manter objetos privados e autorizar original, miniatura e exportação; links de duração limitada quando necessários.
Teste: Trocar paciente, reutilizar URL expirada/revogada e consultar objeto de outra empresa.
Aceite: Sem objeto público; limites de link documentados; não prometer apagar cópia já baixada.
Fontes: S01 S24 S26
Status: Planejado para revisão

### R17 Validar upload e conteúdo ativo
Prioridade: P0 | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: Backend e AppSec
Dependências: R16
Requisito: Validar tamanho, tipo real e conteúdo; limitar processamento e colocar suspeitos em quarentena.
Teste: Enviar MIME falso, arquivo enorme, PDF ativo e arquivo de teste seguro; avaliar parser.
Aceite: Arquivo não validado não é distribuído; processamento isolado e limitado; erros não expõem caminhos.
Fontes: S26
Status: Planejado para revisão

### R18 Confirmar destinatário e versão
Prioridade: P0 | Natureza: LEGAL objetivo e RECOMENDAÇÃO
Responsável sugerido: UX e documentos
Dependências: R11 R16
Requisito: Exibir empresa/paciente/destinatário antes do compartilhamento; preservar original e versões.
Teste: Simular homônimos e documento substituído; conferir seleção em tela pequena.
Aceite: Trilha contém remetente, destino, versão e data; não modificar original assinado; sem mistura de acervos.
Fontes: S01 S26
Status: Planejado para revisão

### R19 Minimizar push e telemetria
Prioridade: P0 | Natureza: LEGAL LOJA e RECOMENDAÇÃO
Responsável sugerido: Mobile e privacidade
Dependências: R02 R13
Requisito: Usar push genérico e remover conteúdo clínico de analytics e crash reports; inventariar SDKs.
Teste: Capturar tráfego em erro/background com dados sentinela sintéticos.
Aceite: Nenhum dado sentinela sensível aparece em push/log analítico; exceções justificadas e aprovadas.
Fontes: S01 S24 S28 S30 S35
Status: Planejado para revisão

### R20 Proteger interfaces com o sistema
Prioridade: P0 | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: Android e iOS
Dependências: R13 R16
Requisito: Validar deep links, intents, componentes exportados, WebViews e seletores.
Teste: Abrir links maliciosos, alterar parâmetros, negar permissões e chamar componente por app externo.
Aceite: Entrada externa não concede acesso nem executa conteúdo arbitrário; falha segura.
Fontes: S24 S25
Status: Planejado para revisão

### R21 Auditar ações e acessos
Prioridade: P0 | Natureza: LEGAL e RECOMENDAÇÃO
Responsável sugerido: Backend e segurança
Dependências: R09 R10
Requisito: Registrar ator, tenant, objeto, data e resultado; proteger trilha e acesso aos logs.
Teste: Tentar alterar/apagar trilha e manipular relógio cliente; buscar vazamento no log.
Aceite: Eventos reconstruíveis com hora do servidor; logs minimizados e protegidos; acesso ao log auditável.
Fontes: S01 S07 S08 S26
Status: Planejado para revisão

### R22 Definir retenção e descarte
Prioridade: P0 | Natureza: LEGAL CONDICIONAL
Responsável sugerido: Privacidade e dados
Dependências: R02 R21
Requisito: Separar conta, chat, documento, logs, backups e guarda legal.
Teste: Simular vencimento, bloqueio legal, eliminação parcial e restauração antiga.
Aceite: Prazos justificados por categoria; seis meses de acesso não viram regra de conteúdo; vinte anos não são universais.
Fontes: S01 S07 S11
Status: Planejado para revisão

### R23 Atender direitos e excluir conta
Prioridade: P0 | Natureza: LEGAL e LOJA
Responsável sugerido: Privacidade e produto
Dependências: R13 R22
Requisito: Implementar acesso, correção, exportação e eliminação com identidade/representação proporcionais.
Teste: Executar pedido de paciente e responsável e verificar exportação e vínculos restantes.
Aceite: Exportação só autorizada; retenção explicada; exclusão nos caminhos de loja aplicáveis; não confundir desativação com eliminação.
Fontes: S01 S29 S33
Status: Planejado para revisão

### R24 Responder a incidentes
Prioridade: P0 | Natureza: LEGAL
Responsável sugerido: Segurança e encarregado
Dependências: R03 R21
Requisito: Manter plano, contatos, avaliação de relevância e comunicação ao controlador.
Teste: Simular vazamento multicliente com contagem de dias úteis e preservação de evidência.
Aceite: Processo suporta prazo legal aplicável; decisão fundamentada e registro por cinco anos; SLA interno menor é contratual.
Fontes: S02 S03
Status: Planejado para revisão

### R25 Restaurar serviço e dados
Prioridade: P0 | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: SRE e dados
Dependências: R15 R22
Requisito: Aprovar RPO/RTO segundo criticidade e testar backup/restauração de banco e objetos.
Teste: Restaurar em ambiente isolado; reconciliar objetos, vínculos e exclusões.
Aceite: RPO/RTO medidos e aprovados; não misturar tenants nem reativar acesso revogado; evidência preservada.
Fontes: S01 S26 S38
Status: Planejado para revisão

### R26 Controlar fornecedores e transferências
Prioridade: P0 | Natureza: LEGAL
Responsável sugerido: Jurídico e infraestrutura
Dependências: R02 R03
Requisito: Inventariar países, suporte, subprocessadores e mecanismos de transferência.
Teste: Confrontar contratos, regiões, telemetria, backup e acesso remoto.
Aceite: Todo fluxo internacional tem mecanismo e evidência; região local não é prova suficiente de ausência de transferência.
Fontes: S01 S05
Status: Planejado para revisão

### R27 Garantir consistência da agenda e chat
Prioridade: P0 | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: Backend e QA
Dependências: R09 R11
Requisito: Implementar idempotência, estados claros, fuso, ordenação e concorrência.
Teste: Testar reserva simultânea, retry, offline, cancelamento e envio fora de ordem.
Aceite: Sem dupla reserva indevida ou duplicação por retry; estados solicitado/confirmado e entregue/lido têm significado documentado.
Fontes: S26
Status: Planejado para revisão

### R28 Versionar verificação OWASP
Prioridade: P1 | Natureza: NORMA VOLUNTÁRIA
Responsável sugerido: AppSec e QA
Dependências: R04 R09 a R27
Requisito: Criar matriz MASVS 2.1.0, MASTG v2 para Android/iOS e ASVS 5.0.0 para backend/web.
Teste: Selecionar testes aplicáveis, fixar versão/commit e justificar exclusões.
Aceite: Cada controle tem ID, caso, evidência, resultado e revisor; distinguir teste manual; não declarar certificação OWASP/LGPD.
Fontes: S24 S25 S26
Status: Planejado para revisão

### R29 Proteger desenvolvimento e cadeia de dependências
Prioridade: P1 | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: DevSecOps
Dependências: R04
Requisito: Manter SBOM, secret scanning, análise de dependências, revisão e build rastreável.
Teste: Inserir fixtures controladas de segredo/vulnerabilidade e testar bloqueio do CI.
Aceite: Artefato liga a commit e evidência; sem dados de produção em teste; segredos e dependências críticas revisados.
Fontes: S24 S26
Status: Planejado para revisão

### R30 Executar teste de segurança independente
Prioridade: P1 | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: AppSec independente
Dependências: R28 R29
Requisito: Testar API e builds móveis com cenário multicliente e dispositivos físicos.
Teste: Avaliar autorização, sessão, recuperação, upload, configurações e integrações; retestar correções.
Aceite: Sem crítico/alto explorável aberto; demais riscos têm dono, decisão e prazo; relatório usa dados sintéticos.
Fontes: S24 S25 S26
Status: Planejado para revisão

### R31 Validar acessibilidade completa
Prioridade: P1 | Natureza: LEGAL contextual e NORMA VOLUNTÁRIA
Responsável sugerido: UX e QA acessibilidade
Dependências: R01 R27
Requisito: Propor WCAG 2.2 AA em web e matriz NBR 17060 em mobile.
Teste: Usar VoiceOver/TalkBack, foco, teclado, texto ampliado, contraste, erros, agenda e anexos.
Aceite: Jornadas essenciais completadas com tecnologia assistiva; evidência manual além de scanner; não declarar selo sem avaliação.
Fontes: S21 S22 S23
Status: Planejado para revisão

### R32 Preparar privacidade nas lojas
Prioridade: P1 | Natureza: LOJA e LEGAL
Responsável sugerido: Release e privacidade
Dependências: R19 R23 R26
Requisito: Confrontar Data safety/App Privacy e política pública com comportamento real.
Teste: Abrir URLs sem login e comparar SDKs e captura de tráfego com declarações.
Aceite: Declarações consistentes; política Play pública, ativa, sem geobloqueio e não apenas PDF.
Fontes: S27 S28 S30 S35
Status: Planejado para revisão

### R33 Revisar saúde e conteúdo nas lojas
Prioridade: P1 | Natureza: LOJA CONDICIONAL
Responsável sugerido: Produto e release
Dependências: R01 R32
Requisito: Completar declaração de saúde e revisar alegações, avisos, entidade publicadora e conteúdo de usuários.
Teste: Revisar descrição/screenshots e testar denúncia, bloqueio e suporte quando exigidos.
Aceite: Sem alegações não comprovadas; salvaguardas de conteúdo e exigências de saúde mapeadas para a função real.
Fontes: S27 S32
Status: Planejado para revisão

### R34 Validar permissões e SDKs móveis
Prioridade: P1 | Natureza: LOJA e RECOMENDAÇÃO
Responsável sugerido: Android e iOS
Dependências: R19 R20 R29
Requisito: Solicitar permissões necessárias no contexto; revisar manifestos e assinaturas dos SDKs abrangidos.
Teste: Negar/revogar câmera, arquivos, microfone e push; inspecionar manifesto compilado.
Aceite: Sem acesso amplo injustificado; permissão opcional negada não torna fluxo inseguro; relatório Xcode revisado.
Fontes: S28 S34 S35
Status: Planejado para revisão

### R35 Preparar submissão e demonstração
Prioridade: P1 | Natureza: LOJA
Responsável sugerido: Release e QA
Dependências: R30 a R34
Requisito: Validar SDKs, metadados e conta de revisão com dados sintéticos e backend disponível.
Teste: Smoke test do mesmo artefato enviado; conferir URLs, faixa etária e demonstração.
Aceite: Revalidar na data: consulta atual indica API 36+ e Xcode 26+/SDK iOS 26; revisão não utiliza pacientes reais.
Fontes: S31 S32 S36
Status: Planejado para revisão

### R36 Tratar menores e representantes
Prioridade: P0 antes de público abrangido | Natureza: LEGAL CONDICIONAL
Responsável sugerido: Jurídico clínico e produto
Dependências: R01 R05 R10
Requisito: Avaliar ECA Digital e acesso provável; projetar vínculo e confidencialidade proporcional.
Teste: Testar maioridade, responsável removido, vínculo expirado e pedido indevido.
Aceite: Regras aprovadas antes de habilitar; responsável não recebe acesso clínico irrestrito por padrão.
Fontes: S01 S19 S20
Status: Planejado para revisão

### R37 Reavaliar eventual assistência remota
Prioridade: P0 antes da função clínica | Natureza: LEGAL CONDICIONAL
Responsável sugerido: Responsável técnico e jurídico
Dependências: R01 R03 R24
Requisito: Fora do escopo atual. Se uma mudança futura propuser assistência clínica, reabrir enquadramento antes de implementar consentimento, registro, encaminhamento e responsabilidades aplicáveis.
Teste: Simular atendimento, interrupção, encaminhamento e cópia de registro.
Aceite: Requisitos institucionais e SRES resolvidos quando aplicáveis; ausência de vídeo não exclui telemedicina.
Fontes: S09 S10
Status: Planejado para revisão

### R38 Reavaliar prontuário e emissão médica
Prioridade: P0 antes da função | Natureza: LEGAL CONDICIONAL
Responsável sugerido: Responsável técnico e documentos
Dependências: R01 R18 R22 R25
Requisito: Não presumido no escopo atual. Se incluído, definir registro canônico, adendos, guarda e exportação; validar emissor, conteúdo e assinatura de documento médico.
Teste: Testar adendo, exportação, migração e alteração de byte em documento assinado.
Aceite: Integridade e assinatura verificáveis; sem descarte automático genérico; foto de assinatura não substitui qualificada.
Fontes: S10 S11 S12 S13
Status: Planejado para revisão

### R39 Reavaliar função SaMD
Prioridade: P0 antes da função | Natureza: LEGAL CONDICIONAL e NORMA VOLUNTÁRIA
Responsável sugerido: Regulatório e clínico
Dependências: R01 R04
Requisito: Avaliar finalidade, classe, qualidade, regularização, validação e pós-mercado.
Teste: Revisar indicação de uso, algoritmo, saída clínica, usuários e alegações a cada mudança relevante.
Aceite: Nenhuma função SaMD liberada sem obrigações resolvidas; normas selecionadas têm versão e justificativa.
Fontes: S14 S15 S16 S41 S42 S43
Status: Planejado para revisão

### R40 Integrar TISS quando aplicável
Prioridade: P0 antes da integração | Natureza: LEGAL CONDICIONAL
Responsável sugerido: Integrações e especialista TISS
Dependências: R01 R16 R27
Requisito: Implementar componentes, terminologias e mensagens abrangidas pela ANS.
Teste: Validar schemas, versão, erros, retries e homologação do parceiro.
Aceite: Versão e cronograma por componente registrados; PDF de guia não é apresentado como conformidade TISS.
Fontes: S17 S18
Status: Planejado para revisão

### R41 Revisar governança continuamente
Prioridade: P2 contínuo | Natureza: RECOMENDAÇÃO e LEGAL aplicável
Responsável sugerido: Segurança e privacidade
Dependências: R03 R24 R25 R30
Requisito: Revisar acesso, fornecedores, incidentes, normas e controles; usar ISO conforme maturidade e contrato.
Teste: Amostrar privilégios, repetir restauração e revisar ações vencidas.
Aceite: Cadência e donos aprovados; evidência preservada; nenhuma equivalência ISO/ABNT ou certificação sem verificação.
Fontes: S37 S38 S39 S40
Status: Planejado para revisão

### R42 Controlar mudança de escopo e saída
Prioridade: P1 | Natureza: LEGAL e RECOMENDAÇÃO
Responsável sugerido: Produto e operações
Dependências: R22 R23 R25 R26
Requisito: Reavaliar funções/público/IA e oferecer exportação e saída do tenant.
Teste: Simular encerramento, exportação, revogação, conservação e nova integração de IA.
Aceite: Sem acesso comercial indevido remanescente; dados sujeitos à guarda seguem plano; nova finalidade reabre R01.
Fontes: S01 S05 S26
Status: Planejado para revisão

### R43 Delimitar autonomia e supervisão da IA
Prioridade: P0 da IA | Natureza: LEGAL CONDICIONAL e RECOMENDAÇÃO
Responsável sugerido: Produto, privacidade e responsável clínico
Dependências: R01 R04 R26 R37 R39
Requisito: Limitar IA atual ao atendimento administrativo/operacional; perguntas clínicas vão para uma pessoa, sem diagnóstico, prognóstico ou decisão terapêutica automatizados. Definir ações, assuntos permitidos, transparência, escalonamento e bloqueios prévios ao envio. Revisão posterior não substitui esses controles.
Teste: Simular pedido diagnóstico, decisão terapêutica, urgência, ambiguidade, menor, falta de dados, indisponibilidade humana e tentativa de sair do escopo.
Aceite: Uso clínico permanece bloqueado até validação do enquadramento e supervisão adequada. Para o piloto administrativo, todos os casos críticos definidos exigem resposta segura ou transferência humana; SLA, responsável e caminho de falha são aprovados.
Fontes: S01 S09 S10 S14 S42 S47 S49
Status: Planejado para revisão

### R44 Controlar dados e fornecedor de IA
Prioridade: P0 da IA | Natureza: LEGAL e RECOMENDAÇÃO
Responsável sugerido: Privacidade, segurança e engenharia de IA
Dependências: R02 R03 R22 R26 R43
Requisito: Mapear prompts, respostas, anexos, recuperação de contexto, embeddings, retenção, uso para treinamento, suboperadores e países. Enviar apenas dados autorizados necessários; manter isolamento de empresa e paciente em busca/contexto.
Teste: Testar consultas cruzadas, exclusão de documento indexado, observabilidade, cache, dados indevidos no prompt e recusa de fornecedor em apagar conteúdo.
Aceite: Não usar dados reais no desenvolvimento. Nenhum dado real segue ao fornecedor antes de análise e autorização cabíveis; contrato, base legal, transferência, configuração de retenção e prova de isolamento aprovados.
Fontes: S01 S05 S26 S49
Status: Planejado para revisão

### R45 Validar respostas e ferramentas de IA
Prioridade: P0 da IA | Natureza: RECOMENDAÇÃO técnica e LEGAL CONDICIONAL
Responsável sugerido: Engenharia de IA, AppSec, QA e responsável clínico
Dependências: R21 R43 R44
Requisito: Definir conjunto de avaliação versionado, casos proibidos, política de fontes, limiares por risco, possibilidade de intervenção e desligamento. Tratar mensagens e documentos recuperados como conteúdo não confiável; o modelo não decide autorização nem obtém acesso amplo a ferramentas.
Teste: Injetar instruções em documentos/chat; simular alucinação, vazamento entre tenants, ação duplicada, ferramenta fora de escopo, mudança de modelo e baixa confiança.
Aceite: Nenhuma escrita externa ocorre sem regras determinísticas e autorização válidas. Critérios e amostras são aprovados antes do piloto; resultados, falhas e revisão são registrados sem excesso de dados; regressão e rollback demonstrados.
Fontes: S01 S26 S42 S49
Status: Planejado para revisão

### R46 Especificar contratos de integração externa
Prioridade: P0 dos conectores | Natureza: LEGAL e RECOMENDAÇÃO
Responsável sugerido: Arquitetura, integrações e privacidade
Dependências: R01 R02 R03 R26
Requisito: Prever saída para agendas externas ResiCheck/CPA e entrada de agendas, procedimentos e dados pertinentes. Confirmar produto, fornecedor, documentação oficial, contrato, endpoints, versão, autenticação, limites, finalidade e campos necessários. Nomes informados não comprovam existência ou disponibilidade de APIs.
Teste: Revisar documentação e exemplos sintéticos; confrontar contratos de entrada/saída com necessidade, escopos e identidade de empresa/paciente.
Aceite: Cada integração tem dono, direção, fonte de verdade, campos, permissões, ambiente sandbox e evidência do fornecedor. Ausência de API autorizada mantém conector bloqueado; nenhuma chave ou dado real consta do documento.
Fontes: S01 S05 S26 S48
Status: Planejado para revisão

### R47 Garantir sincronização e segurança dos conectores
Prioridade: P0 dos conectores | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: Backend, integrações, segurança e QA
Dependências: R09 R15 R21 R27 R46
Requisito: Implementar credenciais por tenant em cofre, menor privilégio, autenticação de webhook, prevenção de replay, idempotência, fila de erro, reconciliação e limites. Fixar mapeamento, fuso e conflitos; proibir URLs arbitrárias e acesso à rede interna.
Teste: Simular webhook adulterado/repetido, credencial revogada, indisponibilidade, timeout de resultado incerto, paginação, concorrência, falha parcial e identificador externo colidente.
Aceite: Sem evento duplicado ou mistura de tenants; estados solicitados não são mostrados como confirmados sem evidência; reconciliação e revogação verificadas; ações irreversíveis não são repetidas cegamente.
Fontes: S01 S26
Status: Planejado para revisão

### R48 Limitar configuração assistida por IA
Prioridade: P0 da função futura | Natureza: RECOMENDAÇÃO técnica
Responsável sugerido: Arquitetura, engenharia de IA e segurança
Dependências: R43 R44 R45 R46 R47
Requisito: Permitir IA propor mapeamentos e configurações de conectores em sandbox, com esquema validado, diferenças visíveis, testes e aprovação humana antes da ativação. Não conceder ao modelo poder autônomo de ampliar acesso, criar credenciais ou publicar código sem governança.
Teste: Testar documentação maliciosa, campo sensível indevido, endpoint externo arbitrário, privilégio amplo, código inseguro, segredo em log e reversão de configuração.
Aceite: Proposta é separada de execução; nenhum segredo entra no contexto por padrão; validação determinística, revisão, versão e rollback obrigatórios; conexão real permanece desativada até aprovação de responsável autorizado.
Fontes: S01 S26 S49
Status: Planejado para revisão

## Fontes

### S01 LGPD Lei 13709 de 2018
Lei obrigatória conforme tratamento. Finalidade, bases legais, direitos, segurança e responsabilidades.
https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html

### S02 ANPD comunicação de incidentes Resolução 15 de 2024
Prazo geral de três dias úteis para incidentes com risco ou dano relevante, com condições e exceções aplicáveis.
https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis

### S03 ANPD Resolução 15 de 2024 texto oficial
Registro dos incidentes por pelo menos cinco anos, inclusive não comunicados.
https://bibliotecadigital.mj.gov.br/bitstream/1/12879/2/RES_ANPD_2024_15.html

### S04 ANPD normas vigentes
Inclui Resoluções 18/2024 sobre encarregado, 2/2022 sobre pequeno porte, 19/2024 sobre transferências e 32/2026 sobre adequação da UE.
https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/

### S05 ANPD transferências internacionais
Mapear países, mecanismo, subprocessadores e transferências posteriores. Considerar adequação da UE no âmbito definido na Resolução 32/2026.
https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados

### S06 ANPD orientações sobre RIPD
Avaliação de impacto e alto risco. Não afirmar exigência automática de RIPD para todo app.
https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/relatorio-de-impacto-a-protecao-de-dados-pessoais-ripd

### S07 Marco Civil Lei 12965 de 2014
Art. 15: seis meses de registros de acesso para provedores abrangidos, não de todo conteúdo.
https://www.planalto.gov.br/ccivil_03/_ato2011-2014/2014/lei/l12965.htm

### S08 Decreto 8771 de 2016 consolidado
Art. 13: controle, autenticação, inventário e proteção dos acessos aos registros.
https://planalto.gov.br/ccivil_03/_ato2015-2018/2016/decreto/d8771.htm

### S09 Lei 14510 de 2022 telessaúde
Aplicação condicional à prestação de telessaúde e modelo de intermediação médica.
https://www2.camara.leg.br/legin/fed/lei/2022/lei-14510-27-dezembro-2022-793576-publicacaooriginal-166678-pl.html

### S10 CFM Resolução 2314 de 2022
Telemedicina, SRES, NGS2, consentimento, assistência e responsabilidades. Examinar art. 17 para o modelo concreto.
https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2022/2314_2022.pdf

### S11 Lei 13787 de 2018 prontuário
Guarda e digitalização de prontuário. Vinte anos não devem ser estendidos automaticamente a todo chat.
https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13787.htm

### S12 CFM Resolução 2381 de 2024
Emissão de documentos médicos, dados mínimos e assinatura qualificada no documento eletrônico.
https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2024/2381_2024.pdf

### S13 CFM Resolução 2299 de 2021
Emissão eletrônica, prescrição, regularidade profissional, assinatura verificável e requisitos institucionais.
https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2021/2299_2021.pdf

### S14 Anvisa perguntas e respostas RDC 657 de 2022
Comunicação, agenda e prontuário sem finalidade enquadrável não são automaticamente SaMD.
https://www.gov.br/anvisa/pt-br/centraisdeconteudo/publicacoes/produtos-para-a-saude/manuais/software-como-dispositivo-medico-perguntas-e-respostas/%40%40download/file

### S15 Anvisa RDC 751 de 2022
Classificação de dispositivos e regra 11 para software.
https://anvisalegis.datalegis.net/action/ActionDatalegis.php?acao=abrirTextoAto&cod_menu=1696&cod_modulo=134&link=S&numeroAto=00000751&orgao=RDC%2FDC%2FANVISA%2FMS&seqAto=000&tipo=RDC&valorAno=2022

### S16 Anvisa RDC 848 de 2024
Requisitos essenciais de segurança e desempenho para dispositivos abrangidos.
https://www.gov.br/anvisa/pt-br/assuntos/noticias-anvisa/2024/norma-sobre-requisitos-de-seguranca-para-dispositivos-medicos-entra-em-vigor

### S17 ANS RN 501 de 2022
Regras TISS para operações abrangidas da saúde suplementar.
https://bvs.saude.gov.br/bvs/saudelegis/ans/2022/res0501_01_04_2022.html

### S18 ANS Padrão TISS setembro de 2026
Conferir a versão e cronograma de cada componente, não apenas a competência geral.
https://www.gov.br/ans/pt-br/assuntos/prestadores/padrao-para-troca-de-informacao-de-saude-suplementar-2013-tiss/padrao-tiss-setembro-2026

### S19 ECA Digital Lei 15211 de 2025 atualizada
Em vigor desde 17/3/2026. Avaliar público direcionado ou acesso provável de menores.
https://www2.camara.leg.br/legin/fed/lei/2025/lei-15211-17-setembro-2025-797997-normaatualizada-pl.html

### S20 ANPD ECA Digital
Orientações e Decreto 12880/2026; controles proporcionais a público e funcionalidades.
https://www.gov.br/anpd/pt-br/assuntos/eca-digital

### S21 Lei Brasileira de Inclusão Lei 13146 de 2015
Art. 63 para sítios da internet. Avaliar o conjunto de obrigações para aplicativos nativos.
https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2015/lei/l13146.htm

### S22 ABNT NBR 17060 de 2022 acessibilidade móvel
Fonte institucional participante da elaboração. Confirmar edição e texto licenciado ABNT.
https://www.nic.br/noticia/releases/norma-da-abnt-sobre-acessibilidade-para-dispositivos-moveis-torna-a-navegacao-mais-inclusiva/

### S23 W3C WCAG 2.2
Referência técnica. Proposta de meta AA para web; não declarar conformidade sem avaliação.
https://www.w3.org/TR/WCAG22/

### S24 OWASP MASVS 2.1.0
Padrão voluntário de verificação móvel, incluindo privacidade. Não é certificação LGPD.
https://github.com/OWASP/masvs/releases/tag/v2.1.0

### S25 OWASP MASTG v2
MASTG 2.0.0 de 2026; rastrear controle MASVS, fraqueza MASWE e teste MASTG. Fixar versão/commit.
https://mas.owasp.org/news/2026/07/04/mastg-v200-release/

### S26 OWASP ASVS 5.0.0
Publicado em 30/5/2025; referência para API, backend e web. IDs devem incluir versão.
https://asvs.owasp.org/

### S27 Google Play Health Content and Services
Condição de distribuição: declaração de saúde, privacidade, permissões e alegações.
https://support.google.com/googleplay/android-developer/answer/16679511?hl=en

### S28 Google Play User Data
Dados sensíveis, transparência, consentimento e permissões.
https://support.google.com/googleplay/android-developer/answer/10144311?rd=1

### S29 Google Play exclusão de conta
Fluxo no app e recurso web quando criação de conta se enquadra; explicar conservação necessária.
https://support.google.com/googleplay/android-developer/answer/13327111?hl=en-en

### S30 Google Play Data safety
Declarar práticas reais do app e SDKs.
https://support.google.com/googleplay/android-developer/answer/10787469?hl=en-en

### S31 Google Play target API
Consulta em 6/11/2026: Android comum target API 36 ou superior para novos apps/atualizações; há exceções por dispositivo.
https://support.google.com/googleplay/android-developer/answer/11926878?hl=en

### S32 Apple App Review Guidelines
Condições de distribuição para saúde, entidade publicadora, conteúdo de usuários e privacidade.
https://developer.apple.com/app-store/review/guidelines/

### S33 Apple exclusão de conta
Iniciar exclusão no app quando há criação de conta; conservação legal pode persistir com transparência.
https://developer.apple.com/support/offering-account-deletion-in-your-app/

### S34 Apple requisitos de SDKs de terceiros
Manifestos e assinaturas para SDKs abrangidos; revisar lista atual e dependências.
https://developer.apple.com/support/third-party-SDK-requirements/

### S35 Apple privacidade e uso de dados
Transparência de coleta, rastreamento e responsabilidades por código de terceiros.
https://developer.apple.com/app-store/user-privacy-and-data-use/

### S36 Apple requisitos de submissão
Desde 28/4/2026: Xcode 26+ e SDK iOS 26 ou correspondente; não equivale ao sistema mínimo suportado.
https://developer.apple.com/news/upcoming-requirements/

### S37 ISO IEC 27001 de 2022
Gestão de segurança; considerar emenda 1:2024 e edição nacional aplicável.
https://www.iso.org/standard/27001

### S38 ISO IEC 27002 de 2022
Referência de controles de segurança.
https://www.iso.org/standard/75652.html

### S39 ISO IEC 27701 de 2025
Gestão de privacidade; edição internacional atual encontrada.
https://www.iso.org/standard/27701

### S40 ISO 27799 de 2025
Segurança em saúde; terceira edição de dezembro/2025 substitui 2016.
https://www.iso.org/standard/84647.html

### S41 IEC 62304 de 2006 com emenda 2015
Ciclo de vida de software de dispositivo médico, se aplicável.
https://webstore.iec.ch/en/publication/22794

### S42 ISO 14971 de 2019
Gerenciamento de risco de dispositivos médicos, se aplicável.
https://www.iso.org/standard/72704.html

### S43 IEC 82304 parte 1 de 2016
Segurança de produtos de software de saúde; avaliar escopo e incorporação contratual.
https://www.iso.org/standard/59543.html

### S44 Receita Federal primeiro CNPJ alfanumérico em julho de 2026
Produção alfanumérica em julho/2026; manter compatibilidade com CNPJs existentes.
https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico

### S45 Receita Federal documentação técnica do CNPJ
Fonte para formato e cálculo dos dígitos verificadores. Fixar versão da especificação nos testes.
https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/documentos-tecnicos/cnpj

### S46 Serpro Consulta CPF versão 3
Integração solicita CPF e nascimento. Consulta cadastral não substitui prova de identidade ou representação; preços não verificados.
https://centraldeajuda.serpro.gov.br/duvidas/pt/avisos/avisoconsultacpfv3/

### S47 CFM Resolução 2454 de 2026 inteligência artificial
Resolução de 11/2/2026, publicada em 27/2/2026 e retificada em 5/3/2026. Art. 5 §2 exige mediação humana na comunicação médica abrangida; avaliar âmbito real de médicos/instituições, sem equiparar todo chatbot administrativo a telemedicina.
https://sistemas.cfm.org.br/normas/arquivos/resolucoes/BR/2026/2454_2026.pdf

### S48 HL7 FHIR R5 RESTful API
Especificação v5.0.0/R5 consultada; opção técnica de interoperabilidade, não obrigação genérica deste produto. Fixar versão e perfis acordados com o fornecedor.
https://hl7.org/fhir/http.html

### S49 OWASP Top 10 for LLM Applications 2026
Edição publicada em 4/8/2026; referência voluntária para riscos de IA. Usar fontes finais, não rascunhos, e fixar commit na matriz de avaliação.
https://github.com/GenAI-Security-Project/GenAI-LLM-Top10/blob/main/2026/README.md
