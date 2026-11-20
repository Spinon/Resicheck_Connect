# Roteiro de regressão APK/web0.0.33 — PREPARADO, NÃO EXECUTADO

Plano de19/11/2026. Imagens devem ser aceitas primeiro. Este documento não autoriza abrir grants, login, gerar APK, iniciar emulador ou publicar antes da coordenação. Não repetir piloto de áudio: regressão será pelo transporte normal já existente.

## Versão e artefato únicos

Última entrega e web realmente servida:0.0.32-teclado-recibos/build32. Em19:02:24UTC dois GETs públicos confirmaram HTML e bundle idênticos à entrega32, incluindo a identificação no JavaScript. Recibo: apps/mobile/next-lot-hosted-version-readonly.json.

Próximo bump preparado:0.0.33-mensagens/build33, Android e web iguais. Fonte única: apps/mobile/candidates/messaging33/release-plan.PREPARED.json. Rascunhos entry.android.tsx.template e entry.web.tsx.template compartilham essa identidade; NÃO são entradas registradas e não foram exportados. Nenhum bump vivo foi aplicado.

Preservar package com.resicheck.connect.pendingonlinephone, ABIs arm64-v8a+x86_64 e certificado existente SHA256fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c. app.json/package.json genéricos ainda são o demo0.1.4 e o build-spec básico fixa23: não usá-los como versão atual. O builder do último lote fixa32 e o completo histórico fixa30; a preparação final precisa consumir o plano33 e as factories atuais em saídas isoladas, nunca fazer substituição global de números históricos.

Antes de preparar o único APK:
-prova regular de imagem real concluída, fechada/auditada;
-frontend e backend disponíveis nos escopos que serão testados no APK: janela de10min encerrada não é serviço contínuo;
-disponibilidade atual da prévia CNPJ/convites conferida e coordenada, sem inferir ativação de evidência histórica;
-atores sintéticos elegíveis e não reservados com meio legítimo de login pela UI; magic links de um runner API não equivalem a senha disponível no app;
-para convites, destinatário aprovado sem vínculo com a empresa alvo; não desfazer vínculos existentes para fabricar o cenário;
-fontes estabilizadas e congeladas juntas, incluindo novo sha256ImageHex nativo e raízes de imagens;
-um candidato universal, inspecionado e validado pelo próprio hash; não compilar uma versão por caso.

Se uma pré-condição faltar, marcar BLOQUEADO e explicar. Não promover simulação ou prova API a resultado da UI/Android. Se recursos continuarem fechados, não oferecer o lote como funcionalidade completa.

## Android disponível

SDK/JDK existentes, sem instalação: API36, NDK27.1.12297006, CMake3.30.5, aapt/apksigner36.0.0, adb e emulator presentes. AVD Connect_Demo_API36: Google APIs, x86_64, RAM2GiB. Em19:01UTC Get-Process não observou adb/emulator/qemu/studio em execução. CIM estava indisponível; não foi repetido nem elevado. NenhumADB foi chamado ou daemon/emulador iniciado. Aparelho físico não confirmado.

Futuro alvo: um emulador próprio read-only, -no-snapshot, -no-window, -no-audio, -audio none,2cores/2048MiB, porta5572 somente se livre e sem adotar dispositivo existente. Registrar PID, serial e bootId em owner33 próprio. Não executar os launchers antigos que instalam32. Se ADB/revisor negar, parar esse caminho; não mudar porta/canal para contornar.

Não se confunde emulador com teste físico: APP261(crash na primeira retomada) permanece aberto; acústica, volume de mídia em silencioso e TalkBack físico permanecem pendentes se telefone indisponível.

## Admissão executável do APK, SOMENTE após ele existir

No PowerShell do checkout, preencher o caminho do candidato produzido e inspecionado; estes comandos NÃO foram executados agora:
~~~powershell
$taskApk = 'CAMINHO_DO_UNICO_APK_CANDIDATO_33'
$taskPkg = 'com.resicheck.connect.pendingonlinephone'
$taskAdb = Join-Path $env:ANDROID_HOME 'platform-tools/adb.exe'
$taskAapt = Join-Path $env:ANDROID_HOME 'build-tools/36.0.0/aapt.exe'
$taskSigner = Join-Path $env:ANDROID_HOME 'build-tools/36.0.0/apksigner.bat'
Get-FileHash -LiteralPath $taskApk -Algorithm SHA256
& $taskAapt dump badging $taskApk
& $taskAapt dump permissions $taskApk
& $taskSigner verify --verbose --print-certs $taskApk
~~~
Exigir versionCode33/versionName0.0.33-mensagens, package/ABIs/certificado acima, PrivacyActivity, não-debuggable, backup/cleartext OFF, INTERNET+RECORD_AUDIO sem permissões amplas de armazenamento/câmera. Conferir metadados Expo e Conta iguais e método nativo sha256ImageHex presente no artefato. Conferir source-index congelado do próprio build.

