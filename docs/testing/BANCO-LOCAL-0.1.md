# Banco local: migração e RLS 0.1

Histórico da validação local. Após aplicação autorizada online, a migração canônica passou a `supabase/migrations/20261106200713_connect_foundation.sql`, sem mudança de bytes; o artefato original está em `supabase/deployment/approved/`. [Recibo e resultados online](IMPLANTACAO-SUPABASE-ONLINE.md).

06/11/2026. Migração `supabase/migrations/20261106185009_connect_foundation.sql`, criada pela CLI instalada 2.109.1. Modelo Connect separado; nenhum banco ou arquivo do ResiCheck foi alterado. Nenhum projeto remoto foi criado ou alterado por esta frente; sem publicação pública ou instalação de software.

## Resultado observado

**Migração aplicada e 113 assertions SQL passaram em PostgreSQL 17.9 real**, usando papéis `authenticated`/`anon` sem superuser ou BYPASSRLS. Passaram também os checks de catálogo e três cenários de transação/concorrência. Evidência atual: `output/postgres-rls/20261106-191101-366/` (`result.json`, logs SQL e `concurrency-result.json`). O cluster foi encerrado e a senha temporária removida ao fim.

O candidato atual revoga grants apenas nos objetos Connect; SHA-256 `445da1ce346266e485ae3e8103f2888337d626c5a280f90bb3f80b71d763b0f3`. Substitui o hash anterior `16d42c11…`, testado no run histórico `20261106-190146-747`. O inventário somente leitura também foi executado no cluster descartável, antes da migração. [Plano do projeto novo online](../delivery/PLANO-SUPABASE-ONLINE.md) permanece sem execução remota.

| Verificação | Resultado e limite |
| --- | --- |
| Schema/grants | Migração executada; RLS em todas as tabelas public/private, sem escrita direta dos clientes, sem SELECT privado e sem SECURITY DEFINER em schema exposto |
| Dados por papel | Paciente só próprio chat; dois funcionários ativos veem conversas da empresa; outra empresa, outro paciente, pendente/revogado e gestor sem papel operacional negados; grant ADM não libera conteúdo |
| Vínculos | Paciente imediato/múltiplas empresas; busca de funcionário pendente; convite válido ativa diretamente, sem segunda aprovação; token incorreto, expirado, revogado ou destinatário diferente não ativa |
| Autoria/idempotência | Remetente/papel/ordem no comando do banco; retry mantém uma mensagem/recibo/auditoria; conflito e importância restritos; campos internos não são concedidos ao cliente |
| Revogação | Vínculo, conta e empresa atuais; token de fixture expirado, sessão ausente, de outra conta, expirada ou removida não concede acesso; metadata editável não concede papel |
| Concorrência de funcionário | Duas conexões reais; segunda espera em lock observado no catálogo; somente um convite consumido e uma empresa ativa |
| Concorrência de envio | Dois envios simultâneos com mesma chave/contexto; lock observado; mesmo ID, uma mensagem, um recibo, uma sequência e um evento de auditoria |
| Rollback | Falha deliberada após envio desfaz mensagem, recibo, contador e auditoria na mesma transação |

Os 113 casos usam `SET LOCAL ROLE` e claims/sessões fictícios; consultas de conteúdo e comandos rodam como papel não privilegiado. Setup e verificações de invariantes/catálogo usam proprietário somente no cluster descartável. A primeira tentativa do executor ficou aguardando handles do processo Windows e foi interrompida; o cluster correspondente foi confirmado encerrado. O lançamento oculto foi corrigido. O primeiro teste concorrente falhou por configuração vazia de serviço libpq no executor; removida essa configuração, a execução final acima passou. Não houve relaxamento de RLS ou permissões para passar testes.

## Supabase completo permanece pendente

Docker Desktop instalado falhou ao renomear `sailor-ingest.sock` para `.stale`, com acesso recusado pelo sistema. Uma reinicialização suportada não restabeleceu o daemon e o cliente ficou sem resposta; foi interrompido. Não apaguei sockets, resetei Docker, alterei permissões ou baixei imagens. Cache e tamanho de imagens não foram verificáveis.

Para continuar independentemente, foi usado PostgreSQL já instalado em cluster novo, somente `127.0.0.1:56332`, com SCRAM e senha aleatória efêmera. `supabase/tests/postgres-auth-fixture.sql` simula apenas as tabelas/funções de contexto Auth necessárias. **Não é Supabase Auth**, não valida assinatura de JWT, login, HTTP/Data API, refresh, recuperação, MFA ou compatibilidade integral do schema Auth real. Os testes comprovam SQL/RLS/transações sob esse contexto, não segurança de produção.

Supabase CLI/init/config/migration existem, mas nenhum stack Supabase foi iniciado e nenhuma migração foi registrada no histórico de um stack. `db advisors --local`, `db pull --local`, `migration list --local` e testes via Auth/Data API reais continuam pendentes até Docker utilizável e imagens oficiais autorizadas/disponíveis. Não usar fixture Auth dentro de Supabase real.

## Reproduzir e próximos gates

`./scripts/test-postgres-local.ps1` usa binários existentes de PostgreSQL 17 e porta fixa de teste, recusa porta ocupada, cria uma pasta nova sob output e não registra serviço. Inicia somente o próprio cluster, aplica fixture/migração/casos e sempre tenta encerrar no finally. Não reutiliza banco existente. Não executar os arquivos de fixtures em um remoto ou outro aplicativo.

Para Supabase completo: resolver o erro Docker por procedimento autorizado; inspecionar cache/versões; confirmar rede própria com bind de loopback e portas 56320–56330; aplicar migração no projeto Connect local; executar advisors e repetir testes com Auth/Data API reais e usuários não administrativos. O APK entregue permanece sem backend e não foi recompilado nesta fatia.

Onboarding/identidade e representação, emissão/recuperação de convites, políticas de destinatário/uso/prazo, revogação concorrente de conta/empresa por caminhos administrativos, acesso excepcional ADM, anexos/Storage, push e integração Android continuam pendentes. CNPJ é string alfanumérica de 14 posições com checagem de formato, **não** validação oficial de dígitos/situação/representação; CPF não foi armazenado nem consultado. Não declarar esses requisitos concluídos.
