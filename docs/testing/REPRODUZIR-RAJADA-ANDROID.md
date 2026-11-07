# Diagnóstico de entrada sob rajada — APP-060

Este controle compara 2.000 caracteres ASCII sintéticos no APK Connect final `3eb80a05…` e numa Activity Android com EditText. Não modifica o App, o APK entregue, as configurações do teclado ou dados persistentes do Connect.

## Arquivos

- `tools/android-input-probe/MainActivity.java`: Activity independente; contadores de TextWatcher e tecla A em onKeyPreIme, Activity.dispatchKeyEvent e EditText.onKeyDown/onKeyUp. Todos preservam o retorno de `super`. A versão 2 só renderiza as estatísticas ao tocar no botão de leitura.
- `tools/android-input-probe/AndroidManifest.xml`: pacote `com.resicheck.connect.inputprobe`, versão diagnóstica 2, sem permissões, serviços, rede ou persistência.
- `tools/android-input-probe/build.ps1`: compila com JDK/SDK já instalados, sem Gradle ou downloads; usa a chave Android Debug existente e cria uma pasta nova em `output/input-burst/`.
- `apps/mobile/scripts/android-input-diagnostic.mjs`: exige serial explícito, qemu=1 e AVD exato `Connect_Demo_API36`; restringe interação aos dois pacotes sintéticos. Restaura wm/font em finally e não usa `pm clear`, desinstalação ou reinício do servidor ADB.

## Reprodução local

Requer Android SDK36/build-tools36.0.0, JDK17 e o AVD próprio já autorizados. O script de build não instala ferramentas nem inicia dispositivos.

```powershell
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME = 'C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot'
& ./tools/android-input-probe/build.ps1
```

Com o AVD próprio iniciado, confirme `adb -s emulator-5554 shell getprop ro.kernel.qemu` = `1` e `adb -s emulator-5554 emu avd name` = `Connect_Demo_API36`. Instale somente o `input-probe.apk` recém-compilado nesse serial. O Connect final deve estar instalado com hash `3eb80a054208dc970314611b63b4b6d4232b3b2b0e910e8a40bab1c9e093e948`; o harness confere o APK realmente instalado.

```powershell
$env:BURST_PHASE = 'extended'
node apps/mobile/scripts/android-input-diagnostic.mjs --serial emulator-5554 --adb "$env:ANDROID_HOME\platform-tools\adb.exe"
```

Sem `BURST_PHASE=extended`, executa uma rajada em cada rota. A fase extended compara rajada e blocos de 50 com pausas de 100ms nas duas rotas. Cada comando registra exitCode e duração. O controle `shell printf` confirma que o argumento transportado contém os 2.000 caracteres completos.

As três releituras solicitadas após o comando têm offsets de 0/1/3s, mas UIAutomator aguarda idle e demora para produzir XML. Os tempos efetivos de início e conclusão estão no JSON; não são amostragens instantâneas nesses três instantes. A versão nativa também usa o botão de leitura antes de cada XML.

## Interpretação e limites

Preservar o JSON, XML e PNG de cada ensaio. Uma falha de seletor, guard ou timeout do harness não é uma falha do produto. O status `diagnostic-completed` indica coleta concluída; divergências de comprimento permanecem achados, não testes aprovados.

O primeiro ensaio válido reproduziu 1.110/2.000 no Connect e 1.517/2.000 no EditText sem React Native. Ambos permaneceram estáveis nas três releituras. A versão 1 do controle atualizava um TextView a cada edição; a versão 2 retira essa carga e acrescenta contadores, portanto as duas versões não são controles idênticos.

Contagens anteriores à IME, posteriores à IME e de alterações de texto não são equivalentes: um teclado pode consumir KeyEvents e inserir texto por InputConnection. Não inferir causa específica em ADB, Gboard, React Native ou no store sem evidência adicional. Este ensaio não cobre digitação humana, TalkBack, aparelhos físicos ou todas as implementações de IME.

Evidência inicial: `output/input-burst/run-2026-11-06T22-29-32-243Z/result.json`. As execuções que falharam apenas no harness também permanecem em `output/input-burst/`.
