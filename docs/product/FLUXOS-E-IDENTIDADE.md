# Fluxos, identidade e vínculos — 06/11/2026

Estado: especificação dos fluxos solicitados, com propostas técnicas e decisões pendentes identificadas. Nenhum cadastro, consulta de CPF/CNPJ, integração oficial ou controle de acesso foi implementado. A pesquisa específica de fontes oficiais e a matriz de normas em andamento deverão complementar este documento.

Telemedicina está fora do escopo atual, por definição explícita do usuário. Os fluxos de chat são administrativos/operacionais; receber guias e documentos não concede autorização para atendimento médico, interpretação clínica ou decisões terapêuticas. A presença de dados de saúde mantém a necessidade de controle de acesso e privacidade.

## Conta e vínculo são coisas diferentes

Uma pessoa cria uma conta individual com CPF, para cadastro único. Papéis operacionais pertencem ao vínculo com cada empresa; ter uma conta não concede acesso à empresa. O vínculo de paciente não promove ninguém a funcionário e um funcionário de A não herda acesso a B.

Regra posterior explícita: **funcionário fica vinculado a uma única empresa inicialmente**. Convite e solicitação por busca devem respeitar essa cardinalidade no servidor, inclusive em requisições concorrentes. Pacientes podem ter várias empresas vinculadas; após login, escolhem a empresa de contexto ou vinculam outra. Essa escolha não unifica históricos clínicos, conversas ou documentos. A restrição de funcionário não define automaticamente a cardinalidade de gestor, que continua pendente.

Como proposta, a conta guarda separadamente a verificação do contato, o resultado de consulta cadastral e a evidência de identidade. Cada vínculo registra empresa, papel, estado, solicitante, aprovador quando necessário e histórico. O identificador interno da conta deve ser independente do CPF; evitar CPF em URLs, links de convite, analytics e logs. O desenho de unicidade e recuperação deve impedir que cadastro fraudulento bloqueie permanentemente o titular, sem revelar a terceiros se determinado CPF já possui conta.

## Gestor da empresa

1. Abre o aplicativo e cria sua conta individual, incluindo CPF e confirmação robusta de identidade.
2. Seleciona **Cadastrar uma empresa** e informa o CNPJ.
3. Passa por verificação da existência/situação cadastral da empresa e da sua autoridade para representá-la. Cadastro de CNPJ encontrado não basta para conceder gestão.
4. Após as verificações necessárias, acessa a empresa e envia links para cadastro de funcionários.
5. Analisa os pedidos de vínculo. Aprovar, recusar ou revogar deve registrar autoria e data e produzir mudança efetiva de acesso no servidor.

Proposta de estado da empresa: cadastro em elaboração → verificação pendente → ativa, ou recusa com possibilidade de correção. A política para situações cadastrais diferentes de ativa, disputa por CNPJ e troca do gestor permanece em aberto; não inventar bloqueio fiscal ou transferência automática de titularidade.

## Funcionário com link

1. Abre o link e vê a empresa de destino e o papel de funcionário.
2. Cria conta individual com CPF checável e confirmação de identidade proporcional ao risco, menos onerosa que a do gestor quando isso for adequado. Se já tem conta, autentica-se nela em vez de criar outra.
3. Com **convite válido enviado pelo gestor**, vincula-se e entra diretamente, sem aguardar uma segunda aprovação. O convite expressa a autorização do gestor; a validação técnica do convite e a autenticação da conta não criam uma etapa de aceite humano adicional.
4. Vê todas as conversas dos pacientes da sua empresa, conversa com pacientes e funcionários e fornece o link de cadastro de pacientes. A leitura das conversas não depende de atribuição individual.

## Funcionário sem link

1. Abre o app, cria sua conta ou entra na conta existente.
2. Escolhe **Vincular a uma empresa**, busca a empresa e seleciona **Funcionário**.
3. Solicita vínculo e aguarda aceite. Nenhuma conversa, anexo ou lista de pacientes fica acessível enquanto pendente.
4. Após aceite, recebe os mesmos recursos de um funcionário aprovado pelo fluxo com link.