Com emulador futuro já identificado e pertencente à rodada:
~~~powershell
$taskSerial = 'emulator-5572'
& $taskAdb -s $taskSerial get-state
& $taskAdb -s $taskSerial shell getprop ro.kernel.qemu
& $taskAdb -s $taskSerial shell getprop ro.build.version.sdk
& $taskAdb -s $taskSerial shell cat /proc/sys/kernel/random/boot_id
~~~
Exigir device/1/36/bootId igual ao owner33; em caso diferente não instalar. Só então instalar -r no emulador próprio, conferir dumpsys package e puxar seu base.apk para cópia local cujo SHA iguale o candidato. Não selecionar telefone físico automaticamente nem apagar dados/caches de outro alvo. Os scripts32 existentes fixam versão/hash/boot próprios: podem fornecer funções já validadas, mas NÃO executá-los cegamente contra33.

## Dados e evidência

Duas contas sintéticas não reservadas, duas empresas para negativas e conversa exclusiva da rodada. Consultar operator-test-reservation.json. Usar mecanismo privado já autorizado (known-synthetic-auth.mjs nos testes nativos existentes), sem imprimir senha/JWT e sem levar segredo a argv, screenshot, XML, Drive ou commit. Não usar Fernanda/Claudio/contas reservadas de Lucas automaticamente.

Gerar poucos dados e reutilizá-los:2textos,1áudio sintético curto, PNG original e JPEG otimizada sintéticas. A prova regular atual fixa apenas PNG77bytes e não autoriza trocar sua fixture por JPEG; preparar o escopo de validação do APK com os arquivos exatos necessários ou disponibilidade operacional revisada. Nenhuma ampliação automática de prazo/arquivo/empresa.

Salvar resultado por caso com APKsha, fonte congelada, plataforma/emulador ou físico, atores/sessões públicas, IDs novos, início/fim, backend real ou simulado, passou/falhou/bloqueado, capturas sem segredo e limpeza. Logs de erro sanitizados por pacote/etapa, sem stderr/token bruto. Manter originais/auditoria; remover da exibição somente as mensagens novas do teste.

## Rodada agrupada — executar na ordem, uma vez no artefato admitido

### M33-01 — sessão, texto, teclado, cache e recibos
1.Login normal na UI. Escolher empresa; entrar na conversa isolada e enviar2textos Unicode curtos distintos.
2.Selecionar contexto B e voltar A: nenhuma conversa/mídia de A aparece em B.
3.Com últimas mensagens visíveis, abrir teclado: última mensagem/compositor não ficam cobertos. Lendo mensagens antigas, abrir/fechar teclado sem saltar para o fim.
4.Segundo ator abre a conversa em canal autorizado; só reconhecer1certo após servidor,2após confirmação real do destinatário e colorido após observação real. Sem entrega/visualização simulada por timeout ou background.
5.Reabrir histórico local já existente (reaproveitar dataset125mensagens quando disponível, não criar outro stress). Conferir contagem/ordem/sem duplicação e medir abertura fria/quente; sincronização sem reconstruir lista equivalente.

### M33-02 — áudio normal, sem piloto
1.No compositor, tocar microfone, observar barra/duração, cancelar uma tentativa sem envio.
2.Gravar um único áudio curto com entrada virtual sintética; revisar, enviar e aguardar status real do transporte normal/worker existente.
3.Receptor lê/reproduz arquivo real. Loading circular ao redor do play, sem texto redundante ou percentual inventado; ícone volta ao normal, progresso avança e stop/fim respondem.
4.Rascunho de texto sobrevive. Não rearmar SQL/permit de áudio, trocar worker, resetar conta ou repetir codec-smoke.
5.Emulador valida fluxo/decoder, não acústica física nem comportamento do silencioso. Registrar essas limitações.

### M33-03 — imagens normais
1.Abrir picker pelo compositor, cancelar e voltar; rascunho e sessão preservados.
2.Selecionar PNG sintética original: revisão, escolha, envio/quarentena/inspeção/mensagem reais. sha256ImageHex precisa funcionar no novo APK; tipo/build não bastam.
3.Destinatário abre a imagem privada e amplia; digest/arquivo correspondem ao enviado; nenhum URL público/bypass.
4.JPEG sintética na opção de compactação: verificar prévia, saída efetiva e limites; declarar se original e otimizada foram ambas testadas. Não chamar a janela PNG77existente para este arquivo.
5.Sem permissão/seleção inválida/saída de contexto: erro acionável, sem publicação parcial ou envio duplicado; não criar nova bateria de formatos fora PNG/JPEG.

### M33-04 — remover texto, áudio e imagem
1.Reutilizar as mensagens novas anteriores. Segurar entra em seleção e barra superior; cancelar, selecionar múltiplas e conferir ações por autoria.
2.Recebedor remove para mim: balão/máscara só para ele, mídia negada para ele e ainda acessível ao autor.
3.Autor remove para todos os tipos selecionados: balão para ambos; voltar/reabrir e sincronizar cache sem reaparecer texto/thumbnail/player.
4.Um usuário não autor não pode remover para todos; verificar UI e negativa servidor sem alterar mensagem alheia.
5.Readback independente confirma original, objeto privado, recibo e log preservados; não executar DELETE de conteúdo.
6.Não prometer apagar cópia exportada nem conhecimento de remoção global antes de sincronizar offline. Após receber a máscara, conteúdo não pode reaparecer no cache.

