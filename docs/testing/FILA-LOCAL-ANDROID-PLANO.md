# QA Android da fila local — preparação

Preparação sem iniciar AVD, compilar ou instalar APK. Executar somente após receber o contrato de textos/seletores, os cenários controlados e o candidato com SHA-256. A fila é uma simulação local; estes testes não provam entrega por rede, autenticação ou persistência após encerrar o processo.

## Cenários a materializar no contrato

| Caso | Observação exigida |
|---|---|
| pending → sending → accepted | Mesma identidade visual da bolha, texto íntegro, estado correto; nada de marcar entrega real |
| falha → retry → accepted | Erro seguro e ação de retry visíveis; reutilizar a mesma bolha/identidade; não observar uma segunda bolha |
| aceite com confirmação perdida | Retry com mesma identidade; resultado final aceito sem segunda mensagem; complementar com teste de modelo/idempotência |
| Unicode | Fixture ou colagem nativa de texto sintético próprio; preservar tom, ZWJ, bandeira e combinação; não usar `adb input text` para Unicode |
| sair do chat em pending/sending | Completar a simulação após a saída; não reabrir a tela nem inserir conteúdo na conversa errada |
| trocar empresa antes da conclusão | Contexto B não mostra mensagem, erro, retry ou resposta de A; retornar a A conforme contrato do modelo |
| logout antes da conclusão | Conclusão antiga não reaparece no welcome ou numa nova sessão; não reiniciar dados via `pm clear` |
| erro/retry em 320dp/fonte2 | Texto e retry alcançáveis com teclado aberto/fechado; separar geometria integral de acesso por rolagem |

## Contrato necessário

Cada cenário deve oferecer um estado observável/determinístico. UIAutomator demora aproximadamente segundos por leitura; `sending` muito curto pode não ser capturado. Preferir controle explícito de avançar/segurar na simulação ou registrar como não verificado quando o estado não puder ser observado. Não criar uma corrida de taps baseada em sleeps presumidos.

O contrato deve informar os seletores acessíveis/testIDs reais, textos de estado/erro/retry, o identificador estável da bolha e os controles para sucesso, falha e confirmação perdida. IDs observados serão guardados antes do retry e comparados depois. Não presumir IDs `local-20` ou textos que ainda não foram definidos.

## Evidência e critérios

Guardar XML, PNG, hash do contrato/candidato, versão instalada e dimensões/fonte/teclado efetivos em `output/queue-qa/`. Exigir serial de emulador explícito, qemu=1 e AVD `Connect_Demo_API36`; interagir apenas com `com.resicheck.connect.demo` por bounds observados. Preservar APKs entregues e configurações originais, restaurando wm/density/font em finally.

Uma contagem de bolhas no XML prova apenas o conteúdo exposto pela árvore naquele momento. Não chamar isso de prova global de deduplicação se houver virtualização ou itens fora da tela. Usar cenário pequeno/rolagem limitada e manter os testes do modelo como evidência separada da unicidade da fila inteira.

Falhas de seletor, estado transitório não observado, teclado divergente ou configuração diferente da solicitada são incompletudes do teste. Não marcar como aprovado. O teste de 320dp/fonte2 exige leitura dos valores reais de wm/font e IME, sem habilitar serviços de acessibilidade ou alterar permissões.

## Estado atual

Este documento começou como preparação; a execução efetiva foi realizada depois da liberação do candidato0.1.2/code3, SHA-256 `f62918470bd7f51b295736f4f52d3bd12c5110f7b5934a9b95c9c0ea4cafbb7c`. Ver os resultados e limites abaixo; a preparação não é o registro final de cobertura.

Seletores informados: `message-ID`, `delivery-ID`, `delivery-state-ID`, `delivery-retry-ID`. O sufixo ID será descoberto pela árvore, sem presumir seu formato. Toggle `delivery-failure-toggle`, label `Simular falha no próximo envio`, checked true/false; fica no rodapé rolável e reinicia depois de iniciar o envio. Retry: label acessível `Tentar novamente na simulação`, texto visível `Tentar novamente`.

| Estado | Texto informado |
|---|---|
| pending | Pendente · simulação |
| sending | Confirmando na simulação… |
| accepted | Confirmado na simulação · sem envio real |
| failed | Não confirmado · simulação |

O sucesso/falha simulado ocorre após640ms; retry também leva640ms. Sem controle de hold, leituras XML provavelmente observarão apenas os estados finais. Um PNG imediatamente após o tap pode registrar a transição se o tempo efetivo permitir; não atribuir status de pending/sending ao teste nativo só porque o teste unitário os cobre. Os testes com relógio injetado serão a evidência dessas transições; confirmação perdida é somente teste unitário nesta etapa.

Sair do chat pode ser acionado por BACK logo após o send, registrando tempos efetivos. Troca de empresa e logout antes de640ms não podem ser prometidos por uma sequência de buscas XML que demora segundos: cobrir deterministicamente no modelo e registrar o cenário nativo como não verificado se não houver evidência de que a mudança aconteceu antes da conclusão. Não acrescentar controles de UI sem alinhamento.

## Execução efetiva em Android API36

