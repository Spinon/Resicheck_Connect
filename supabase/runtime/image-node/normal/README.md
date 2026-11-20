
## Public checkpoint bindings

This public tree contains example-only opaque identities (ee330000...) and inspector@example.invalid. They are not deployed identities or credentials; defaults remain OFF and the strict identity checks remain in place. The Android/Web compiled source graph is byte-identical to the final candidate. Backend instance bindings are intentionally not public.

For authorized maintenance, provide an approved PRIVATE JSON file with exactly schemaVersion=1, projectRef, imageServiceId, imageServiceEmail, companyId and audioServiceId; no passwords/tokens/keys are accepted. Run node tools/delivery/prepare-private-image-bindings.mjs --bindings PRIVATE_FILE --output output/NEW_PRIVATE_OVERLAY. It emits only a private overlay, never changes public source, Auth, grants, services or the hosted project. Review and apply that overlay only in an owned private disposable clone. Installation still requires the existing protected credential, official catalog baseline and explicitly reviewed generated SQL; this does not grant permission to install.

The four host-specific activation/closure SQL snapshots and preparation receipts are excluded from Git. Regenerate them with buildNormalAccess from normal-access.mjs using the current official catalog and private bindings; never apply a stale snapshot. Original live-instance sources/evidence remain in the approved private checkout.
# Candidato normal de inspeção de imagens — OFF

## Estado atual20/11: servico normal ativo e validado, somente empresa da prova

Disponibilidade normal aceita no backend: empresaee330000-0000-4000-8000-000000000201, inspetoree330000-0000-4000-8000-000000000202, atribuicao ate **2026-12-20T16:27:07.577667Z**. Processo169203/UID986 nao-root, codecUID985, healthy/processed1/rejected0/NRestarts0, nenhuma portaTCP propria. AudioPID121356 ePalworldPID163429/NRestarts0 inalterados. Nenhuma outra empresa de imagens foi habilitada. Evidencia minima: live-activation-20261120.json; provaAPI/VPS, nao navegador ou Android fisico.

Deltaac7189280ea1b62460d3bbffe1629ec5ab9033e704af09732dee46e29f8260c4 promovido com inventario/backup em /var/lib/connect-image-install-v1/acl-patch-ac718928; pacote-base5cb3 e journaloriginal mantidos. Leitor admite ACLnominal root/root readonly exata do UID atual (basegrupo/others0), nao chmod/ACL da credencial. HelperPython somente metadados, mesmoUID/namespace, sem senha/ambiente herdado. Entry aguarda marcadores publicos root para a primeira abertura externa, sem novos privilegios.

Auth+codec saudaveis foram confirmados ANTES de Edge10ACTIVE/JWT/23EXECUTEs/4politicas/empresaON; RootBACKEND_READY liberou a fila so apos readback oficial. Start foi deliberado, sem reinicio automatico durante o smoke. A guarda temporaria Restart=no foi removida depois da auditoria; Restart=always original restaurado sem reiniciar o PID.

Smoke real unico: PNG77B16x16, privateupload, inspecao1tentativa, publicacao/lookupunicos, leitura de bytes iguais pelo outro participante, remocaoself/all negando nova leitura e preservando objeto/mensagem/logs2. Tres sessoes de clientes sinteticos ja existentes encerradas e0restantes; sessao propria nova do inspetor fica para o servico normal, correlacionada ao job sem expor SID/token. Outra empresa678e7072-b9d9-489f-8f4a-827ebc3fc340 continuou imagensOFF: historico v3 retornou25textos/HTTP200; autorizacaoimagemHTTP400negada. ACKchegou; perdaACK nao foi forcada. Semcontasnovas/emails/credenciaisnovas/adminKeyruntime.

