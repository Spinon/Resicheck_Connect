# Entregas de teste e Drive

## Rotina canonica de trabalho e fechamento

Direcao de Lucas registrada em **20/11/2026**; aplica-se a **todo fim de lote**, nao so ao atual. Esta e a rotina unica de higiene e entrega. [AMBIENTE.md](../project/AMBIENTE.md) guarda contexto vivo; [board](../../project-board.json) e a unica fila; STATUS e gerado. Registros datados de entregas abaixo sao historicos.

### Gestao da fila

`project-board.json` e a unica fonte do trabalho atual: um `currentFocus`, estado, criterios, proxima acao e evidencia por item; prioridade, responsavel, dependencias e data de revisao quando aplicaveis. `docs/project/STATUS.md` e apenas a projecao gerada por `npm run project:status`, conferida por `npm run project:check`; nunca editar manualmente. Estados aceitos: `backlog`, `next` (equivalente a pronto para comecar), `ready`, `in_progress`, `blocked`, `monitoring`, `done`. Nao migrar itens historicos por cosmetica. `done` exige criterio demonstrado, nao produto inteiro pronto.

Atualizar estado somente quando houver mudanca real. AMBIENTE registra contexto/decisoes e limites de evidencia, sem criar outra lista de tarefas. P0 atual: imagens APP-052; fechamento/APK/web/checkpoint Git (APP-006) dependem de imagens e dos criterios de remocao/refresh. Manter o fluxo proprio do Connect, sem copiar backlog, dominio ou configuracao do ResiCheck principal.

### Durante cada sessao

1. Ler AGENTS, contexto vivo, esta rotina e board; conferir checkout/branch/HEAD/diff. Retomar o que falta, sem repetir trabalho/prova concluida nem sobrescrever alteracoes existentes.
2. Fonte de verdade no repositorio: fonte, scripts, lockfiles, exemplos sem segredo, instrucoes e evidencias sanitizadas suficientes. Drive privado e somente apoio/transferencia de APK/assets/pacotes autorizados; nao e banco nem fonte concorrente. Segredos ficam na custodia aprovada, nunca no repo/Drive/chat.
3. Revisar o diff da alteracao e executar checks/testes focados pertinentes durante dev. Regressao ampla e agrupada uma vez na preparacao de cada APK candidato, repetida apenas se falha/mudanca/risco justificar. Nao reabrir audio resolvido ou testes historicos por rotina; distinguir real/fixture/emulador/fisico.
4. Manter caches, dependencias instaladas, binarios, staging, dumps e recibos efemeros/sessoes fora do checkpoint. Organizar por exclusao do stage ou local temporario aprovado; **nao apagar, mover em massa ou reescrever trabalho/evidencias para limpar o Git**. Registrar dependencias necessarias a reproducao, sem copiar credenciais ou ambiente pessoal.
5. Atualizar contexto vivo ao fim de sessao/mudanca de decisao e board quando o estado/aceite mudar. Gerar STATUS com `npm run project:status`; conferir `npm run project:check`.

### Uma versao, duas trilhas de publicacao e um checkpoint Git

Decisao de Lucas (20/11/2026): cada lote tem **um bump comum** e um gate de aceite, com duas trilhas paralelas registradas dentro do mesmo item de entrega do board, nunca uma fila nova. Android, web e Git possuem status e evidencias independentes.

| Frente | Preparacao e aceite | Evidencia obrigatoria |
| --- | --- | --- |
| Gate comum | Escopo pronto, imagens aceitas neste lote, remocao/refresh e regressao pertinente; mesmo bump APK/web. | Criterios/evidencias do board e manifesto comum; nao reservar nova versao unilateral. |
| Android | Um candidato agrupado; regressao no emulador sobre o proprio APK; assinatura em custodia fora do Git; conferir pacote, versao, assinatura, SHA-256 e disponibilizacao autorizada. | Artefato real, resultado do emulador e limites fisicos, hash, referencia privada de entrega verificada. |
| Web | Build do mesmo lote; smoke no browser; deploy apenas Connect; verificar versao/arquivos servidos e rollback para versao anterior. | Hash/build, resultado browser, alvo exato, versao publicada observada e referencia de rollback. |
| Git | Revisao, checkpoint retomavel, clone limpo e push/ref/SHA verificados no fechamento. | Commit/ref remotos e resultado da retomada; push nao e deploy Android nem web. |

Ao lancar APK validado, publicar tambem a web Connect com o mesmo bump conforme autorizacao existente. Falha/bloqueio em uma trilha nao paralisa a preparacao segura da outra. Nao marcar o par entregue se qualquer trilha faltar, nem criar versoes divergentes unilateralmente: comunicar estado e pedir direcao de Lucas somente se for necessario mudar a entrega combinada. Nao antecipar publicacao neste lote antes de concluir imagens/testes. Manter site principal e demais servicos preservados.

