# Negativas Docker/WSL e plano de artefato - somente documental

20/11/2026. Nenhum Docker, WSL, SSH, export, teste, instalacao, VPS ou Supabase foi acionado nesta apuracao. Este documento nao altera a negativa nem autoriza outra via.

## Fatos recuperados e limites da evidencia

| Data/registro | Operacao e alvo registrados | Resultado registrado | Classificacao que a evidencia permite |
| --- | --- | --- | --- |
| 10/11, CNPJ-RUNTIME-PLANO-OFFLINE:21; CNPJ-INVENTARIO:44 | Docker CLI local: version e image ls; Windows Docker Desktop | pipe dockerDesktopLinuxEngine inexistente; version/imagens nao consultados | Daemon indisponivel. O documento diz explicitamente que nao foi negacao de autorizacao pela ferramenta. Nao ha stderr/exitcode bruto preservado nessas linhas. |
| 10/11, ENGINE-AUDIO-CNPJ:5 | CLI oficial desktop start --detach --timeout30, depois docker info | engine29.7.2/Linux respondeu; startup retomou automaticamente11 containers preexistentes | Operacao posterior bem-sucedida, com efeito colateral observado. Nao equivale a permissao para repetir ou a prova de acesso atual. O engine nao foi parado porque isso afetaria outros servicos. |
| 12/11, HOST-INSTALL-CANDIDATE:121; host-plan.json:74 | WSL --list; inventario somente leitura no Desktop | Wsl/E_ACCESSDENIED | Erro reportado pelo subsistema WSL/SO. Flags adicionais, comando integral, stderr integral, exitcode, identidade e causa/ACL nao estao nesses registros. Nao atribuir a revisao automatica sem evidencia. |
| 12/11, mesmos registros | docker version; daemon Docker local do Desktop | acesso negado ao daemon / daemon permission denied | Negativa de acesso ao daemon reportada no historico. Pipe exato, exitcode, stderr completo e origem da barreira (ACL/SO/sandbox) nao foram preservados nesses registros. Nao ha razao/cartao/referencia de auto-review associada comprovada. |
| 14/11, attachment-task-executor-local-validation:96-101; AUDIO-API-EXECUTOR:25 | Apenas cmdlets de inventario de servicos/processos; nao nova chamada WSL/Docker | NoServiceFoundForGivenName / NoProcessFoundForGivenName; deniedCommandsRetried=false; newAutoReviewDenial=false | Nao e outra negativa Docker/WSL. O registro reafirma as duas falhas anteriores e diz que nao houve nova negativa de revisao automatica naquela frente. |
| 18/11, images052-artifacts-managed-progress:299-305 | Build Linux de imagens NO Desktop era a acao pretendida, nao executada | not-attempted-prior-denied-path-unresolved | Resumo herdado, nao prova de que docker build foi enviado ou recusado. Nenhum comando de build negado aparece aqui. |

