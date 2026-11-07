# Migração e portabilidade

Plano de portabilidade e runbook **não executado**, revisado em06/11/2026. Atualização: a fundação do projeto Connect já foi aplicada separadamente; ver [evidência de implantação](../testing/IMPLANTACAO-SUPABASE-ONLINE.md). Este runbook de exportação/importação continua sem execução. Qualquer migração futura exige autorização para o alvo exato e dados sintéticos nesta etapa; outros projetos e ambientes permanecem separados.

## Origem e destino separados

O Connect tem configuração local própria, `resicheck-connect-local`, portas 56320–56330 e migrações em `supabase/migrations/`. O ResiCheck existente não é destino de testes. Os nomes de tabelas/funções atualmente propostos em `public` pertencem ao Connect: **não aplicar suas migrações no ResiCheck**. Uma migração aditiva pode conflitar com nomes, grants, funções ou políticas já existentes, mesmo sem apagar tabelas.

Recomendação inicial: **projeto próprio para o Connect**, com administração, chaves, Auth, Storage, capacidade, backups e ciclo de restauração próprios. Isso facilita delimitar uma migração, mas não substitui RLS, autorização ou testes. A modalidade e o custo do destino continuam em avaliação.

Usar schema separado dentro de um projeto compartilhado é apenas opção a avaliar. Schema não cria um projeto independente: Auth e identidades, administração privilegiada, recursos de computação, conexões, extensões, grants, configurações de API, Storage e operações de backup/restauração podem continuar compartilhados. Seria necessário inventariar colisões, quotas, ownership, `search_path`, políticas e alcance dos operadores antes de decidir. Não presumir economia ou isolamento porque as tabelas receberam outro prefixo.

Docker/Supabase completo está bloqueado pela falha de inicialização do backend Docker Desktop documentada em [README-LOCAL](../../supabase/README-LOCAL.md). A frente independente de PostgreSQL 17 descartável com fixture mínima de Auth permite testar SQL, transações e RLS; **não valida Supabase Auth**, login, tokens, sessões reais, Storage ou Realtime. Nenhum resultado dessa fixture comprova migração desses serviços.

## Como manter a saída viável

- Migrações SQL versionadas são a fonte de verdade do schema da aplicação. Mudanças efetivas passam por migração revisada; comparar o banco com o histórico detecta drift. Não depender de cliques no painel ou de um dump isolado para reconstruir o modelo.
- Configuração por ambiente, sem URLs ou chaves fixas nas regras de domínio. Adaptadores delimitam autenticação, persistência, eventos e arquivos; o principal autenticado e as políticas do domínio não são substituídos por um SDK nas telas.
- IDs internos estáveis e FKs explícitas; CPF/CNPJ não são chaves de transporte público. IDs de empresa, conta, conversa, mensagem e arquivo devem ser preserváveis sem incorporar hostname ou referência do projeto.
- Registrar dependências reais de Postgres/Supabase e suas versões. Portabilidade para outro Postgres não significa que Auth, Realtime, funções, Storage e APIs equivalentes apareçam automaticamente.
- Inventário de configuração não contém segredos. Referências a credenciais ficam em mecanismo restrito por ambiente; dumps, hashes de senha, tokens e anexos nunca entram no Git, APK ou entrega pública.

## Runbook para uma futura migração autorizada

Cada passo depende de destino e acesso explicitamente autorizados. Primeiro ensaiar o processo com dados sintéticos em destino descartável isolado. Não há comando de exportação ou importação a executar nesta etapa.

### 1. Inventariar e fixar compatibilidade

Registrar versões de PostgreSQL, CLI e serviços, extensões e versões instaladas, encoding/collation, timezone, schemas, ownership, roles/grants, funções, triggers, RLS, índices, sequências, publicações e dependências externas. Incluir políticas/alterações próprias em schemas gerenciados, configurações Auth, buckets e jobs. Identificar o que é específico do provedor e separar do modelo de negócio.

Escolher ferramentas de dump/restauração compatíveis e conferir as limitações de versão antes do ensaio; não presumir downgrade de PostgreSQL ou presença das mesmas extensões no destino. `pg_dump` cobre um banco; objetos globais do cluster exigem inventário próprio. Revisar o conteúdo a restaurar, pois uma restauração pode executar código presente na origem. Referência: [PostgreSQL 17 — pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html).

### 2. Demonstrar backup restaurável

Definir janela de referência e conjunto completo de artefatos: schema, dados, configuração necessária, manifestos de objetos e procedimento Auth/Storage. Guardar backups com acesso restrito e retenção definida. Um arquivo existente não prova recuperação: restaurar em ambiente vazio de teste e registrar erros, duração, versões e verificações. Não testar restauração sobre o projeto em uso.