Resultado consolidado local: `output/queue-qa/summary.json`. Runner: `apps/mobile/scripts/android-queue-native.mjs`; helpers e12 verificações estáticas: `apps/mobile/scripts/android-queue-smoke.mjs`.

Execução principal em `output/queue-qa/run-2026-11-06T22-56-25-464Z/`: cinco jornadas passaram — confirmação simulada, falha/retry com mesma bolha, BACK logo após enviar sem reabertura indevida, empresa/logout após falha sem conteúdo do contexto anterior e funcionárioBruno sem a falha privada deAna. Troca de empresa/logout/coworker foram verificações posteriores à falha, não races antes da conclusão.

`success-transient.png` foi inspecionado e mostra `Confirmando na simulação…`, com captura iniciada112ms e concluída274ms após o início do tap. Não houve prova nativa do estado pending. No BACK, o comando terminou153ms após o início do send e a página da empresa foi fotografada entre211–362ms; o callback interno não foi instrumentado.

O ensaio inicial4096→2048 deixou o compositor fora da árvore/janela. Continua como observação não resolvida de mudança de altura, com PNG/XML preservados; um cold start que funciona não resolve nem explica essa transição. Não há dumpIME retroativo dessa falha. Não atribuir causa conclusiva ao KeyboardAvoidingView ou declarar cobertura de split-screen, rotação ou mudança de fonte durante uso.

O suplemento dirigido em `output/queue-qa/directed-font2-2026-11-06T23-20-23-435Z/` concluiu o caso frio320dp/fontScale2, viewport880×2048/density440, teclado realmente aberto:

- status inteiro em `open-step14` (176px);
- erro de242px acessado em vistas sobrepostas, sem chamá-lo inteiro numa janela de241px;
- retry inteiro em `open-step18` (143px), acionado com IME aberta;
- mesma bolha `message-queued-demo-1-intent-1` confirmada na AX;
- confirmação completa fotografada em `accepted-closed-full-caption` após fechar o teclado. Não houve afirmação de caption accepted inteira com teclado aberto.

O rodapé com controles da demonstração ocupa várias janelas nessa fonte e exige rolagem adicional para alcançar a bolha. Essa configuração é um protótipo em teste, não uma interface final polida. Tentativas incompletas do harness e o aborto de stdin semPTY ficaram preservados; não foram convertidos em passes.

Confirmação perdida e races determinísticas complexas continuam como cobertura unitária. Entrada Unicode pela nova fila não foi repetida nativamente nesta fatia; não confundir os testes anteriores de Unicode nem testes de modelo com esse fluxo nativo. Não foram realizados testes de rede, entrega real, Auth, push ou aparelhos físicos. As configurações originais foram restauradas e o AVD próprio encerrado ao finalizar.

## Reprodução local do suplemento dirigido

Fonte local preservada: `output/queue-qa/directed-font2.mjs`. Executar a partir da raiz do repositório em terminal interativo. Ao usar `exec_command`, definir `tty:true`: stdin em pipes fechou prematuramente num ensaio anterior e esse aborto está registrado, sem ser um resultado do App.

```powershell
node output/queue-qa/directed-font2.mjs --serial emulator-5554 --adb "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
```

O APK liberado deve estar instalado exclusivamente no AVD próprio já identificado. A fonte importa `apps/mobile/scripts/android-queue-smoke.mjs` e reutiliza a referência fechada preservada em `output/queue-qa/directed-font2-2026-11-06T23-17-53-065Z/result.json` / `closed-error-retry.png`. Essa referência é do mesmo candidato, largura320dp, fontScale2 e altura2048px; não é a referência alta4096 do ensaio warm. A reprodução local depende desses artefatos preservados.

O processo prepara uma única mensagem fictícia e imprime `READY`; fica parado entre comandos. Cada `older N` arrasta o dedo para baixo dentro dos bounds atuais da lista, revelando conteúdo anterior; `newer N` arrasta para cima. Cada ação grava um novo PNG/XML e os valores reais de IME/wm/font. Inspecionar cada frame antes da próxima ação; a lista abaixo é o diário observado, não uma macro cega para outras condições de dispositivo.

| Frames | Comandos registrados |
|---|---|
| 1–8 | `older 120`, depois sete vezes `older 130`, observando cada frame |
| 9–13 | `older 120`, `older 130`, `older 120`, `older 130`, `older 100` |
| 14 | `newer 40`: status inteiro176px em[742,918], viewport[694,935] |
| 15–18 | `newer 130`, `newer 130`, `newer 130`, `newer 60` |
| Final | `retry`, somente após status/erro/retry observados; o processo verifica confirmação e restaura configurações em finally |

No frame18 o retry estava inteiro em[183,764]–[793,907], com IME aberta. O ID observado permaneceu `message-queued-demo-1-intent-1`, com estado `delivery-state-queued-demo-1-intent-1` e botão `delivery-retry-queued-demo-1-intent-1`. A confirmação aberta foi uma leitura AX, não uma alegação de caption inteira; o texto completo foi fotografado depois de fechar o teclado. O comando retry foi submetido às23:28:58.339Z; o instante nativo do tap não foi instrumentado individualmente.
