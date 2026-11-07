# Redimensionamento Android: baseline 0.1.2

Diagnóstico local de 2026-11-06, somente dados fictícios. APK instalado confirmado por SHA-256 `f62918470bd7f51b295736f4f52d3bd12c5110f7b5934a9b95c9c0ea4cafbb7c`. Nenhuma alteração no App, modelo, React Native ou permissões durante a execução.

Reprodutor: `apps/mobile/scripts/android-resize-diagnostic.mjs`. Exige serial explícito, `ro.kernel.qemu=1`, AVD `Connect_Demo_API36`, pacote e hash exatos. Comando, a partir da raiz:

```powershell
node apps/mobile/scripts/android-resize-diagnostic.mjs --serial emulator-5554 --adb "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
```

O comando precisa alcançar o ADB do host. Não iniciar outra automação simultaneamente. O script não inicia nem encerra o emulador; restaura tamanho, densidade e escala de fonte em `finally`. A execução preserva screenshots PNG, XML, dimensões, estado nativo do IME e a hierarquia nativa da própria Activity.

Evidência: `output/resize-baseline/run-2026-11-06T23-41-49-344Z/result.json`, 31 frames. As cinco rotas foram observadas; isso significa diagnóstico concluído, não aplicativo aprovado.

Todos os ensaios usaram largura física emulada 880px, densidade 440 e fonte 2.0 (320dp de largura). Alturas 4096px e 2048px são configurações de teste, não aparelhos físicos.

| Rota | Observação em 2048px |
| --- | --- |
| Inicialização fria em 2048 | Campo visível; abrir/ocultar teclado funciona. |
| 4096 → 2048 sem abrir teclado | Campo visível. |
| Abrir e ocultar teclado em 4096; depois reduzir | Campo fica fora da superfície, inclusive após espera adicional. |
| Manter teclado aberto durante a redução | Campo se ajusta; ocultar depois também funciona. |
| Digitar, ocultar teclado, enviar mensagem simulada, reduzir | Reproduz a ausência do campo; envio não é necessário, pois a terceira rota já falha. |

No caso falho `used-small-hidden`, o IME declara `mInputShown=false` e a superfície nativa mede 880×2048. O `ReactEditText` continua em y=2881..3050 e o `ReactScrollView` em y=694..2750. São as mesmas coordenadas observadas com teclado aberto na altura 4096. O XML recorta a lista em 2048 e omite o campo; a hierarquia nativa confirma que não é apenas omissão da árvore de acessibilidade. Antes da redução, `used-large-hidden` comprova teclado oculto e campo corretamente devolvido a y=3828..3997.

Não foi possível tocar o campo fora da tela para reabrir o IME. Sair e reentrar na conversa, sem reiniciar o processo, restaurou o campo a y=1780..1949; com teclado aberto, y=1066..1235. As recuperações e seus estados estão nos frames `used-recovery-*` e `failure-recovery-*`.

A causa interna permanece aberta: não há instrumentação de eventos JS nem do estado de `KeyboardAvoidingView`. O manifest usa `adjustResize`; o App baseline usa `behavior="height"` no Android. Comparar uma variante com ajuste somente pelo Android é um experimento pequeno possível, não uma correção já demonstrada. Não atribuir a falha apenas ao cache de altura inicial, ao IME ou à fila de mensagens.

Configuração restaurada e verificada por igualdade exata: tamanho físico 1080×2280 sem override, densidade física 440 sem override, fonte `1.0`. O diagnóstico não cobre split-screen, rotação, aparelhos físicos, outros teclados ou versões Android. Nenhum backend, autenticação, envio de chat, áudio ou push real foi testado.

## Comparação A: rodapé removido, comportamento `height` preservado

Variante 0.1.3/code4, SHA-256 `59beb45d9c9a68e81bd09ad30706b4ca892649981cc8d4b6390c10102c52f344`; certificado debug igual ao baseline. A remoção do rodapé não corrigiu o redimensionamento: abrir/ocultar IME em 4096 e reduzir para 2048 voltou a deixar `ReactEditText` em y=2881..3050, fora da superfície de 2048 px, com `mInputShown=false`. A espera adicional manteve a falha. Reentrar no chat recuperou campo e teclado. Sete frames em `output/resize-comparison/run-2026-11-06T23-48-07-156Z/result.json`; configuração original restaurada e verificada.

Reprodutor comparativo `apps/mobile/scripts/android-resize-comparison.mjs`: executa somente essa rota e as recuperações, com o argumento adicional obrigatório `--expected-sha256 HASH`. O hash instalado é verificado antes de alterar configurações. `diagnostic-completed` significa que as observações foram concluídas; não significa que a variante passou. O diretório anterior `run-2026-11-06T23-47-49-729Z` registra uma falha segura do guard de hash antes de qualquer ensaio, após um instalador auxiliar abortar por normalização incorreta de CRLF; não é achado do produto.