Conferir a inclusão efetiva de roles, schema e dados pelo método escolhido, além de alterações próprias em `auth` e `storage`; não presumir que uma seleção padrão incluiu tudo. A orientação oficial tem etapas distintas para esses componentes. Referência: [Supabase — backup e restauração pela CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

### 3. Preservar identidade e integridade

Aplicar migrações aprovadas e transferir dados em ordem compatível com FKs. Preservar IDs sempre que possível; quando a plataforma exigir mudança, manter um mapa restrito e completo origem → destino, incluindo usuários Auth, vínculos, autoria, conversas e arquivos. Nenhuma referência pode apontar para outra pessoa/empresa por remapeamento parcial. Conferir sequências, unicidade, registros órfãos e histórico de migrações; não reaplicar sobre schema já restaurado sem reconciliar o histórico.

Auth exige procedimento oficial da versão/serviço escolhido para usuários, identidades associadas, hashes de senha, MFA, sessões e recuperação. Não inventar SQL contra estruturas internas nem criar senha em texto puro para facilitar transferência. A documentação Supabase descreve migração de usuários e hashes, mas alerta que a validade dos tokens depende das chaves do projeto; não prometer sessões preservadas. Planejar e ensaiar reautenticação, revogação e atualização dos clientes, sem copiar chaves automaticamente. Referência: [Supabase — migração de usuários Auth](https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects).

### 4. Transferir arquivos e políticas

Tratar separadamente **bytes dos objetos**, buckets, metadados, propriedade, caminhos, referências no chat e políticas de acesso. Backup do banco contém metadados do Storage, **não baixa os bytes dos arquivos**; restaurar linhas não recupera um blob ausente. Referência: [Supabase — limites dos backups](https://supabase.com/docs/guides/platform/backups).

Copiar por mecanismo autorizado de Storage, preservando privacidade e manifestos por empresa/conversa; reconciliar quantidade, tamanho e hash dos bytes, sem usar nome de paciente como chave de objeto. Conferir versões/derivadas quando aplicável. Links assinados e URLs antigos não são prova de portabilidade: emitir novos pelo adaptador autorizado e testar expiração, revogação e negação entre empresas. Não promover bucket a público para fazer a migração funcionar.

### 5. Validar com privilégios de usuário

Configurar URLs, callbacks permitidos, chaves, grants e adaptadores do destino por ambiente. Chaves privilegiadas permanecem no servidor; segredos não fazem parte dos relatórios. Validar comunicação e TLS conforme o destino definido, sem baixar o nível de proteção para superar erros de migração.

Executar matriz de gestor/funcionário/paciente/ADM, duas empresas e dois pacientes, funcionário pendente/revogado e paciente multivínculo. Testar endpoints diretos, RLS, RPCs, Storage, eventos, busca, exportação e prévias permitidas. Usar clientes efetivamente não administrativos: sucesso com superusuário ou `service_role` não demonstra que RLS e API do usuário funcionam. Confirmar que funções/views/grants não abrem caminhos que os testes de tabela omitiram.

### 6. Fazer a virada com reconciliação

Antes da virada, definir responsável, critérios de aprovação, tempo máximo de indisponibilidade e janela de retorno. Ensaiar. Na janela aprovada, pausar novas escritas, uploads e produtores de eventos/jobs na origem; drenar ou registrar operações em trânsito e retries com IDs idempotentes. Fazer sincronização final consistente e reconciliar contagens por empresa/recurso, FKs, tamanhos/hashes de arquivos e operações pendentes.

Só então trocar o destino dos adaptadores/clientes autorizados, renovar credenciais/sessões conforme o plano Auth e executar as jornadas essenciais. Evitar dois destinos aceitando escritas sem estratégia explícita de replicação e resolução de conflitos. Retomar gravações após os critérios passarem; observar erros sanitizados e integridade sem registrar conteúdo sensível.

### 7. Retornar sem perder novas escritas

Manter a origem anterior preservada e sem exclusão durante a janela de retorno acordada. Falhou antes de liberar escritas no destino: revalidar a origem e reverter o roteamento conforme o plano. Falhou depois: pausar novamente, identificar escritas/uploads aceitos no destino e reconciliá-los com IDs e hashes antes de voltar. Simplesmente apontar a URL antiga pode perder mensagens ou gerar duplicatas.

Se a origem não comportar o delta ou houver conflito não resolvido, manter o modo de manutenção e o conjunto de evidências, em vez de descartar dados para cumprir prazo. Testar o procedimento de retorno no ensaio, inclusive sessões e permissões. Encerrar a janela e eliminar cópias antigas somente por política de retenção e autorização específica; nunca apagar fontes como etapa automática da virada.

## Evidência exigida para considerar portável

Relatório sem segredos com versões e commit das migrações, inventário de componentes, restauração ensaiada, reconciliação de dados/bytes, mapa de IDs quando necessário, testes negativos não administrativos, tempo de virada e retorno demonstrado. Nesta etapa existe o plano; **nenhuma exportação, restauração ou migração de dados foi executada**. Custo, acesso autorizado à organização e execução remota seguem sob coordenação; nenhum provisionamento remoto foi feito nesta frente.