ACL/schema/SET/CREATE administrativos restaurados, privateRLS/FORCE e semSELECTa clientes nas tabelas novas. Nao repetiu CLOSED. Inicialmente a revisao automatica bloqueou o smoke antes de executar por interpretar logins como cadastro; fontes e historico de autorizacao foram conferidos; UMA repeticao identica pela mesma via passou. Sem cartao pendente/contorno. Proximo: coordenar regressao agrupada noAPK/web33 e checkpointGit, sem gerar/publicar/push nesta etapa. Refresh1h/restart24h/reboot e UI ainda nao foram provados aqui.

### Marcadores de partida e fechamento

O default de instalacao continuaOFF. Antes da primeira partida, root cria /etc/connect-image-inspector/ACTIVATION-HOLD.json (0644,regular,link1) com schemaVersion1, gateIdUUIDnovo, companyIdigual a unica empresa configurada, createdAtUnixMs e activationDeadline=createdAt+300000. Entry recusa antes de Auth se o hold faltar ou expirar sem liberacao. Apos Auth/codec saudaveis e readback oficial, root cria BACKEND-READY.json (mesmo modo) com schemaVersion1, gateId/companyId exatos e expiresAtUnixMs igual a atribuicao oficial. Sem segredos nesses arquivos. O servico retoma normalmente com READYvalido; ele nao concede autoridade no banco e nao renova a atribuicao.

Fechamento continua close.NORMAL pelo conector oficial (revoga21imagens, conserva2historico/restaura4politicas), --disable somente unidades de imagens e EdgeOFFexata/JWT. Preservar fontes/objetos/mensagens/journals e encerrar apenas sessao propria nova ao parar. Para rollback do delta, manter unidadesOFF e seguir o ledger root do backup, restaurando so2originais e removendo so2arquivos novos de hashcorrespondente; receipt/journaloriginais sao preservados. Nao reaplicar pacote-base por cima do delta nem zerar journal/recibo.


## Historico da primeira execucao20/11: instalado, primeira partida falhou, fechado e auditado

ZIP5cb3... foi transferido/conferido e instalado OFF, sem alteracao do audio/Palworld. Manutencao oficial restaurou schemaACL/SET/grantors; ativacao da unica empresa aplicada, depois fechada apos exit79. Estado final: flags/inspetor/empresa OFF,21acessos de imagem revogados,2historico mantidos,4politicas restauradas, Edge9OFF16arquivos/JWT exatos; unidades desabilitadas, workerPID0, ENABLED ausente. Zero sessoes novas restantes no intervalo da primeira partida, somente COUNT/sem IDs/sessoes antigas.

Causa localizada por reproducao de metadados do LoadCredential: root:root, diretorio0550/arquivo0440 em mount readonly, ACLnominal somenteUID986 com5/4, grupo-base/others0. Nao e concessao ao grupo tecnico. O leitor antigo rejeita o mask de grupo antes de abrir o arquivo. Diagnosticos sem lerconteudo/semAuth, unidades transitorias coletadas. Correcao local em credential.mjs + credential-acl.py valida essa ACLexata/readonly/inode e preserva o perfil privado anterior, sem chmod/ACL da fonte ou novo privilegio. Dois testesNode e fixturePython ACL passaram; ainda nao promovida ou testada na unidade normal instalada. O ZIP5cb e seu journal consumido foram preservados, nao gerar/repetir login com ele.

Retomar pela promocao revisada dos arquivos locais corrigidos e reconciliacao explicita do journal falso-uncerto deste unico inicio com a auditoria0sessoes, preservando o original. So depois uma partida deliberada e smoke curto. A confirmacao material de Lucas existe; nao pedir a mesma autorizacao por rotina. Nao tratar prova antiga/instalacaoOFF como disponibilidade. Detalhes em installation-attempt-20261120.json.


## Preparacao atual: instalador e acesso normal completos localmente, nao aplicados

