# Seleção após redimensionamento: diagnóstico local

Executado em 2026-11-07, exclusivamente com texto fictício. O colapso da seleção foi reproduzido num `EditText` Android sem React Native, dentro da mesma Activity e da mesma instância do campo. A stack localiza o evento no encerramento do modo de seleção durante `TextView.onConfigurationChanged`. Isso demonstra um caminho da plataforma nesse ambiente; não prova comportamento universal nem a stack exata do APK React Native sem instrumentação.

Nenhum App, APK entregue, dependência instalada ou configuração de segurança foi alterado. Foi compilado e instalado somente um pacote diagnóstico isolado, expressamente autorizado, usando SDK/JDK existentes e nenhuma permissão Android. Sem workaround, patch em `node_modules`, acesso a clipboard, TalkBack ou dados reais.

## Ambiente e artefatos

- AVD próprio `Connect_Demo_API36`, `emulator-5554`, Android 16/API 36, x86_64. Gboard `15.1.08.726012951-preload-x86_64`. Detalhes e fingerprint em `output/selection-causal/environment.json`.
- Ensaios com largura 1080 px, densidade 440, fonte 1 e alturas 2048↔4096, teclado aberto. Essas mudanças artificiais de WM não equivalem a todos os modos de janela ou aparelhos.
- APK entregue intacto: 0.1.3/code7, pacote `com.resicheck.connect.demo`, SHA-256 `528fa066c449080e13104ef2812685ba9fd05566b0ccbe2a7acf23bce5220ee9`. Não foi recompilado a partir do App atual, que avançou independentemente.
- Fixture: `tools/android-selection-probe/`, pacote `com.resicheck.connect.selectionprobe`, versão 1 diagnóstica. APK `output/selection-causal/build-20261106-212415-619/selection-probe.apk`, SHA-256 `6e0596b2e3b0e38f1abb8c8a825825b984255c449fa49e502e0149f4325559df`. Recibo de compilação ao lado; assinatura debug existente e manifest sem `uses-permission`.
- Fontes, scripts, dependência React Native 0.86.3 e resultados têm hashes em `output/selection-causal/summary.json`.

O controle antigo de entrada de texto não declarava os mesmos `configChanges` do App. A fixture nova tem duas Activities: uma com os flags equivalentes ao App e outra sem esses flags. Ambas usam um ID estável para o campo, permitindo a restauração normal de estado do Android. Logs registram apenas índices, comprimentos, identidades, callbacks e stack; não registram o texto. Não há atualização de tela a cada evento instrumentado.

## Protocolo e resultados

Reprodutor: `apps/mobile/scripts/android-selection-causal.mjs`. Exige serial de emulador explícito, AVD exato, pacote dentre os dois permitidos e SHA-256 do APK instalado. Usa XML novo a cada observação, PNG binário, bounds observados e guard de foco. A seleção nativa precisa estar em 0..12 antes do ensaio; se não estiver, aborta sem produzir conclusão sobre resize.

Cada alvo teve um controle sem resize e uma rota 2048→4096→2048. Ambos digitam `SYNTHETIC123`, selecionam a palavra por longpress, fazem as mesmas observações intermediárias e pressionam DEL. Antes de DEL, valor completo, foco e IME aberto são exigidos. Os logs nativos são lidos apenas do PID da própria fixture, sem limpar buffers de outros processos.

| Alvo | Sem resize | Após resize | Instâncias observadas na rota com resize |
| --- | --- | --- | --- |
| EditText/configChanges | Índices 0..12 mantidos; DEL esvazia | Índices 12..12; DEL deixa `SYNTHETIC12` | Mesma Activity e mesmo input; dois callbacks de configuração |
| Activity sem flags explícitos | Índices 0..12 mantidos; DEL esvazia | Índices 12..12; DEL deixa `SYNTHETIC12` | Também não houve recriação observada; não constitui contraste efetivo de recriação |
| RN no APK entregue | DEL esvazia | DEL deixa `SYNTHETIC12` | Campo/foco/rascunho acessíveis; índices internos não instrumentados no APK |

