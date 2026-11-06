# Orientações do projeto

Nome provisório: ResiCheck Connect. Exemplos v0.2 e verde como padrão aprovados pelo usuário; direção visual em `docs/product/DIRECAO-VISUAL.md`. Aprovação visual não prova funcionamento/acessibilidade. Usar o logo ResiCheck somente após localizar/verificar o arquivo autorizado pelo usuário.

## Produto e autonomia

- Android primeiro; preservar a possibilidade de iOS. Web não substitui a validação Android.
- Primeira fase apenas cadastro, vínculos e chat: não desenvolver agenda, integrações externas ou IA antes de o app funcionar sem eles. Preparar só fronteiras para o futuro; dependências de funções futuras não bloqueiam o MVP de chat.
- Ler `docs/project/STATUS.md` e `project-board.json` antes de trabalho relevante. O board é a única fila atual.
- A recomendação inicial é React Native, Expo e TypeScript; o backend permanece proposto. Não afirmar arquitetura aprovada, serviço disponível ou APK existente sem evidência.
- Avançar no trabalho local reversível autorizado. Contratação, contas, credenciais, instalação de software, publicação, compartilhamento e uso de dados reais exigem autorização correspondente.
- Preservar o ResiCheck e outros projetos. Reutilizar seus padrões de organização, sem copiar implementação nem regras de negócio.

## Desenvolvimento e testes

- Usar exclusivamente dados sintéticos. Nunca incluir documentos, identificadores, mensagens ou arquivos de pacientes reais em fixtures, logs, screenshots, Drive ou commits.
- Separar regras de domínio, acesso a dados e interface com contratos pequenos; evitar abstrações antecipadas e dependência de fornecedor nas telas.
- Testes principais ficam a cargo do assistente: regras, componentes, integração com autorização e jornadas no emulador. Ver `docs/testing/ESTRATEGIA.md`.
- Alterações de texto e documentação pedem só validação pertinente. Permissões, persistência, concorrência, anexos e autenticação pedem testes de integração reais.
- Nunca tratar mock, screenshot web, lint ou build bem-sucedido como prova de funcionamento Android ou isolamento de dados.
- Controle de informação por gestor, funcionário, paciente e ADM é prioridade da fundação, aplicado no backend e em todos os canais. Logs restritos, erros detalhados e discussões privadas de desenvolvimento nunca são conteúdo de usuário comum. Ver `docs/architecture/CLASSIFICACAO-E-PERMISSOES.md`.
- Funcionário tem inicialmente uma empresa; paciente pode ter várias e escolhe contexto após login. Não unificar históricos clínicos entre empresas. Telemedicina e decisões clínicas estão fora do escopo atual.
- Todos os funcionários aprovados veem todas as conversas dos pacientes da própria empresa. Paciente tem vínculo imediato e acesso só aos dados públicos gerais permitidos da empresa e ao próprio chat. Indicadores de atendente principal/última mensagem não são permissões; não inventar regras de desempate ou casos sem funcionário.

## Controle e entrega

- Registrar critérios de aceite, próxima ação e evidência no board. `done` significa o critério do item demonstrado; não implica produto pronto.
- Executar `npm run project:status` após alterar o board. Não editar STATUS.md manualmente.
- Antes de concluir uma fatia, executar `npm run project:check` e as verificações proporcionais ao comportamento alterado.
- Não commitar segredos, arquivos `.env`, chaves de assinatura nem binários gerados. Documentar limitações dos testes e bloqueios concretos.
- Entregas de teste precisam de versão, hash SHA-256, instruções curtas e evidência no mesmo lote. Drive serve para APK/assets sintéticos; não é o banco de chat.
- Requisitos R01–R48 estão incorporados ao board com fontes, dependências e marcos. Snapshots em `docs/research/` são fontes históricas, não filas paralelas. Aplicar gates por função/marco; documentação não prova implementação nem conformidade.
