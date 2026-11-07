# Fundação Supabase online aplicada

06/11/2026. Projeto único autorizado: `ibdlvlwdzmsrbqadrudb`, URL confirmada `https://ibdlvlwdzmsrbqadrudb.supabase.co`. Revalidados URL, banco vazio, histórico, catálogo e hash antes de uma única chamada apply_migration. Nenhum outro projeto foi consultado ou alterado.

## Migração e histórico

**Aplicação confirmada**, nome `connect_foundation`, versão remota **20261106200713**. SHA-256 dos bytes autorizados: `445da1ce346266e485ae3e8103f2888337d626c5a280f90bb3f80b71d763b0f3`. Resultado de apply_migration: sucesso; histórico pós-operação contém uma migração e public contém cinco tabelas. Checks de RLS, grants, funções privadas/search_path e índice de exclusividade passaram no banco remoto.

O serviço atribuiu a versão de execução, diferente da versão de preparação local `20261106185009`. Para não reaplicar a fundação no próximo fluxo CLI, a migração canônica foi **renomeada, sem mudar bytes**, para `supabase/migrations/20261106200713_connect_foundation.sql`. O arquivo originalmente aprovado foi preservado em `supabase/deployment/approved/20261106185009_connect_foundation.sql`, fora da pasta de aplicação automática. Ambos mantêm o mesmo hash. Não houve edição manual do histórico remoto. Recibo e mapeamento em `supabase/deployment/receipt.json`.

O script de aplicação gravou um journal antes da chamada e não possui retry automático. A confirmação veio da leitura independente do histórico/tabelas. Não repetir esse payload: novas mudanças precisam de migração própria e revisão.

## Testes online executados

| Frente | Resultado |
| --- | --- |
| Catálogo | RLS em public/private; sem escrita direta de cliente; sem SELECT privado; wrappers expostos invoker; funções privilegiadas com search_path vazio; roles anon/authenticated sem superuser/BYPASSRLS |
| SQL/RLS negativo | **33 assertions passaram** com papéis reais não privilegiados, contexto sem sessão e claims sintéticas inexistentes; leitura/escrita/comandos não ganharam acesso; helpers de teste foram revertidos por ROLLBACK |
| Gateway/Auth público | Chave pública aceita pelo endpoint de settings: HTTP200, sem imprimir ou persistir a chave na evidência |
| Data API anônima | Leitura e escrita recusadas: HTTP401, código42501 |
| Token inválido | Gateway recusou: HTTP401, PGRST301 |
| RPC sem sessão | Recusada: HTTP401, código42501 |
| Auth com credenciais inexistentes sintéticas | Recusado: HTTP400, invalid_credentials; sem signup, conta, e-mail ou SMS |
| Resíduos de aplicação | profiles/companies/memberships/conversations/messages com zero registros após os testes |

São **seis verificações HTTP** além das 33 SQL e do catálogo. Não são login positivo nem teste positivo entre empresas/papéis autenticados. As 113 assertions locais e três cenários concorrentes anteriores continuam evidência local; não foram apresentados como nova cobertura online.

Evidência local ignorada por Git: `output/mcp-connect-deploy/migration-journal.json`, `deployment-result.json`, `negative-tests-summary.json` e `negative-tests-evidence.json`. O SQL negativo reproduzível está em `supabase/tests/online-negative-rls.sql`; ele não insere usuários ou sessões em Auth.

## Auth positivo: bloqueio específico

O MCP disponível não oferece criação/exclusão Auth Admin nem a credencial administrativa necessária. get_publishable_keys fornece chave pública/anon, que não autoriza criar usuários administrativos. Não foi tentado obter segredo por SQL, gerar JWT, fabricar sessão ou desabilitar confirmação.

Foi verificada a possibilidade do painel oficial pelo navegador já existente, pois criação administrativa não é uma capacidade do plugin. A ferramenta **interrompeu Computer Use** antes de abrir o painel: “browser URL policy enforcement is not yet supported for the current Windows browser”. Não foi tentado outro navegador, outra rota ou repetição após essa negativa. O resultado não é negação do projeto Supabase: é um bloqueio da ferramenta de UI, que continua respeitado.

**Nenhuma conta sintética foi criada** e não houve dado de teste persistente a excluir. Para concluir login positivo e a matriz entre usuários reais, a coordenação precisa disponibilizar um canal Auth Admin seguro já autorizado, ou preparar as contas fictícias pelo operador. Não enviar senha, secret key, service_role ou token pelo chat. O caminho suportado é Auth Admin createUser com confirmação só da fixture e login por senha real, usando IDs/sessões emitidos pelo serviço; cleanup posterior segue as FKs e o mecanismo administrativo oficial. [Auth Admin](https://supabase.com/docs/reference/javascript/auth-admin).

## Advisors após o schema

Nenhum WARN/ERROR retornado; foram observados INFOs, não eliminados por afrouxamento dos controles:

- Segurança: sete tabelas de private com RLS e sem políticas. O fechamento é intencional: clientes não têm SELECT e os comandos autorizados são funções privadas com checagem explícita. Não adicionar políticas permissivas apenas para silenciar o aviso. [RLS enabled, no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- Desempenho: nove FKs sem índice de cobertura indicado. Analisar consultas, chaves compostas e carga antes de criar índices redundantes; mudanças ficam em migração própria. [Unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
- Desempenho: três índices ainda não usados em banco vazio. Isso não justifica removê-los antes dos testes de carga. [Unused index](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).
- Auth: máximo absoluto de dez conexões; avaliar alocação quando houver redimensionamento, sem alterar plano/configuração nesta fatia. [Preparação para produção](https://supabase.com/docs/guides/deployment/going-into-prod).

## Limites e próximos passos

Banco de fundação está online, mas o APK permanece demonstração sem backend integrado. Positivos Auth/RLS por usuário, convite via API real, concorrência de sessões reais, Storage/anexos/áudio, push, emojis/graphemes completos e conformidade de produção continuam pendentes. Nenhum dado real foi usado, nenhuma proteção foi desativada e nenhum código novo foi publicado no GitHub.
