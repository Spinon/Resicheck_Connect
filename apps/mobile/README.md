# ResiCheck Connect — demonstração Android

A entrega atual é0.1.3/code7, com fila de texto simulada, controles em modal e ajuste de teclado; [APK e limites](../../docs/delivery/DEMO-0.1.3-BUILD7.md). A fonte posterior corrige capacidade da fila e acessibilidade de outros modais, ainda sem novo APK distribuído. Auth, transporte remoto, áudio e arquivos reais continuam pendentes. [Checkpoint atual](../../docs/project/CHECKPOINT-2026-11-07.md). O histórico0.1.2 está preservado em [FILA-INTERFACE-0.1.2.md](../../docs/testing/FILA-INTERFACE-0.1.2.md).

Base Expo 57.0.32, React Native 0.86.3, React 19.2.3 e TypeScript 6, com lockfile. A versão foi verificada no registro oficial e usa SDK de compilação Android 36/minSdk 24 no catálogo de dependências, validada somente em emulador Android 16.

Implementado como demonstração local: entrada/cadastro fictício, seleção e vínculo imediato de empresa para paciente, entrada direta por convite fictício do gestor e pedido de funcionário sem convite pendente, visão da equipe aprovada, chat em memória, marcação de importância, anexo e áudio ilustrativos, quatro níveis de prévia de notificação. Verde padrão e ícone original ResiCheck autorizado. Não cria contas, consulta CPF/CNPJ, autentica, grava áudio, acessa arquivos pessoais, manda push ou conversa com um servidor. Sair reinicia os dados. A interface identifica a demonstração.

## Comandos

Após instalar as dependências de projeto autorizadas com `npm ci` nesta pasta:

```powershell
npm run typecheck
npm test
npm run prebuild:android
npm run export:android
```

`export:android` gera bundle Hermes, **não APK**. `prebuild:android` gera código nativo descartável em `android/` ignorado por Git. Não guardar mudanças manuais importantes nessa pasta; configuração canônica está em app.json. O wrapper desabilita telemetria Expo sem criar conta nem redirecionar o perfil Android. Prebuild pode precisar baixar o template oficial; exportações locais trabalham offline.

A configuração da demonstração solicita remoção de INTERNET, microfone, acesso amplo a arquivos, overlay e vibração e desabilita backup. O manifesto do APK final foi verificado: sem INTERNET, microfone ou acesso amplo a arquivos; backup desabilitado. O áudio atual é só visual e a reprodução não contém som. A futura implementação real exige permissão contextual e arquivos privados, conforme o backlog.

## Validação nativa

Na primeira entrega: typecheck, 13 testes de modelo, 19 verificações web e cinco jornadas no emulador Android 16 passaram. APK autônomo, sem Expo Go ou Metro, com assinatura Android Debug para teste. [Relatório inicial](../../docs/testing/PROTOTIPO-0.1.0.md) e [entrega privada preservada](../../docs/delivery/DEMO-0.1.0-BUILD1.md).

A cópia local posterior já integra sessão/contexto e política de acesso na interface fictícia: 24 testes do app e 27 verificações web. Não autentica em serviço real. Estado da validação Android e novo candidato local em [sessão e acesso na interface](../../docs/testing/SESSAO-E-ACESSO-NA-INTERFACE.md). O Metro inclui a pasta packages explicitamente, mantendo as instalações npm por prefixo.

A entrega histórica0.1.1/code2 acrescenta emojis e corrige o cartão de áudio:26 testes do app,8 de texto/766 casos Unicode,26 de chat,37 regressões web e32 configurações web/64 balões. A matriz nativa e os retestes de fonte200% distinguem geometria integral de acesso por rolagem: [relatório](../../docs/testing/AUDIO-LAYOUT-0.1.1.md) e [APK/limites](../../docs/delivery/DEMO-0.1.1-BUILD2.md). `node scripts/android-audio-layout.mjs` exige o AVD Connect_Demo_API36 próprio instalado; altera tela/fonte somente nele e restaura o estado original. O modo `AUDIO_FINAL_DELTA=1` executa os retestes dirigidos. Não usar em aparelho físico.

Após prebuild e preparação oficial autorizada do SDK, executar `./scripts/build-android.ps1`. O script fixa CMake 3.30.5 por propriedade Expo/Gradle; o padrão 3.22.1 causou falha Ninja neste caminho Windows. Não altera registro ou políticas do sistema. O APK padrão contém ARM64 e x86_64, não ARM de 32 bits.

O harness `node scripts/android-smoke.mjs --serial emulator-5554` exige um emulador com o pacote já instalado. Consulte o cabeçalho do script para opções/evidências. Não instala componentes nem testa dispositivos físicos.

Entrega atual: [0.1.3/code7](../../docs/delivery/DEMO-0.1.3-BUILD7.md). Opções em modal e ajuste Android padding, sem reduzir fonte. Cobertura dirigida nativa e limites de seleção após resize em [ergonomia/teclado](../../docs/testing/ERGONOMIA-E-TECLADO-0.1.3.md). Continua memória sintética sem Auth/backend real.

Fonte posterior à entrega: modais de áudio/anexo/saída têm corpo rolável, nome acessível e foco contínuo no áudio; passaram10 cenários web, com Android/TalkBack ainda pendentes. A fila já permite mais de100 envios aceitos sem perder pendências: [correção e testes](../../docs/testing/FILA-CAPACIDADE-0.1.md). O candidato local0.1.4/code8 foi compilado antes dessa correção e está superado para distribuição; não foi instalado nem enviado ao Drive. O próximo build precisa de código novo e validação nativa própria.