### M33-05 — refresh estável e mudança real
1.Conversa em foco, leitura antiga ancorada. Registrar linha/offset e aguardar25s sem alterações (poll atual10s): sem tilt, indicador de fluxo ou salto.
2.Segundo ator manda um texto novo: atualizar conteúdo preservando âncora quando usuário está lendo acima. No fim, acompanhar a mensagem quando apropriado.
3.Scroll intencional durante refresh permanece sob controle do usuário; updates de recibo não remontam/reordenam balões equivalentes.

### M33-06 — empresa/CNPJ
1.Abrir empresa existente e resumo; selecionar empresa carregada e verificar cliques/contexto.
2.Recuperar pedido sintético já aprovado: situação e empresa corretas, sem nova criação/consulta por rotina.
3.Com prévia real disponível, preencher dados públicos, editar um campo e confirmar sem sobrescrever edição. Ausência de telefone não pode gerar dado inventado. Dados podem estar até62dias antigos; existência/CNPJ não prova representação.
4.Testar erro/indisponibilidade e CNPJ inválido sem fornecedor. Nova criação apenas com fixture não duplicada preparada por fluxo normal; não apagar empresa existente ou repetir requisição consumida.
5.Se apenas a API histórica foi provada, registrar exatamente isso e deixar a lacuna de tela atual pendente.

### M33-07 — vínculo por convite funcionário/cliente
1.Com emissor elegível e destinatários de teste aprovados/sem vínculo, emitir um novo link de cada tipo e revisar empresa/conta na UI.
2.Funcionário aceita convite válido e entra direto, sem segunda aprovação. Sem convite, busca/solicitação continua aguardando gestor.
3.Cliente aceita e acessa somente seu próprio chat; funcionário aprovado vê conversas da empresa.
4.Gestão após reabertura conserva status; revogação de link impede novo aceite sem desfazer vínculo já aceito.
5.Uma negativa de outra conta/empresa e um replay do mesmo aceite; não reusar o bearer consumido da prova antiga ou desfazer vínculos para fabricar teste.
6.Colagem/compartilhamento Android conferidos; App Links só declarado testado se o retorno real ao APK ocorreu.

### M33-08 — retomada, privacidade e encerramento
1.Três ciclos Home/retorno, incluindo primeira retomada após atualização. Rascunho, empresa, scroll e mídia não duplicam nem passam entre contas. Gravação/picker devem encerrar/retomar com segurança, sem envio automático.
2.Uma retomada após término do processo no emulador, preservando dados locais conhecidos. Sem atribuir sucesso de APP261 físico à ausência de reprodução virtual.
3.Logout próprio invalida UI/recursos/cache conforme política. Encerrar apenas sessões da rodada e conferir readback; navegador Lucas, áudio/VPS/site principal intactos.
4.Restaurar somente recursos/radios/escala alterados no emulador próprio; parar somente o processo de emulador pertencente à rodada. Não limpar banco ou artefatos antigos.

## Web do mesmo lote

Antes de publicar: reutilizar provas locais válidas e revisar build/export do mesmo0.0.33 sem APK paralelo. Layout390px/1280px, navegação, conta, CNPJ/convites, seleção e compositor; declarar serviços simulados quando usados localmente. Não chamar isso de hospedado.

Após APK admitido e validado, publicar SOMENTE Connect com mesmo bump, preservar bundle anterior e site principal; então conferir HTML/bundle/hashes/versão e os fluxos hospedados reais de imagem/remoção/áudio/cache/recibos. Se falhar, preservar evidência e reverter somente Connect ao pacote anterior; não declarar a publicação validada por HTTP200.

Achado concreto desta preparação: CSP atual servida tem img-src 'self' data: e bloqueia Blob. O gerador local prepare-connect-hostinger.mjs agora inclui blob: em img-src para o próximo pacote; nenhuma configuração remota mudou. Verificar cabeçalho efetivo e imagem real hospedada, sem mudar a raiz ResiCheck. microphone=(self), camera=() e media-src blob: foram preservados.

## Saída esperada

Um APK com SHA/certificado/inspeção e resultado desta rodada; web da mesma versão com readback; notas com funções reais versus fechadas/simuladas, limites de emulador/físico e pendências abertas. Não marcar item done por este roteiro. Nenhum caso foi executado agora; só inventário, leitura pública de versão/cabeçalhos e preparação local.

## Checkpoint de preparo — 20/11/2026, sem build

Gate comum: correção do binding S3 validada em Deno2.1.4, mas cadeia hospedada e disponibilidade contínua de imagens ainda pendentes. Não confundir leitura sintética com aceite. Android: um candidato33 somente após esse gate, regressão agrupada sobre o próprio APK conforme roteiro acima. Web: mesmo bump33, build/smoke browser/deploy apenas Connect e rollback; não executar agora. Git: checkpoint/clone/push separado no fechamento. Nenhuma frente marcada entregue; fontes e testes anteriores preservados.
