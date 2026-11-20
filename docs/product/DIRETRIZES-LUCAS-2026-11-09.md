# Diretrizes confirmadas por Lucas em09/11/2026

Fonte: orientações delegadas do chat principal01a1a74d-d3da-7246-a793-7b1b3de920e3. Registro de requisitos; não prova implementação ou implantação. A fila executável continua exclusivamente emproject-board.json.

## Visual e entrega

Lucas: “melhorou bastante, eu vou aprovar essa como uma transição, uma direção boa, pra final. (falo das telas)”. O Phone14 preserva essa direção e foi entregue para teste com contas fictícias. Desempenho e tempos de carregamento são prioridade contínua (APP-054), sem declarar medidas de emulador como resultado físico.

## Empresa e administração

Cadastro inicial deve conferir automaticamente existência do CNPJ e correspondência com o nome informado. Isso substitui a proposta de revisão documental prévia de representação para toda criação. Consulta cadastral não prova titularidade; documentos entram em contestação privada, com análise humana por Lucas e revinculação do gestor em painel ADM. Não há ADM real concedido, bootstrap do UUID de Lucas, tela ADM, upload de contestação ou transferência implementados no APK14. A fila217 é candidata local de metadados, não painel completo.

A consulta deve usar fonte autorizada; normalização determinística e seleção de nome oficial evitam aproximação ambígua. Falha da fonte não significa aprovação. CNPJ duplicado não concede poderes; criação e primeiro vínculo precisam de transação idempotente, unicidade e testes de corrida. Identidade pessoal e eventual renovação220 são temas separados;220 não deve virar pré-requisito da nova consulta de empresa.

Contestações exigem autenticação, documentos privados, registro de acesso por documento e decisão auditada por revisor autorizado. Upload não transfere poderes. A prévia de transferência precisa listar gestores afetados (o esquema permite vários), vincular alvo/versão/sessão/geração da concessão e impedir replay. Todas as mutações de gestão precisam compartilhar controle de concorrência da autoridade; bloquear só a empresa não resolve corrida com approve_staff/revoke_staff. Não alterar automaticamente papéis de funcionário/paciente ou históricos. Se o antigo gestor também for funcionário, a decisão de remover esse acesso deve ser explícita. Nenhuma concessão online ou envio de documento real foi realizado.

## Imagens e moderação

OpenAI foi escolhido para moderação automática inicialmente apenas das fotos de perfil pessoal e empresarial. Chat será moderado somente após denúncia; esta definição já foi esclarecida. Ocultar imagem somente para si é independente da denúncia e não apaga o original do sistema. Imagem pendente fica privada, sem URL distribuída; terceiros veem marcador genérico com aparência borrada sem pixels derivados do original. Aprovação não amplia acesso ao chat. Falha de análise mantém pendente.

Lucas: “No chat a gente só roda a moderação em imagens taggadas com denúncia. Ao se confirmar, a imagem é apagada definitivamente e a conta responsável toma um warning. 3 warnings é suspensão.”

Implementação futura: denúncia autenticada, autorização por conversa, deduplicação por imagem canônica e warning único por imagem/remetente original; preservar original privado até decisão. Confirmar infração com revisão e recurso para falsos positivos antes de exclusão irreversível; resultado automático e suposta idade não são decisão infalível. Imagens clínicas legítimas exigem contexto. Definir etapa final de decisão/recurso antes de purge e explicar que arquivo permanentemente apagado não pode ser recuperado por recurso posterior. Guarda, derivados, cache e backups exigem escopo verificável. Nenhuma imagem real foi enviada à OpenAI, nenhuma conta foi suspensa e nenhum arquivo foi apagado nesta fatia.