Correção explícita posterior do usuário: a interpretação anterior de espera nos dois caminhos está superada. **Só a solicitação sem convite aguarda aceite**. Recusa, revogação, pedido duplicado, link expirado e cancelamento precisam de resposta compreensível. Convite inválido/expirado/revogado não libera acesso, mas um convite válido não deve ser convertido em pedido pendente.

Definir validade, revogação, uso único ou reutilização autorizada e vinculação a destinatário conforme risco. Validação no servidor deve conferir origem do gestor, empresa, papel e uso permitido; não confiar em parâmetros editáveis nem inserir CPF no link. Esses controles são técnicos e não uma segunda aprovação. Token, armazenamento protegido, prevenção de reuso indevido e revogação serão implementados/testados no backend, sem presumir que a simulação local os comprova.

Se já houver vínculo de funcionário em outra empresa, um novo convite/pedido não pode criar um segundo vínculo. A política de transferência, encerramento de vínculo anterior e pedidos simultâneos será definida antes de implementar; nunca migrar conversas ou histórico para a nova empresa. Decidir explicitamente se pedidos pendentes reservam a exclusividade, preservando em todos os casos a garantia de não haver dois vínculos ativos.

## Paciente com link

1. Abre o link da empresa e cria sua conta com CPF necessário e checável, com dados mais simples e proteção adequada. Conta existente deve poder ser reutilizada.
2. Conclui as verificações aplicáveis e entra no vínculo de **Paciente** com a empresa indicada.
3. Acessa o chat **com a empresa**, sem escolher funcionário.

## Paciente sem link

1. Abre o app e cria sua conta com CPF, ou entra na conta existente.
2. Escolhe **Vincular a uma empresa**, busca a empresa e seleciona **Paciente**.
3. Conclui o vínculo e conversa com a empresa, sem escolher funcionário.

O vínculo do paciente é imediato, sem aprovação manual do gestor. Autenticação e verificações da conta permanecem necessárias, sem transformar essa jornada em fila de aceite. O paciente acessa apenas nome, endereço e telefones públicos da empresa e seu próprio chat, onde envia mensagem e aguarda. Todos os funcionários aprovados da empresa veem as conversas de seus pacientes; indicadores de atendente principal e última mensagem não criam acesso exclusivo. Ver [MVP-CHAT.md](MVP-CHAT.md) para critérios e decisões ainda abertas.

Após login, o paciente escolhe uma empresa já vinculada ou vincula nova empresa. Na primeira fase, cada contexto mostra informações públicas permitidas da empresa e o próprio chat/anexos. Agenda é futura. Trocar empresa mantém separação de autorização, eventos em tempo real, cache, rascunhos, anexos e ações pendentes; não presume compartilhar identidade clínica ou unificar histórico. O vínculo já existente não é duplicado ao repetir convite da mesma empresa.

A busca de empresa expõe apenas os dados necessários para identificar o destino. Não permite enumerar funcionários, pacientes, CPFs, mensagens ou documentos. Campos públicos, limites de busca e critérios para empresas aparecerem no diretório ainda serão definidos.

## Administrador da plataforma

Login → painel com lista de empresas, lista de usuários, auditoria, logs e recursos operacionais necessários. O mecanismo inicial de concessão desse privilégio deve ser separado do cadastro público; ninguém se promove pelo app ou pela URL.

Propostas de controle: autenticação reforçada/MFA, privilégios por função, auditoria de consultas e alterações, mascaramento de CPF, busca restrita, exportação limitada e logs sem conteúdo de mensagens, anexos, tokens ou credenciais. Distinguir administrador da empresa de operador da plataforma.

O painel pode permitir suporte e gestão sem abrir o conteúdo clínico. Qualquer necessidade excepcional de acesso a mensagens/documentos exige finalidade, permissão específica, duração, justificativa e trilha auditável definidas antes de implementar. Acesso irrestrito e personificação silenciosa não são pressupostos deste fluxo.

## O que significa verificar CPF, CNPJ e identidade