## Comparação B: Android com `padding`

Variante 0.1.3/code5, SHA-256 `565cc3482633b5751788190b2e3a34f0edfa6c4bbdb3838d5226939523768b59`; assinatura e pacote conferidos antes da instalação no AVD próprio. Fonte arquivada em `output/ergonomics/variant-b/App.tsx`; alterações documentadas em `source-delta.json` ao lado. Além do comportamento Android, B inclui `minWidth:0` no título do modal, que fica fechado durante a reprodução de resize.

A mesma rota que falha em A manteve o campo acessível em B, após reduzir e aguardar, abrir/ocultar teclado e reentrar na conversa. Oito frames: `output/resize-comparison/run-2026-11-06T23-53-51-414Z/result.json`. A primeira tentativa B em `run-2026-11-06T23-53-05-257Z` parou antes da redução por comparar strings equivalentes de fonte (`2.0` e `2`); o guard foi corrigido para comparação numérica. Não é falha do produto.

Matriz ampliada: `output/ergonomics-native/run-2026-11-06T23-55-42-153Z/result.json`, 28 frames e duas capturas extras de modal. Reprodutor `apps/mobile/scripts/android-ergonomics-native.mjs`, com os mesmos argumentos do comparativo. Quatro grupos passaram com limitações:

- Largura de 1080 px, densidade 440 (aproximadamente 393 dp), fonte 1; largura de 880 px, densidade 440 (320 dp), fonte 2.
- Inicialização em 2048 e 4096; mudanças 2048↔4096 com teclado aberto e fechado.
- Rascunho ASCII sintético completo e foco nativo verificados após cada mudança; estado IME, tamanho solicitado e fonte observada também exigidos.
- Botão Fechar e BACK do modal funcionaram nas duas configurações, sem alterar o rascunho. Capturas vistas: `default-modal.png` e `narrow-font2-modal.png`; Fechar aparece inteiro, sem redução de fonte. O título quebra em várias linhas no tamanho 200%.

Limites reais de UX: com fonte 2 e um rascunho de 24 caracteres em várias linhas, o campo usa rolagem interna e a lista de conversa aberta com IME fica com 81 px de altura (y=694..775). O texto completo permanece na árvore nativa e no estado, mas isso não demonstra leitura confortável de toda a conversa. A remoção dos controles do rodapé ajuda a organização, sem eliminar esse limite do cabeçalho/compositor.

O gesto nativo de seleção foi fotografado antes e depois de ambas as mudanças. Na configuração padrão, o destaque/handles/toolbar visíveis antes não aparecem depois; a conservação do texto não prova conservação dos índices da seleção. UIAutomator não expõe os índices nessa árvore.

O controle comportamental confirmou uma diferença de seleção: `output/selection-resize/run-2026-11-07T00-00-08-811Z/result.json`, oito frames, script `apps/mobile/scripts/android-selection-resize.mjs`. Sem resize, selecionar `SYNTHETIC123` inteiro e pressionar DEL esvaziou o campo. Com a mesma seleção seguida de 2048→4096→2048, DEL deixou `SYNTHETIC12`, removendo apenas o último caractere. As leituras/capturas intermediárias também ocorreram no controle; ambas as rotas tinham valor completo, foco nativo e IME aberto imediatamente antes de DEL. Portanto, B não preservou o comportamento da seleção nesse ensaio, apesar de preservar o rascunho e corrigir a posição do compositor. Não foi comparado ainda a um EditText nativo puro; causa e eventual correção permanecem abertas. Nenhum clipboard foi lido ou escrito pelo teste.

Configurações restauradas exatamente ao final da matriz. Esses ensaios sustentam a correção da sequência reproduzida nesse emulador, não uma causa interna comprovada nem validação de todos os teclados, aparelhos e eventos de configuração.

## Controle C: seleção com `height`

C mantém a interface de B e restaura somente o comportamento Android `height`: versão 0.1.3/code6, SHA-256 `d15e2893ac4efffd2a293635b02681f59a5184cfbc2d2138f387c50929be2cbb`, fonte arquivada em `output/ergonomics/variant-c/App.tsx`. Não houve downgrade nem limpeza do armazenamento do aplicativo.

O mesmo probe DEL foi repetido, sem matriz adicional: `output/selection-resize/run-2026-11-07T00-05-53-631Z/result.json`, oito frames. Sem resize, DEL esvaziou `SYNTHETIC123`; após resize deixou `SYNTHETIC12`. Foco e IME permaneceram ativos. A diferença de seleção, portanto, foi observada tanto em B/padding quanto em C/height; não é exclusiva do padding. Isso não estabelece causa Android, IME ou React Native.

