# Supabase local isolado

Preparação em 06/11/2026, somente para dados sintéticos do ResiCheck Connect. Não há projeto remoto vinculado, banco iniciado ou migração aplicada por esta preparação. O APK demonstrativo permanece independente.

Atualização: migração e 113 assertions SQL passaram em PostgreSQL 17.9 descartável real, com fixture Auth; também passaram concorrência e rollback. Esse cluster foi encerrado. O stack Supabase completo continua sem iniciar por falha do Docker. [Relatório atual](../docs/testing/BANCO-LOCAL-0.1.md) e [modelo](../docs/architecture/BANCO-CONNECT.md). O parágrafo inicial descreve somente a preparação da CLI, não o fallback PostgreSQL posterior.

`config.toml` foi criado por `supabase init` da CLI instalada 2.109.1. ID: `resicheck-connect-local`. API 56321, PostgreSQL 56322, shadow 56320, Studio 56323, caixa de e-mail local 56324. Reservados: SMTP/POP3 56325/56326, analytics 56327, inspector 56328, pooler 56329 e frontend de teste 56330. Analytics, edge runtime, pooler, armazenamento vetorial e seed automático estão desligados. PostgreSQL 17 é o padrão gerado, ainda sem verificação de imagem disponível.

Portas e identidade são distintas do ResiCheck existente (`resicheck-local`, 55320–55330). Não usar `stop --all`, reset global, remoção de volumes ou alteração do projeto existente. Não executar `link`, `login`, `db push`, `config push` ou deploy neste ambiente sem autorização específica para um remoto.

## Bloqueio observado

Docker Desktop já instalado foi iniciado com janela oculta. O backend falhou ao iniciar o serviço Ingest: o Windows recusou acesso à renomeação de `sailor-ingest.sock` para `sailor-ingest.sock.stale`. O pipe do daemon Linux não ficou disponível. Nenhum socket foi removido, permissão alterada, reset executado ou imagem baixada. Cache, nomes exatos e tamanhos das imagens ainda não puderam ser inspecionados.

Não executar o stack enquanto o daemon estiver indisponível ou sem verificar imagens e isolamento de rede. A existência destes arquivos não comprova banco, Auth, Storage ou RLS funcionando.

## Comandos locais previstos

CLI existente, utilizada sem instalar outra cópia:

```powershell
$connectCli = 'C:\Users\Spynon\Documents\Resicheck\node_modules\.bin\supabase.cmd'
$env:SUPABASE_TELEMETRY_DISABLED = '1'
& $connectCli --version
& $connectCli start --help
```

A variável oficial acima desativa telemetria nesta sessão de processo, sem redirecionar perfil nem mudar a preferência global. Não usar saída de `status` em relatórios: pode conter chaves locais. Não versionar tokens, senhas ou chaves geradas.

Após resolver o Docker e inspecionar o cache, verificar `docker network create --help` e criar **somente uma rede própria**, se não existir, com bind de loopback conforme documentação oficial:

```powershell
docker network create --driver bridge --opt com.docker.network.bridge.host_binding_ipv4=127.0.0.1 resicheck-connect-loopback
```

Confirmar as opções da rede existente antes de reutilizá-la. Configurar `site_url` ou `api_url` com `127.0.0.1` não restringe, por si só, o bind dos containers. Ao autorizar o início e eventuais imagens ausentes, usar `start --network-id resicheck-connect-loopback` e verificar os binds reais pelo Docker/Windows antes de abrir acesso. A rede e o comando de início **não foram executados** nesta preparação.

O arquivo inicial em `migrations/` foi criado por `supabase migration new connect_foundation`; mudanças SQL e testes pertencem à frente de schema. As migrações versionadas preservam a possibilidade de outro ambiente futuro, mas não tornam automática a migração de Auth, arquivos, chaves e políticas. Não depender de dados reais nem de um remoto para os testes locais.

Fontes oficiais: [configuração CLI](https://supabase.com/docs/guides/local-development/cli/config), [desativação de telemetria](https://supabase.com/docs/guides/local-development/cli/getting-started#telemetry) e [rede local com loopback](https://supabase.com/docs/guides/local-development). Conferir novamente a ajuda da versão instalada antes de executar novos comandos.