| Etapa | O que demonstra | O que não deve ser presumido |
| --- | --- | --- |
| Validação local de formato/dígitos | Entrada coerente com as regras do identificador | Existência no cadastro oficial ou identidade do usuário |
| Consulta cadastral oficial de CPF | Resultado cadastral da fonte consultada e data | Que quem digitou o número é seu titular |
| Confirmação de contato | Controle do canal usado na verificação | Titularidade do CPF ou autoridade sobre uma empresa |
| Confirmação de identidade | Evidência de vínculo entre a pessoa e a identidade declarada, conforme método escolhido | Acesso automático a papéis, empresas ou conversas |
| Consulta cadastral de CNPJ/QSA | Informações oficiais de cadastro e quadro societário/administradores disponíveis | Que a sessão atual pertence a representante autorizado |
| Comprovação de representação | Evidência avaliada de autoridade para agir pela empresa | Permissão ilimitada na plataforma ou poder permanente após revogação |

A Receita disponibiliza consulta de situação cadastral e autenticação de comprovantes de CPF. Isso descreve uma consulta cadastral, não uma confirmação da identidade do usuário do nosso app. [Serviço oficial de CPF](https://www.gov.br/pt-br/servicos/consultar-cadastro-de-pessoas-fisicas).

O serviço de CNPJ permite obter informações cadastrais, situação e QSA. Como conclusão de projeto, comparar essas informações com a identidade do gestor é uma etapa, mas não substitui analisar sua representação atual. [Serviço oficial de CNPJ](https://www.gov.br/pt-br/servicos/consultar-cadastro-nacional-de-pessoas-juridicas).

Essas páginas para consulta pelo cidadão não comprovam disponibilidade de API gratuita para automação privada. Provedor autorizado, condições de acesso, custo, finalidade, campos retornados e método de confirmação de identidade serão definidos na pesquisa específica. Não usar scraping, contornar CAPTCHA nem prometer login gov.br ou biometria sem validar elegibilidade e integração. Não consultar números reais nesta preparação.

### Requisitos já identificados na pesquisa oficial

- CNPJ alfanumérico já está em produção e convive com o numérico. O campo deve ser tratado como string de 14 posições, com normalização e cálculo de dígitos conforme a especificação oficial. Não usar tipo numérico, teclado exclusivamente numérico ou máscara que rejeite letras. A implementação terá testes dos dois formatos e preservará zeros iniciais. Não usar o CNPJ real da notícia como fixture. [Receita Federal: primeiro CNPJ alfanumérico](https://www.gov.br/receitafederal/pt-br/assuntos/noticias/2026/julho/receita-federal-gera-o-primeiro-cnpj-em-formato-alfanumerico).
- A Consulta CPF v3 do Serpro exige CPF e data de nascimento na consulta. Caso essa API seja escolhida, o contrato e o fluxo de cadastro deverão contemplar esse requisito; isso não transforma a consulta em prova de identidade. A documentação distingue demonstração simulada de chamadas ao endpoint de produção, que contabilizam consumo; não fazer chamadas reais para testar. Tarifas, elegibilidade e contratação ainda não foram verificadas. Nenhuma chave ou integração real foi criada. [Serpro: Consulta CPF v3](https://centraldeajuda.serpro.gov.br/duvidas/pt/avisos/avisoconsultacpfv3/).

## Decisões em aberto

- Qual confirmação de identidade é suficiente em cada papel; quando reforçar uma verificação e como recuperar conta perdida ou contestada.
- Como provar representação: relação com o QSA, procuração ou outros documentos; quem revisa exceções, com que dados e por quanto tempo.
- Como tratar CNPJ já cadastrado, filiais, mudança societária e substituição/revogação de gestor.
- Como solicitar consulta oficial de CPF/CNPJ de forma autorizada e econômica; frequência de rechecagem e tratamento de divergência/indisponibilidade sem marcar pessoa como fraude automaticamente.
- Como atender menores/responsáveis e exceções ao CPF sem inventar escopo antes da decisão do produto.
- Regras do chat interno, se gestor também atende, política de auditoria/retenção e critérios pendentes dos indicadores de atendente. Já definido: todos os funcionários aprovados veem todas as conversas dos pacientes de sua empresa.
- Se o painel da plataforma será web e quais ações exigirão privilégio adicional. Web secundária do produto não impede painel operacional próprio, mas isso ainda é proposta.

Não há conformidade certificada por esta especificação. Os controles descritos precisam de implementação, testes e avaliação aplicável antes de dados reais.