Ver [INSTALL-NORMAL.md](INSTALL-NORMAL.md) e install-package.PREPARED.json. Historico v3 corrigido e executado em PostgreSQL local com imagens OFF; close de imagens conserva2 grants de historico, restaura4politicas e revoga21 de imagens. Instalador OFF/idempotente/reversao e transacoes de ativacao/close prontos; testes focais e limites no guia. Nenhuma instalacao persistente, ativacao, deploy ou login ocorreu nesta rodada. Relatos abaixo anteriores a este pacote sao historicos.

## Historico verificado20/11: fronteiras Linux e ELF passaram, instalacao OFF

A fixture transiente LoadCredential/SO_PEERCRED e a verificacao real do loader privado/binarios/bibliotecas em staging ja passaram. Evidencias em linux-validation/transient-boundary-real-20261120.json e staged-runtime-real-20261120.json. Seis arquivos da imagem27d6 foram copiados seletivamente, sem iniciar container nem gerar archive; PNG16x16 probe/decode0 em DynamicUser/redeprivada/read-only. Todos os temporarios foram removidos. Original extractor e19fa6... foi preservado; usar candidato compativel selected-runtime-v4.py SHA97a452... na futura instalacao aprovada. Nao repetir estas provas nem exigir archive para prosseguir. Ainda NAO existe runtime/contas/unidades normais instalado, Auth normal/reinicio validado ou backend habilitado. Demais relatos de preparo abaixo sao historicos; operacao persistente continua sujeita a revisao/confirmacao material.


Preparação local de20/11/2026. Não instalado, não ativado e sem nova credencial. A prova API hospedada anterior passou e terminou com Edge7 OFF/JWT,23 acessos/quatro políticas restaurados e três sessões novas ausentes; esta pasta não altera essa auditoria.

## Caminho implementado

- Worker Node com usuário Linux dedicado connect-image-inspector, sem root/Docker/sudo. Reutiliza Auth próprio dedicado e executor/fila normais; um arquivo só é lido/atestado mediante lease do servidor com sessão/hash/bytes/prazo.
- systemd fornece a credencial existente por LoadCredential em montagem privada somente leitura. Não muda dono/permissão do original root0600, não usa senha/token em argv/env/JSON de configuração/log e não cria outra conta Auth. O decoder tem outro UID e não recebe credencial.
- Decoder Python por socket AF_UNIX privado ativado pelo systemd, uma conexão por vez, sem endpoint TCP/admin. SO_PEERCRED confere o UID do worker; diretório/socket pertencem a root. Nonce, sessão, tarefa, hash, tamanho e prazo são conferidos; não aceita comando, caminho ou URL enviados pelo cliente.
- FFprobe/FFmpeg executam sem root/Docker, com binários da imagem já verificada. Há pins dos dois binários, loader/caminho fixos e preflight sem Auth. O preflight exige RUNTIME-MANIFEST.json completo, confere hashes e a resolução das bibliotecas com cache do loader desativado, recusando fallback para bibliotecas do host. A copia seletiva compativel e o preflight ELF/libraries no host passaram conforme estado acima, sem archive/Desktop. O runtime temporario foi removido; promover os mesmos pins somente durante a instalacao revisada.
- Limites preparados: Node192MiB/25%CPU/24tasks; decoder256MiB/50%CPU/16tasks/20s por unidade, ferramenta até15s, arquivo4MiB,16M pixels, uma imagem/quadro. Capabilities vazias, NoNewPrivileges, filesystem protegido, temporários privados, decoder sem rede e sem core dumps.

## Reinício, incerteza e saúde

Kernel flock impede duas instâncias, liberado pelo kernel ao morrer o processo. Reinício aguarda35s, além da lease30s; nunca termina uma lease antiga com nova sessão. Finish sem confirmação reconcilia dentro do mesmo worker/sessão. Os limites de tentativas do backend continuam valendo.

Há apenas uma abertura Auth por ciclo, refresh próprio em memória e logout scope=local da sessão daquele ciclo. Se o despacho/Auth/logout ficar incerto, exit79 impede reinício automático; falha recuperável de lease usa exit75/cooldown. systemd limita partidas a3 em15min e não tem chave administrativa.