**Remoto oficial publico - decisao de Lucas em 20/11/2026 (Sentinel_7fcd8edbfd888191a6edf609346e86cb):** `https://github.com/Spinon/Resicheck_Connect.git` deve continuar publico para compartilhar a fonte revisada. Nao criar destino privado nem alterar visibilidade. O Resicheck privado e outro projeto e nao e destino do Connect. Publicar fonte no Git nao autoriza incluir credenciais, dados/evidencias/logs privados, custodia ou binarios gerados; os filtros e a revisao de seguranca permanecem. Push continua no fechamento de cada lote, apos gates de regressao, separado de deploy e sem alterar main ou enviar historico local desconexo. A antiga exigencia de destino privado esta superada.

### SEMPRE ao fechar cada lote

1. Fazer revisao breve do diff e checks pertinentes, confirmar aceite e limites. Separar mudancas anteriores/fora do lote; nao usar `git add .` nem publicar historico local em massa sem revisao. Nao perder trabalho pendente.
2. Versionar checkpoint coerente: fontes web/mobile/backend, scripts, lockfiles, configuracao de exemplo sem segredo, versoes/pins publicos, instrucoes para dependencias e build/testes. Evidencias versionadas devem ser curtas/sanitizadas; excluir tokens, senhas, chaves, `.env`, dados pessoais, custodia, provas de sessao e binarios gerados. O snapshot tem de permitir retomada em outra estacao, nao apenas baixar o APK.
3. Preparar branch propria de fechamento no remoto existente **verificado** (`https://github.com/Spinon/Resicheck_Connect.git`, confirmar novamente no fechamento). Curar a partir da referencia apropriada sem reescrever historico, sem enviar automaticamente os 193 commits locais e sem modificar `main` por este alinhamento. Commit/push de fim de lote estao solicitados por Lucas; nao e deploy e nao exige PR por ajuste. Nao enviar este lote antes de fechar.
4. Validar retomada em clone limpo do checkpoint: instalar a partir dos lockfiles/documentacao oficiais, usar exemplos e obter segredos somente pela custodia legitima, executar checks e build/jornada pertinentes em ambiente autorizado. Registrar comandos, versoes e resultado; se depender de componente nao versionavel, documentar origem/hash e instrucao verificavel. Nao declarar reproduzivel com teste pendente.
5. Registrar no manifesto versao APK/web, **SHA do commit de fonte**, hashes reais de artefatos, assinatura e limites dos testes. Preparar um unico APK agrupado apos imagens e validar o proprio APK; publicar web Connect com o mesmo bump conforme autorizacao, preservando ResiCheck principal. Nao confundir push de fonte com deploy.
6. Enviar o checkpoint ao remoto existente e confirmar a ref com leitura remota (`git ls-remote` ou conector oficial), comparando o SHA exato e a retomada do clone limpo dessa ref. Se divergir/falhar, relatar sem afirmar envio ou fechamento completo. Atualizar contexto, board/STATUS, notas e links observados.

Situacao de partida em 20/11: remoto main `34d1066`, branch local `work/unicode17-validation` com HEAD `08841af`, 193 commits locais ausentes do remoto e muitos arquivos pendentes. O lote **0.0.32 foi entregue, mas nao tem SHA de fonte/reconstrucao comprovados**. Esta rotina nao cria retroativamente essa prova. Nao houve commit, push ou alteracao de branch para registrar a decisao.

### Referencias historicas no checkpoint portavel

O export curado conserva a fila canonica, criterios e estados; recibos privados/efemeros nao sao copiados. Referencias antigas ausentes podem constar explicitamente em docs/project/ARCHIVED-EVIDENCE-REFERENCES.json, com caminho, SHA-256 e tamanho, tipo historical-reference-only-not-functional-revalidation. scripts/project-evidence.mjs valida esse contrato somente quando declarado no board exportado; evidencia nova ausente continua falhando. O indice nao e prova funcional nem altera aceite historico. Contexto portavel omite payloads antigos, preservados no checkout de origem; STATUS sempre regenerado. Nao copiar o acervo para satisfazer check.

### Preparacao corrente33, ainda sem build

Fonte comum: apps/mobile/candidates/messaging33/release-plan.PREPARED.json; manifesto: delivery/manifest-0.0.33.PREPARED.json. tools/delivery/prepare-messaging33.mjs --prepare-only prepara entradas isoladas/manifesto/mapa Git, sem construir, alterar entradas padrao ou publicar. Os estados Android/web/Git permanecem independentes em APP-006, com gate de disponibilidade normal das imagens em APP-052. Checklist: docs/testing/ROTEIRO-APK-WEB-0.0.33-PREPARED.md e regression-plan.json do candidato; nao repetir prova API/codec encerrada.

O mapa output/messaging33-normal-preparation/checkpoint-map.json e apoio local, nao fonte de verdade nem checkpoint concluido. Revisar os arquivos separados por literais suspeitos sem imprimir valores e resolver referencias historicas do board a evidencias que nao irao ao Git antes do ensaio de clone limpo. Adapters33 orientados ao plano e inspector33 foram adicionados sem alterar historicos; o clone teve Android regenerado e default web33 aplicado preservando factory. Fingerprint comum e resultados em apps/mobile/candidates/messaging33/builder-validation.json. Gradle/assinatura/export/browser/deploy continuam gates posteriores; nenhum APK/export foi executado nesta preparacao.


Historical delivery links/receipts remain in the approved private archive; public release metadata is in the candidate manifest.
