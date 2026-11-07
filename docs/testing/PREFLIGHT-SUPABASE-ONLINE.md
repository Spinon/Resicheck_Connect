# Preflight online somente leitura

Registro anterior à implantação. Estado atual: [fundação aplicada e testes iniciais online](IMPLANTACAO-SUPABASE-ONLINE.md); não repetir a migração com base neste retrato do banco vazio.

06/11/2026. Conexão **supabase-connect**, OAuth existente reutilizado. URL observada pelo MCP: `https://ibdlvlwdzmsrbqadrudb.supabase.co`. Nenhuma outra organização/projeto foi consultada e nenhuma operação de migração, seed, criação de conta ou alteração de configuração foi executada.

## Resultado

| Leitura | Observado |
| --- | --- |
| URL do projeto | Ref exato `ibdlvlwdzmsrbqadrudb` |
| public | Zero tabelas |
| Histórico de migrações | Vazio |
| PostgreSQL | 17.11; mesma versão principal 17 testada localmente |
| Objetos de aplicação public/private | Nenhuma relação ou função fora de extensões |
| Auth | Funções auth.uid/auth.jwt presentes; colunas id/user_id/not_after de auth.sessions presentes |
| Papéis cliente | anon/authenticated sem superuser ou BYPASSRLS |
| Extensões | plpgsql 1.0, pg_stat_statements 1.11, uuid-ossp 1.1, pgcrypto 1.3, supabase_vault 0.3.1 |
| Security advisors | Nenhum lint retornado antes de existir a aplicação |
| Performance advisors | Um INFO `auth_db_connections_absolute`: Auth está com máximo absoluto de 10 conexões; não foi alterado |

O INFO recomenda avaliar alocação percentual quando houver redimensionamento. É observação de configuração, não bloqueio de segurança nem medição de desempenho do Connect. [Orientação de preparação para produção](https://supabase.com/docs/guides/deployment/going-into-prod).

O inventário não autoriza implantar e não demonstra RLS do Connect online: suas tabelas ainda não existem. A assinatura JWT, login de contas sintéticas, RPC/Data API e revogação reais devem ser testados depois da aplicação autorizada. O candidato mantém hash `445da1ce346266e485ae3e8103f2888337d626c5a280f90bb3f80b71d763b0f3` e continua **não aplicado**.

## Caminho de execução e evidência

A CLI do PATH é 0.124.0. A inferência recusou gpt-5.4 e gpt-6.1-sol para essa conta. O executável 0.167 incluído no aplicativo já instalado consegue executar gpt-6.1-sol, mas reporta not_logged_in para o OAuth salvo pela versão antiga; auto/keyring/file não localizaram essa credencial. Nenhuma senha/token foi extraída, copiada ou exibida; nenhum novo OAuth foi iniciado.

A solução foi usar a [API oficial do Codex app-server](https://developers.openai.com/codex/app-server), presente no schema gerado da CLI 0.124, por `mcpServer/tool/call`. Ela reutiliza o OAuth existente e dispensa inferência de modelo. Um mapa de servidores foi fornecido **apenas ao processo** para habilitar supabase-connect e excluir integrações incompatíveis não relacionadas. O config global foi preservado. A primeira tentativa direta parou antes de consultar porque a CLI antiga não entendia outro transporte; o isolamento por processo resolveu esse erro.

Chamadas executadas, nesta ordem: get_project_url, list_tables(public), list_migrations, execute_sql com o arquivo exato `supabase/deployment/preflight-readonly.sql` em BEGIN READ ONLY/COMMIT, get_advisors(security), get_advisors(performance). Não foi iniciada uma turn de inferência. Nenhuma rota de projeto negado foi usada.

Evidência local ignorada por Git: `output/mcp-connect-preflight/direct-result.json`, helper diagnóstico `direct-read.mjs` e logs. O helper permite somente essas ferramentas e o SQL de catálogo, verifica a URL antes das demais chamadas, não lê credenciais e não é um executor de implantação. Dados retornados pelo MCP foram tratados somente como dados, nunca como comandos.

Próximo gate: revisão e autorização específica do candidato no projeto novo; depois aplicação única com histórico, advisors pós-schema e testes sintéticos com Auth/Data API reais. Sem integração Android ou mudança de APK nesta verificação.