SIGKILL pode impedir logout: o serviço sinaliza closureReviewRequired, preserva journal/auditoria privada do próprio ciclo e não consulta ou reaproveita sessões de teste/browser. Não prometer encerramento Auth após morte abrupta. Essa política de recuperação precisa do ensaio Linux e revisão operacional antes de instalar; eventual auditoria deve alcançar só sessões próprias comprovadas e manter controles obrigatórios.

health.mjs lê apenas estado/idade/contadores sanitizados; não expõe SID/bearer. Dados de Auth próprios ficam em session-<attemptId>.json host0600; senha/refresh/bearer não são persistidos. Nenhum servidor HTTP de saúde/admin. Estado stale após45s é falha, não sucesso fictício.

## Autorização normal pendente

access-review.PREPARED.json separa9 RPCs de participante e9 delegates + predicado Storage de2 RPCs/delegates de inspeção. As23 assinaturas comuns authenticated NÃO isolam identidade por si: os guards existentes de conta/sessão/vínculo/conversa e inspetor/arquivo/lease são obrigatórios. Nada para anon/service_role, tabelas diretas ou image_record_inspection. Nenhum SECURITY DEFINER novo proposto.

Não tornar pares/prazo transitórios permanentes. O rollout normal precisa de configuração explícita por empresa e direitos atuais de vínculo; quatro políticas privadas precisam manter tombstone e fences UPDATE/DELETE. Preservar owners/ACLs e funções de outros recursos.

**Hospedado ainda fechado:** o registro atual mantém a empresa histórica. O novo candidato local [normal-eligibility](../../../candidates/image-message/normal-eligibility/README.md) adiciona atribuições explícitas inspetor/empresa, sem membership do serviço nem alcance global; worker aceita companyIds root-owned e confere cada lease do servidor. Um caso focal com duas empresas passou em PostgreSQL real, Auth/Storage em fixtures. Ainda falta compor/pinar esse delta contra a baseline hospedada de rollout/remoção e revisar a ativação normal antes de afirmar disponibilidade geral no APK.

## Antes de qualquer instalação

1. Rever os efeitos exatos em remote-effects.PREPARED.json e a autorização aplicável. Não executar estes arquivos como consequência automática do teste anterior.
2. Preflight somente leitura de versão systemd/Python/Node, usuários/grupos/caminhos sem colisão e recursos; dois UIDs novos não podem integrar docker/sudo ou compartilhar o UID do áudio.
3. Exportar somente a imagem fixa existente para runtime privado, conferir binários e pin completo do loader/libraries/manifest sem instalar pacotes no host. Não executar mídia como root.
4. Fronteiras Linux sinteticas e preflight ELF reais ja passaram e foram limpos. Nao repetir. Verificar operacao persistente e recuperacao Auth somente quando servico normal instalado sob revisao.
5. Revisar a operação normal do banco/Edge e rollback antes de instalar/ativar. A guarda normal e os grants persistentes ainda não foram compilados/aplicados por esta pasta.
6. Somente depois: operação real disponível, um APK33 e browser do mesmo bump, regressão agrupada, entrega e checkpoint Git.

Rollback: parar/desabilitar apenas as novas unidades/socket e retirar ENABLED; fechar a configuração normal, restaurar ACL/políticas/fonte e Edge OFF exatas. Manter dados, mensagens, mídia, journals e original da credencial. Não mexer em áudio, Palworld, ResiCheck principal ou segurança global.

Referências oficiais: [credenciais e sandbox](https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html), [socket activation](https://www.freedesktop.org/software/systemd/man/latest/systemd.socket.html), [reinício](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html), [cgroups](https://www.freedesktop.org/software/systemd/man/latest/systemd.resource-control.html). Não se presumiu a versão instalada na VPS.