Há uma ressalva de evidência: UIAutomator avisou `could not get idle state` no frame C `resized-intermediate`. A AX desse frame pode ser antiga e fica excluída da comparação de geometria. Screenshot PNG, tamanho WM e `dumpsys activity top` foram obtidos sequencialmente, sem atomicidade. A hierarquia nativa C registra superfície 1080×4096, campo y=3865..3997 e lista y=410..3774, enquanto o PNG mostra o campo alto, próximo de y=1000; não usar esse frame instável para aceite de geometria. B registra campo y=2919..3051 e lista y=410..2828. Os caminhos intermediários não são equivalentes. Antes de DEL, na altura 2048, ambos têm campo próximo de y=1060..1193, texto completo, foco e IME ativos. As leituras após DEL demonstram a mudança de conteúdo em ambas as variantes e diferem dos respectivos controles.

O harness foi reforçado para próximos ensaios: apaga somente seu XML temporário anterior antes do dump, rejeita erro/arquivo ausente e limita novas tentativas a três. Não reutiliza silenciosamente um dump antigo quando UIAutomator termina com código zero sem escrever. C não foi repetido após esse reforço; o limite do frame intermediário permanece registrado. Configuração original restaurada ao terminar C.

## Final D: subtítulo compacto e QA dirigido

APK `output/ergonomics/final-d/connect-ergonomics-0.1.3-build7.apk`, versão 0.1.3/code7, 42.089.864 bytes, SHA-256 `528fa066c449080e13104ef2812685ba9fd05566b0ccbe2a7acf23bce5220ee9`. Pacote e certificado debug `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c` conferidos; o manifest só solicita a permissão própria de receiver, sem Internet ou microfone. D retorna ao padding de B e troca o subtítulo do paciente por `Conversa local`; o nome da empresa continua no título. Não foi repetida a matriz inteira nem o probe Unicode.

Reprodutor: `apps/mobile/scripts/android-ergonomics-final.mjs`, com os argumentos de serial, ADB e hash esperado. Primeiro resultado preservado em `output/ergonomics-final/run-2026-11-07T00-13-59-591Z/result.json`: status `failed`, dois grupos concluídos e terceiro interrompido por um erro de guard do harness. Ao solicitar 1080×2280, igual à resolução física, o Android informa somente `Physical size`, sem `Override size`. O guard exigia um override e abortou antes de digitar no smoke padrão; a tela estava normal. Essa falha não foi apagada ou reclassificada como aprovação.

Após corrigir a leitura da dimensão efetiva (override, quando presente; senão físico), repetiu-se apenas o cenário padrão, sem reinstalar ou modificar o APK:

```powershell
node apps/mobile/scripts/android-ergonomics-final.mjs --serial emulator-5554 --expected-sha256 528fa066c449080e13104ef2812685ba9fd05566b0ccbe2a7acf23bce5220ee9 --mode default-only --adb "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
```

Suplemento `output/ergonomics-final/run-2026-11-07T00-17-06-122Z/result.json`: `passed-with-limitations`, três frames, `settingsRestored:true` e o mesmo hash do APK instalado. Digitou `QA_final`, verificou valor/foco/IME e confirmou a mensagem na simulação.

Os dois grupos concluídos no primeiro ensaio verificaram:

- Com o mesmo rascunho de 24 caracteres, largura 320 dp e fonte 200%, a área da lista passou de 81 px (B) para 257 px (D): y=518..775, ganho 176 px, sem diminuir fonte. O campo continua com rolagem interna para suas várias linhas; espaço ampliado não equivale a leitura integral de mensagens altas com teclado aberto.
- Abrir/ocultar IME em 4096 e reduzir para 2048 preservou campo acessível, rascunho e foco nativo. Botão Fechar e BACK do modal conservaram o rascunho.
- Falha ativada pelo painel foi exibida; retry foi acionado com IME aberto. O mesmo ID `delivery-state-queued-demo-1-intent-1` passou de não confirmado para confirmado na simulação, e o botão retry deixou de aparecer. Capturas `final-failure-closed.png`, `final-failure-open.png`, `final-accepted-open.png` e `final-accepted-closed.png`. As capturas fechadas foram inspecionadas visualmente: textos legíveis e sem sobreposição.

A cobertura dirigida foi concluída pela combinação dos dois resultados; o primeiro arquivo continua `failed`. A limitação de seleção observada em B e C permanece aberta e não foi retestada em D. Não há prova de envio/autenticação/backend reais, tempos nativos de pending/sending, TalkBack, aparelhos antigos, áudio ou notificações nesta fatia. Todos os dados são fictícios. A restauração final e o encerramento do AVD próprio são registrados em `output/ergonomics/owned-emulator-cleanup-final.json`.