Resultados completos, oito frames por par:

- `output/selection-causal/run-2026-11-07T00-29-34-254Z/result.json`: EditText com flags equivalentes.
- `output/selection-causal/run-2026-11-07T00-31-39-217Z/result.json`: Activity sem flags explícitos.
- `output/selection-causal/run-2026-11-07T00-33-19-915Z/result.json`: APK RN entregue.

Todos concluíram como diagnóstico, com configuração restaurada. Isso não significa que preservação da seleção passou. A tentativa inicial `run-2026-11-07T00-27-31-959Z` permanece `diagnostic-incomplete`: o longpress no centro de um campo largo caiu à direita da palavra e manteve 12..12. O guard interrompeu antes de resize/DEL. A captura orientou o gesto para dentro da palavra; depois os índices 0..12 foram confirmados. Não houve remoção do guard nem alteração da fixture para forçar seleção.

## Caminho observado e relação com RN

No EditText/configChanges, a transição 0..12→12..12 aconteceu antes de DEL, mantendo comprimento 12 e foco. A stack em `resized-after-resize-native.json` contém:

```text
TextView.onConfigurationChanged
  → TextView.nullLayouts
  → Editor.prepareCursorControllers
  → Editor.stopTextActionMode
  → TextActionModeCallback.onDestroyActionMode
  → Selection.setSelection
```

Esse caminho não envolve React Native. O código público do [Editor no AOSP](https://android.googlesource.com/platform/frameworks/base/+/master/core/java/android/widget/Editor.java) também mostra a redução ao fim da seleção quando o modo termina sem a opção interna de preservação. A branch consultada é contexto do mecanismo; não se afirma que seu commit seja idêntico ao binário do AVD.

Na dependência local 0.86.3, `ReactEditText.kt` chama `super.onConfigurationChanged` antes de reaplicar atributos. O hook de sincronização de `TextInput.js` trata mudanças de valor e seleção controlada. O `TextInput` do APK entregue não fornece uma prop `selection`. A rota herdada da plataforma é, portanto, compatível com o comportamento visto no App, mas isso é inferência: não foi capturada stack interna do RN nesse APK release. Os arquivos locais consultados e seus hashes constam do resumo.

Não foi demonstrado que recriação seja necessária; o controle principal prova o contrário. A Activity sem flags também não recriou nesse ciclo do AVD, e o motivo não foi investigado nesta fatia. Não atribuir o evento a Gboard, cache de altura ou à fila de mensagens sem nova evidência.

## Limites e encerramento

Este evento é distinto do compositor `height` que ficava fora da tela: aqui o rascunho permanece e o DEL revela que somente a seleção colapsou. A correção de posição/padding do APK entregue não foi revertida. Nenhum workaround de seleção foi aplicado; restaurar índices automaticamente exigiria validação própria contra edições, composição e ações posteriores do usuário.

Não foram testados outros IMEs, aparelhos físicos, Android antigo, seleção Unicode parcial, TalkBack, rotação ou split-screen reais. A fixture instrumenta dois métodos de InputConnection e eventos de view; não é um perfil completo de todos os eventos do IME nem benchmark de desempenho. Os controles têm layout próprio, e a stack RN exata continua sem instrumentação.

Cleanup em `output/selection-causal/cleanup.json`: tamanho físico 1080×2280 sem override, densidade 440 sem override e fonte `1.0` restaurados por igualdade exata; hashes instalados do APK entregue e fixture conferidos; AVD próprio encerrado com confirmação e serial ausente. A fixture permanece instalada somente nesse AVD, sem permissões ou dados reais. Nenhum upload, publicação Git ou teste do candidato 0.1.4 ocorreu nesta investigação.
