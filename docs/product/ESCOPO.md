# ResiCheck Connect — escopo inicial — 06/11/2026

Aplicativo de comunicação administrativa entre empresas e pacientes. A primeira fase entrega cadastro, vínculos e chat com documentos; agenda, integrações e IA ficam para fases posteriores. Prioridade Android, com possibilidade de iPhone na mesma base e web em segundo plano.

Nome provisório: **ResiCheck Connect**. A [direção visual](DIRECAO-VISUAL.md) define experiência Android limpa, fluida e ergonômica, com identidade própria, base neutra/pastel, verde aprovado como padrão e temas na precedência usuário > empresa > padrão. Exemplos v0.2 foram aprovados como direção, ainda sem validação funcional/acessibilidade.

Requisito de qualidade: aplicativo leve e fluido, com suporte a aparelhos antigos tanto quanto viável na stack mantida e nas lojas. O [plano de protótipo/desempenho](../project/PROTOTIPO-E-DESEMPENHO.md) separa orçamento proposto, versão mínima, SDK de compilação e validação em aparelho modesto; nenhum número foi medido ainda.

**Telemedicina está fora do escopo atual**, conforme esclarecimento explícito do usuário. O chat serve à comunicação administrativa/operacional da empresa com o paciente; não autoriza prestação médica ou decisões clínicas. Mensagens e documentos ainda podem conter dados sensíveis e precisam das proteções previstas.

Prioridade da fundação: [informação por papel, empresa e vínculo](../architecture/CLASSIFICACAO-E-PERMISSOES.md). Gestor, funcionário, paciente e ADM têm destinatários e permissões distintos; dados técnicos, logs restritos e discussões privadas de desenvolvimento não devem aparecer ao usuário comum. Regras no backend cobrem API e canais derivados, além da interface.

## Jornadas definidas pelo usuário

Os fluxos detalhados em [FLUXOS-E-IDENTIDADE.md](FLUXOS-E-IDENTIDADE.md) substituem a descrição inicial resumida. Estão especificados, ainda não implementados.

1. Gestor cria conta individual com CPF e confirmação robusta de identidade, seleciona cadastrar empresa e informa CNPJ. A verificação distingue existência da empresa e autoridade de representação. O gestor envia links para funcionários e analisa pedidos de vínculo.
2. Funcionário cria conta com CPF pelo convite válido enviado pelo gestor e entra diretamente, sem segunda aprovação. Sem convite, cria conta, busca a empresa e solicita vínculo, aguardando aceite do gestor. Depois de autorizado por um desses caminhos, conversa com pacientes e funcionários e fornece links de cadastro para pacientes.
3. Paciente cria conta com CPF pelo link ou busca a empresa e escolhe o vínculo de paciente. O vínculo é imediato, sem aceite do gestor: acessa somente nome, endereço e telefones públicos da empresa e seu próprio chat, onde envia mensagem e aguarda resposta. Não escolhe funcionário nem acessa o acervo empresarial.
4. Administrador da plataforma entra em painel próprio com empresas, usuários, auditoria e logs, sujeito a privilégios explícitos. Esse papel não implica leitura irrestrita de mensagens e documentos.
5. Todos os funcionários aprovados da empresa veem todas as conversas dos pacientes dessa empresa. A equipe vê atendente principal (quem mais enviou mensagens) e atendente da última mensagem; desempates e casos especiais permanecem em aberto.

O detalhamento da primeira fase e suas pendências está em [MVP-CHAT.md](MVP-CHAT.md). Agenda de consultas/exames é futura e não bloqueia o chat funcional.

O produto inclui [notificações configuráveis](NOTIFICACOES.md): marcação de mensagens importantes por funcionários, filtro todas/somente importantes e quatro níveis de conteúdo visível, com padrão seguro proposto apenas com o nome do app. O filtro não presume permissão concedida pelo sistema.

## Hipóteses reversíveis para o MVP

- Uma aplicação com experiências por vínculo: gestor da empresa, funcionário e paciente. Administrador da plataforma é um privilégio separado do gestor; a forma de entrega do painel ainda será decidida.
- Chat assíncrono de texto e anexos; voz, vídeo, IA clínica e integração com WhatsApp ficam fora da primeira fatia.
- Não desenvolver agenda, APIs de integração externa ou IA na primeira fase. Preparar apenas fronteiras que possam acomodar esses dados/interações futuramente; o app precisa funcionar sem eles.
- Cadastro e participação de paciente separados por empresa. Um link público não torna os dados da empresa públicos.
- Pacientes podem se vincular a várias empresas. Após login, escolhem uma empresa vinculada ou vinculam uma nova; histórico e acesso permanecem isolados por empresa.
- Inicialmente, cada funcionário pode ter vínculo com apenas uma empresa. Cadastro por convite ou busca não contorna essa restrição; mudança de empresa terá política explícita.
- Não incluir prontuário, prescrição, cobrança, convênios ou integração com laboratórios antes de validar a jornada principal.

## Extensões planejadas pelo usuário

O chat deverá aceitar futuramente atendimento por API generativa com revisão de funcionários. As integrações devem permitir saída de dados pertinentes de paciente e consulta/exame para sistemas de agenda, entrada de agendas e catálogos de procedimentos/consultas e configuração de conectores assistida por IA. ResiCheck e agenda CPA são destinos potenciais, ainda sem API verificada ou conexão implementada. Ver [arquitetura das extensões](../architecture/EXTENSOES-IA-E-INTEGRACOES.md).

Autonomia administrativa, escopos de dados e revisão por risco serão definidos antes da implementação. A IA planejada atende tarefas administrativas/operacionais e encaminha demandas clínicas ao humano; telemedicina e decisões clínicas estão fora do escopo atual. A primeira fatia continua focada nos fluxos básicos Android.

## Pontos que alteram implementação

Definir durante a primeira fatia: nome final; método de login, recuperação e confirmação de identidade por papel; contratação/autorização da consulta oficial de CPF/CNPJ; comprovação de representação da empresa; desempate e casos especiais dos indicadores de atendente; limites de anexos; notificações; retenção e exclusão. Menores, responsáveis e pessoas sem CPF não foram definidos. Decisões de reserva, duração e recursos da agenda pertencem à fase futura e não bloqueiam o MVP de chat.