Fontes e linhas: [CNPJ runtime](../../../../../docs/testing/CNPJ-RUNTIME-PLANO-OFFLINE-2026-11-10.md#L21), [inventario](../../../../../docs/testing/CNPJ-INVENTARIO-E-ESCOPO-2026-11-10.md#L44), [engine posterior](../../../../../docs/testing/ENGINE-AUDIO-CNPJ-REAL-OFFLINE-2026-11-10.md#L5), [host install](../../../../deployment/audio-structure/host-one-task/HOST-INSTALL-CANDIDATE.md#L121), [host-plan](../../../../deployment/audio-structure/host-one-task/host-plan.json#L74), [recibo14/11](../../../../deployment/audio-structure/attachment-task-executor-local-validation.json#L96), [relato14/11](../../../../../docs/testing/AUDIO-API-EXECUTOR-E-ENSAIO-LINUX-2026-11-14.md#L25), [resumo18/11](../../../../../apps/mobile/images052-artifacts-managed-progress.json#L299).

**Conclusao delimitada:** os arquivos do projeto comprovam duas chamadas de inventario com erros, nao uma proibicao documentada de toda operacao Docker/Linux em qualquer host. Tambem nao comprovam que a barreira do Desktop foi resolvida. Nao foi localizado recibo primario de ferramenta com request-id/decisao/reason de revisor para essas duas chamadas; nao inventar classificacao de auto-review, sandbox ou ACL especifica. O relato antigo de pipe ausente e o E_ACCESSDENIED posterior sao casos distintos.

## Artefato exato existente: o que ha e o que nao ha

- A imagem fixa foi comprovada historicamente no daemon da VPS: sha256:27d6b28f9111c36fcf39cab1d8cc818daa2a5474f93fce305e1466010cdf695e, linux/amd64, UID65532:65532. Pin e hashes dos dois binarios em supabase/runtime/image-node/linux-image.lock.json:4,13-16; proveniencia em:23. Registro de construcao: apps/mobile/images052-linux-runtime-progress.json:45,80. Nao foi relida nesta apuracao.
- Os recibos historicos nao fornecem um caminho absoluto comprovado de docker-save dessa imagem. As referencias recebidas eram variaveis $B/$OUT2 e IDs/hashes. Nao substituir por um path inventado.
- /var/tmp/connect-image-helper-package.JhwNct8K/extracted e /var/tmp/connect-image-helper-probe-MHRPDb/result.json sao pacote de FONTES e recibo, respectivamente (apps/mobile/images052-helper-real-linux-coordinator-proof.json:20-21). Nao sao archive do runtime.
- O unico tar de imagens encontrado nas saidas locais e output/image052-official-artifacts/20261118T012151Z/base-layer.tar.gz,29856132bytes, SHA25637fb86c2a767b88d500c6872195f88078f64765fe0d2f9cc375cc2efbd4c0a41. E a base Debian, nao contem os FFmpeg compilados. O archive de audio e outro pin e esta fora de escopo.
- Assim, **nao ha hoje artefato exato comprovado cuja simples copia ja resolva esta frente**. Se o operador localizar um arquivo exportado anteriormente, conferir somente metadados/hash/configId/diff_ids/pins pelo parser offline antes de usa-lo; essa descoberta ainda nao ocorreu e nao autoriza busca de segredos.

## Menor plano futuro, condicionado a revisao do alvo/capacidade

1. Se um docker-save exato ja existir: origem deve ser o caminho real fornecido pelo operador, com metadados/hash. Copiar somente esse arquivo inerte ao destino privado de transferencia ja autorizado; nenhuma chamada ao daemon, export novo, container ou novo executor. Esta e materialmente uma copia de arquivo, mas continua condicionada a acesso legitimo ao proprio arquivo.
2. Se nao existir: a operacao nova seria **docker image save de UMA imagem por ID fixo**, no daemon da VPS onde a imagem foi montada, para um diretorio novo root0700 e arquivo0600. Exemplo de destino proposto, NAO existente/verificado: /var/tmp/connect-image-runtime-export-<nonce>/image-27d6b28f-save.tar. Origem e a imagem imutavel do daemon, nao container vivo, root filesystem do host, volume, estado do audio ou credencial.
3. Privilegio: acesso ao daemon ja exige autoridade elevada. Nao conceder docker group, ACL de socket, sudoers ou root persistente ao worker/usuario de transferencia. Qualquer execucao futura deve usar o operador e o fluxo ja legitimamente autorizado com confirmacao/revisao aplicavel; esta analise NAO dispara essa acao. Eventual copia para /home/spy-vps-admin/connect-transfer/image-runtime-export-<nonce>/ deve usar arquivo novo privado e permissao estrita somente para o destinatario aprovado, sem abrir a pasta root ou mudar custodia.
4. Antes de transferir, revisar sanitizadamente o conteudo: docker save inclui config, labels, Env, historico e todas as layers, inclusive conteudo removido em layers anteriores. Embora a receita seja de fornecedor/codec sem Auth, nao afirmar ausencia de segredo apenas pelo nome da imagem. Nunca imprimir valores Env/labels; conferir que a imagem corresponde ao pin e ao conjunto revisado. Nao exportar container vivo/volumes ou incluir .env/custodia.
5. Provar sem iniciar servicos: capturar antes/depois somente imageId/tamanho/hash, estado/PID do audio/Palworld e ausencia de novos containers; save nao cria nem inicia container. Nao iniciar/parar Docker, nao pull/build/prune, nao mudar rede. Limitar a uma imagem; conferir espaco para arquivo e parser. Custo monetario previsto nenhum servico novo/terceiro, mas I/O/disco/CPU existem; nao prometer impacto zero ou tamanho exato sem o archive.
6. Desktop recebe o arquivo privado com SHA256 idêntico. export-fixed-runtime.py valida configId=pin, diff_ids e binarios sem daemon/execucao, antes de gravar runtime novo. Isso nao comprova LoadCredential/systemd/SO_PEERCRED/ELF/cgroup; essas fronteiras ainda exigem um Linux explicitamente permitido.

**Nao e bypass:** docker version negado e docker image save sao metodos distintos, mas ambos usam o mesmo dominio de autoridade do daemon. Trocar comando/socket/conta/host apenas para escapar da negativa seria contorno. A VPS e outro alvo com imagem propria historicamente disponivel, e save tem efeito diferente de inventario/build; porem isso sozinho nao resolve uma eventual negativa sobre a operacao subjacente ou sobre uso de daemon. Antes de qualquer execucao, confirmar pelo fluxo oficial que o alvo/capacidade estao autorizados e que a negativa nao cobre essa operacao. Se o fluxo negar, parar sem trocar de canal.

Rollback do futuro save/copia: nao altera imagem/servico/config. Preservar archive/recibo em local privado como evidencia; nenhuma limpeza automatica de imagem/container/host. Remocao posterior do arquivo novo somente conforme a politica autorizada, sem apagar originais. Sem gasto, instalacao, credencial, Auth, banco, Edge ou ativacao neste plano.

Referencia primaria: [docker image save](https://docs.docker.com/reference/cli/docker/image/save/) descreve export de imagens/layers para tar. Nao confundir com docker container export, que tem outra origem/proveniencia.


## Origem da imagem27d6 e identificadores - complemento20/11

**Foi construida no executor original VPS, nao baixada como imagem pronta oficial nem compilada no Desktop.** apps/mobile/images052-linux-runtime-progress.json:3-23 identifica parent-single-vps-console-executor, toolchain offline, fonte verificada, compile exit0 e RUNTIME_READY; :45 fixa imageId. docs/testing/IMAGENS-RUNTIME-LINUX-E-EXECUTOR-2026-11-18.md:5-9 atribui a execucao ao console VPS e informa que o Desktop nao releu os arquivos. linux-image.lock.json:23 atribui o pin ao readback18/11. A VPS do Connect aparece no contexto canonico como147.93.35.112 (AMBIENTE:197); a evidencia de compilacao consultada nao fixa hostname diretamente. Nao afirmar um nome de host a partir de inferencia.

A receita LOCAL supabase/runtime/image-node/Dockerfile.candidate descreve FFmpeg9.0.2 com zlib, PNG/MJPEG, image2pipe/null, sem rede/autodetect/shared e make-j1, em imagem separada UID65532. source-recipe-review.json comprova revisao estatica contra a fonte oficial. Entretanto, o build real foi incremental/manual pelo console, com novos containers/diretorios apos falhas de cache e TMPDIR. **Nao ha arquivo de receita real congelado/hash equivalente que demonstre reproducao byte a byte da imagem27d6.** Nao tratar Dockerfile.candidate como receita exata ja comprovada dessa compilacao.

| Identificador | O que esta comprovado | O que nao implica |
| --- | --- | --- |
|27d6b28f...| Campo imageId do Docker/runtime custom, linux/amd64, UID65532:65532, binarios fixados | Nao e RepoDigest conhecido nem URL registry@digest. Para o parser, SHA do config de docker-save tem de corresponder ao pin; essa correspondencia sera verificada no archive real, ainda ausente. |
|9cab893c... / fc160566...| SHA256 dos binarios FFmpeg/FFprobe custom informados pelo readback | Nao identificam libraries/loader ou um pacote oficial distribuido pronto. |
|8c385028...| SHA256 da fonte oficial ffmpeg-9.0.2.tar.xz, assinatura verificada historicamente | Nao e hash de binario, layer ou imagem final. |
|7378260c...| Digest do manifesto OCI da BASE Debian oficial trixie/slim amd64 | Nao e a imagem final PNG/JPEG. |
|596c6d80...| Digest do config OCI da BASE Debian | Nao e27d6 nem digest do manifesto. |
|37fb86c2...| Digest dos bytes gzip da layer BASE Debian local | Nao contem os dois binarios custom. |

Origem imutavel da BASE registrada em dependency-review.json:5-16: commit debuerreotype373f61a386722a989c79f0c11f23fcf379b56e94; https://raw.githubusercontent.com/debuerreotype/docker-debian-artifacts/373f61a386722a989c79f0c11f23fcf379b56e94/trixie/slim/oci/index.json e docker.io/library/debian@sha256:7378260c0a098d27ac206225db5e7d92b8c7c84ea7afccc86eeb513756bbd392. A fonte FFmpeg vem de https://ffmpeg.org/releases/ffmpeg-9.0.2.tar.xz, fixada por hash/assinatura no build-inputs.lock.json:7-15. Nenhuma dessas origens entrega a imagem custom exata. Nao foi achado registry/repository/RepoDigest/publicacao do27d6; logo nao existe pull oficial identificado para substitui-la.

A [documentacao Docker](https://docs.docker.com/reference/cli/docker/image/ls/#list-image-digests---digests) apresenta IMAGE ID e DIGEST separados; a [especificacao OCI](https://github.com/opencontainers/image-spec/blob/main/config.md) distingue config/rootfs.diff_ids e digest das layers. A especificacao atual adverte que ImageID nao tem definicao universal entre implementacoes: nao generalizar uma suposicao do parser como prova do archive ainda nao recebido.

## Acao minima a autorizar no executor ORIGINAL - nao executada

Preferir simples copia de archive/rootfs previamente existente SOMENTE se o operador informar path/metadata/hash exatos e a proveniencia puder ser conferida. Nao existe esse path comprovado hoje. Se precisar criar archive, o pedido concreto e: no daemon original da VPS do Connect, salvar SOMENTE o imageId27d6 existente, sem pull/build/run/stop/prune, sem root filesystem vivo/volumes/config de Auth. Nao e autorizacao para usar outra conta/socket no Desktop negado.

Depois de confirmar origem, espaco, ferramenta instalada e autorizacao aplicavel, um comando candidato para o operador (diretorio NOVO root0700 e caminho real substituidos/revisados previamente) seria:

~~~sh
timeout --signal=TERM --kill-after=10s 120s \
  prlimit --fsize=536870912:536870912 --cpu=30:30 --core=0:0 \
  docker image save --output /var/tmp/connect-image-runtime-export-NONCE/image-27d6-save.tar \
  sha256:27d6b28f9111c36fcf39cab1d8cc818daa2a5474f93fce305e1466010cdf695e
~~~

**E somente proposta, nao comando apto a colar sem os pre-requisitos.** O comando pressupoe timeout/prlimit existentes e versao compativel, destino novo/no-symlink/privado e uso de daemon ja autorizado. Nao instala nada e nao aceita lista arbitraria de imagens. Hash/publicreceipt depois, sem dump de Env/labels/historico. Se falhar, preservar parcial/recibo privado e parar; nao repetir por outro canal.

### Limites efetivos e honestos

- RLIMIT_FSIZE512MiB limita cada arquivo gravado PELO CLIENTE; o codigo oficial atual [Docker CLI save.go](https://raw.githubusercontent.com/docker/cli/master/cli/command/image/save.go):63-84 escreve a resposta do daemon no arquivo local atomico0600. A versao instalada precisa ser compatibilizada antes. Limite de30s e tempo de CPU do processo CLI, nao30s de duracao nem quota percentual.
- Timeout120s+kill10s limita a vida do cliente. Fechar a conexao nao comprova que toda atividade/cache temporaria do daemon terminou instantaneamente; conferir estado antes de outra acao.
- **Nao ha teto CPU/memoria/I/O do daemon garantido por esses limites.** [--cpus](https://docs.docker.com/engine/containers/resource_constraints/#configure-the-default-cfs-scheduler) limita cgroup de CONTAINER, nao operacao image save do daemon. systemd-run/CPUQuota ao redor da CLI tambem nao move o daemon existente para aquele cgroup. Nao reconfigurar/reiniciar/limitar o daemon global para esta tarefa, pois afetaria outros servicos.
- Espaco: reserva previa sugerida de2GiB livres NO filesystem do destino, mais margem de imagens/daemon, e guardia durante a operacao; nao e quota global nem prova de espaco atual.512MiB limita apenas output do cliente, nao o armazenamento/cache do daemon. Nao afirmar garantia global sem filesystem quota/mount isolado, que nao esta autorizada como rotina aqui.
- Se a exigencia for um hard-cap total de CPU/disco da operacao daemon, **esta proposta nao o satisfaz sem mudanca adicional**. Nesse caso, parar e pedir somente artefato previamente existente ou caminho de copia dos binarios/loader/libraries no diretorio de build ja preservado com pins/manifest. O caminho dessa arvore tambem esta pendente, nao inventar.
- Custo: sem novo servico pago/registry; consumo real de CPU/I/O/disco existe. Provar antes/depois audio/Palworld/containers/espaco sem parar servicos. Nao prometer impacto zero.

Acesso a daemon e privilegiado. Revisao/confirmacao precisa identificar esse novo alvo/efeito e a ausencia de hard-cap do daemon; nao dizer que Docker version negado foi resolvido pela mudanca do verbo para save. Preservar as negativas especificas e todos os controles.

Privacidade: docker save inclui parent layers/config e historico; podem existir dados removidos em layer antiga. Pin/receita sugerem fornecedor apenas, mas isso nao substitui revisao sanitizada do conteudo antes da transferencia. Nenhum segredo deve sair da VPS. O archive permanece root0600/root0700 ate revisao; eventual copia exclusiva para pasta privada spy-vps-admin, transferencia SFTP pinada e hash identico dependem do fluxo ja autorizado para este artefato, sem publicar compartilhamento ou mover credencial. Se nao puder provar conteudo apropriado, nao transferir.

Rollback do save: nao modifica imagem/servico, mas pode deixar arquivo parcial e trabalho de daemon; preservar/identificar e auditar, sem apagar imagem ou reiniciar daemon. A copia/arquivo novo pode ser retirado depois conforme autorizacao, mantendo manifesto/recibo e sem tocar credenciais/dados de chat.

## Unidade Linux com dependencias oficiais e fixtures - valor e lacuna

Uma unidade/teste local num Linux JA disponivel e explicitamente permitido, com Python/Node/systemd oficiais existentes, pode demonstrar IPC Unix/SO_PEERCRED reais, recusas de UID/frame/lease, arquivos/cleanup/permissoes, LoadCredential SINTETICO e comportamento de restart/health. A extensao depende dos direitos reais: unit de usuario pode provar parte do mecanismo, nao automaticamente todas as sandboxes/cgroups da unit de sistema; container comum sem PID1/systemd nao prova LoadCredential ou gerencia real do servico.

Com programa ELF sintetico/ferramenta oficial DIFERENTE, demonstraria apenas mecanismo de loader/processo/sandbox. Nao valida os binarios27d6, libraries exatas, comportamento PNG/JPEG nem integracao com o worker hospedado. Para provar o caminho do decoder normal com imagem exata e necessario archive/rootfs real de origem/pins conferidos E Linux permitido. Recompilar da fonte oficial pode gerar outro hash/configId e seria outro candidato, nao reparo silencioso do pin.

Nenhuma unidade foi criada/iniciada nesta apuracao. Nao trocar para WSL/container/host alternativo para escapar da negativa. Este complemento apenas esclarece o que um futuro teste legitimo demonstraria.


## Readback SSH minimo na VPS original -20/11, sem sudo/Docker

Autorizacao desta rodada: somente leitura via canal OpenSSH ja estabelecido, sem save/transferencia ou alteracao. Hash do host pin conferiu0d573b0ad945057d42e8557d6723a2b3205859eefad092b98d1626b43a7a564e. Apenas fontes de wrappers nao secretas foram lidas; DPAPI/chave privada nao foram lidos/copidos pelo agente. O OpenSSH usou sua autenticacao normal existente, com StrictHostKeyChecking/IdentitiesOnly, sem forward/proxy/update de hostkey.

**Readback efetivo:** conexao spy-vps-admin@147.93.35.112 passou. UID/GID1002, grupos[1002]. /var/tmp: total102888095744bytes, usados10532618240, livres92338700288bytes (aprox86GiB). Socket /var/run/docker.sock e socket, root:988,0660; usuario corrente sem acesso read/write. Portanto nenhum comando Docker foi enviado, nenhum sudo foi tentado e nao houve negativa nova de daemon/revisor. Zero arquivos remotos escritos. Nao confundir esse espaco observado agora com cota/reserva ou garantia durante export futuro.

**Ponto exato de parada:** imagem27d6 nao foi inspecionada nesta conexao. Presenca/tamanho/arquitetura/RepoDigest atuais continuam nao relidos. Preflight-Connect-Separado.ps1 existente tem comandos fixos de imagem, mas tambem le DPAPI e metadados de custodia/budget fora do alvo desta rodada; nao foi invocado nem modificado. Os launchers fixos V3/V4 sao de provas consumidas, nao inventario generico. Nao criar novo wrapper ou conceder socket/sudo para resolver.

**Uma acao fixa para o coordenador ja root ou com sudo legitimamente aprovado:** executar somente o comando abaixo no fluxo autorizado existente; se o fluxo exigir senha/cartao, manter essa exigencia. O agente nao vai ler DPAPI, ampliar wrapper ou trocar de canal.

~~~sh
/usr/bin/docker image inspect sha256:27d6b28f9111c36fcf39cab1d8cc818daa2a5474f93fce305e1466010cdf695e --format '{{.Id}} os={{.Os}} arch={{.Architecture}} bytes={{.Size}} user={{.Config.User}} repoDigests={{json .RepoDigests}}'
~~~

Saida esperada seleciona somente imageId/OS/arquitetura/tamanho/User/RepoDigests; nao imprime Config/Env/RootFS.Layers/History completos. Falha No such image indica ausencia; qualquer acesso negado deve ser preservado sem tentativa por outra via. Nao chamar history --no-trunc, pois comandos historicos podem conter dados sensiveis.

Para origem runtime-only, o readback acima e os pins/receita historicos ajudam mas nao provam ausencia de dados em layers. Nao copiar/exportar com base apenas nele. O coordenador deve primeiro identificar caminho REAL do manifesto/receita de montagem preservados e devolver apenas path/hash/contagem e comparacao com o registro18/11 (sem conteudo Env/credencial). A recipe candidata do checkout nao substitui esse artefato. Nenhum path de arquivo runtime/receita original foi inventado ou buscado no servidor nesta rodada.

Nao houve service restart, mudanca de permissao, save/pull/run/build, Auth, Storage, Supabase, novo teste de PNG ou nova validacao de unit/parser.


## Inspecao privilegiada fixa autorizada -20/11, resultado real

O parent autorizou especificamente a inspeção de seis metadados pelo sudo oficial existente. Os registros consultados nao mostraram negativa de auto-review para ESSA inspeção privilegiada; a barreira corrente anterior era apenas falta de acesso do usuario comum ao socket. Nao foi repetido docker version/WSL no Desktop nem tentado outro socket/ACL/grupo.

Uma chamada SSH pinada ao executor VPS original executou somente sudo docker image inspect27d6 com format para Id/Size/Os/Architecture/Config.User/RepoDigests. Reutilizou SEM ALTERAR as funcoes Need/Q/Send-SudoPrivate do launcher local existente SHA256f3375adf9b83f6a646924bab98ef04a397905a27388b8508811316937e03a30c; a funcao privada realizou a autenticacao, sem agente inspecionar valor, sem credencial em argv/env/stdout/log. Host pin0d573b0a... conferido. Nao foi criado wrapper, arquivo de codigo no VPS, sudoers ou canal persistente. Nenhum cartao/negativa apareceu nesta chamada.

Resultado recebido:

~~~json
{"id":"sha256:27d6b28f9111c36fcf39cab1d8cc818daa2a5474f93fce305e1466010cdf695e","size":32640521,"os":"linux","architecture":"amd64","user":"65532:65532","repoDigests":[]}
~~~

**Conclusao atual:** imagem exata esta presente no daemon original,32.640.521bytes (cerca31,13MiB),linux/amd64/65532:65532,sem RepoDigests associados. Nao foi lido/impresso Config/Env/History/RootFS.Layers inteiro. Esse tamanho de imagem NAO e tamanho garantido de docker-save; a presenca/RepoDigests[] nao prova que nunca houve publicacao em qualquer registry ou ausencia de conteudo sensivel das layers. Nenhum save/export/pull/build/container/transferencia, Auth, Storage, Edge, banco ou serviço foi acionado.

A leitura sem privilegio imediatamente anterior observou92.338.700.288bytes livres em/var/tmp; a inspeção Docker nao repetiu df. Nao houve promessas de quota global, CPU do daemon ou impacto zero. Imagens continuam OFF conforme auditoria anterior; este comando nao era novo readback do banco/Edge.

## Proximo ensaio Linux unico sem export: somente PLANO, aguarda confirmacao

A imagem esta no daemon, mas a nova unidade normal roda decoder ELF fora dele. Sem export/read-copy dos binarios e libraries, nao e possivel executar o codec-connection.py NORMAL com seu loader privado em ROOT=/opt/connect-image-normal-v1/codec-runtime. Nao mudar ROOT/pins nem usar bibliotecas do host para fazer passar.

Menor ensaio util antes dessa promocao: UMA execucao coordenada, nomes novos proprios, prazo ate120s, sem Auth/Storage/Docker/rede externa, usando somente marcador de credencial sintetico. Duas unidades transientes DynamicUser distintas (sem contas persistentes) exercitam LoadCredential e socket AF_UNIX real com SO_PEERCRED, noNewPrivs/caps vazias, readonly/privateTmp/resource limits. Nenhum UID recebe acesso Docker. A fixture usa apenas troca de marcador/dados publicos sinteticos; nao roda codec, container ou broker root adicional. A imagem27d6 permanece intacta. Preparar/correlacionar o resultado na mesma execucao, nao outra serie de probes.

Gates antes de autorizar esse ensaio: compatibilidade/recursos systemd devem ser confirmados pelos metadados que ja existem; se faltarem, pedir apenas esses metadados, sem instalar nada. Precisaria criar somente arquivos/unidades/socket transientes em arvore nova privada sob/run/connect-image-boundary-<nonce>, com uma fixture sintetica; nao ler credenciais reais nem contas do aplicativo, nao configurar servico permanente, nao iniciar unidade do audio ou rede publica. O recebimento de LoadCredential sintetico no mesmo UID nao prova isolamento contra outro UID; os dois UIDs realmente distintos e a recusa cruzada fazem parte do unico caso.

O que esse caso provaria: systemd/LoadCredential REAL com marcador sintetico, UID/capabilities/noNewPrivs, SO_PEERCRED/recusa de outro UID e ciclo fim/cleanup/restart-simulado com limites reais nas unidades novas. O que NAO provaria: LoadCredential com a senha operacional (nao usar), nova autorizacao duradoura hospedada, servico normal instalado, decoder ELF fora do container, export completo/libraries privadas ou funcionamento do APK/browser.

Rollback/condicao de parada: ao primeiro erro/timebox, parar apenas as unidades transientes com nomes/IDs criados pelo ensaio, desligar socket e encerrar filhos proprios, preservar recibo sanitizado; retirar somente a arvore transiente comprovadamente pertencente ao ensaio quando autorizado. Conferir unidades e socket proprios ausentes e audio/Palworld inalterados. Nao mover credencial, reiniciar daemon ou apagar imagem. Essa etapa tem efeito real transiente e ainda NAO foi executada/instalada; requer a confirmacao correspondente do parent antes de qualquer unidade. Nenhum container e necessario para esta fixture. Usar Docker como decoder exigiria intermediacao privilegiada/topologia diferente e NAO seria equivalente a unidade normal nao-root final; esse fallback nao esta proposto.

Se o objetivo for validar o decoder NORMAL final, a alternativa menor continua exportar/copiar da imagem exata em caminho privado revisado, para o preflight de manifest/ELF; o ensaio fixture acima nao substitui esse gate e nao deve ser apresentado como prontidao final.
