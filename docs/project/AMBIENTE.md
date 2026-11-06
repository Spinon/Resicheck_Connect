# Ambiente observado — 06/11/2026

Registro histórico anterior à implementação. Na fatia seguinte foram instaladas dependências locais Expo/React Native em `apps/mobile` e gerados fontes/bundles, sem alterar o SDK nem usar ADB. O estado atualizado e as autorizações pendentes estão em [PROTOTIPO-0.1.0.md](../testing/PROTOTIPO-0.1.0.md).

Inspeção de leitura no Windows; nenhum software instalado e nenhum termo aceito.

| Item | Resultado observado |
| --- | --- |
| Node | v24.15.0 |
| npm | 11.12.1 |
| Java/Javac | Microsoft OpenJDK 17.0.19 |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk`; ANDROID_HOME e ANDROID_SDK_ROOT apontam para ele |
| SDK Platform | android-36 |
| Build Tools | 36.0.0 |
| ADB | Executável encontrado em platform-tools; execução bloqueada conforme abaixo |
| Emulador | emulator.exe presente; inicialização não testada |
| Imagens | Android 36, Google APIs x86_64 e Google APIs Play Store x86_64 encontradas |
| Git | Executável encontrado; estado do ResiCheck não pôde ser lido |
| Flutter/Dart/Gradle/Maestro | Não encontrados no PATH; isso não prova ausência fora dele |
| iOS | Build e simulator não validados; Windows não fornece o ambiente Apple local |

## Bloqueios observados

- `adb devices -l`: falhou antes de listar dispositivos: `Cannot mkdir '%USERPROFILE%\.android': Permission denied`. A chamada não demonstra emulador nem celular conectado. Não foi repetida nem alterada a configuração global. Para a etapa Android, usar um diretório de configuração autorizado ou obter acesso apropriado e então verificar emulador/dispositivo; nenhuma dessas ações foi executada aqui.
- `git -C %USERPROFILE%\Documents\Resicheck status --short`: `Permission denied`. Leitura de AGENTS.md, STATUS.md, parte do board e nomes de scripts foi possível; estado Git não foi confirmado. Nenhum arquivo do projeto existente foi modificado por esta tarefa.

Essas foram falhas de permissão do ambiente. Não houve solicitação de escalonamento nem rejeição explícita do revisor automático de aprovação.

## Padrões observados no ResiCheck

Rechecagem de leitura nesta data: pasta mobile continua apenas com README, sem node_modules/lockfile; executáveis ADB/emulador e cmdline-tools `latest` presentes. Nenhuma instalação ou nova tentativa ADB foi feita. A análise de protótipo e compatibilidade está em [PROTOTIPO-E-DESEMPENHO.md](PROTOTIPO-E-DESEMPENHO.md).

Fila canônica `project-board.json`, status derivado em `docs/project/STATUS.md`, critérios/evidências por fatia e validação proporcional ao risco. O projeto novo adota somente essa organização em versão pequena. A agenda e os demais módulos do ResiCheck não foram reutilizados. As instruções locais do ResiCheck foram lidas como referência do projeto existente, sem importar para o projeto novo regras clínicas, releases ou exigência de push.
