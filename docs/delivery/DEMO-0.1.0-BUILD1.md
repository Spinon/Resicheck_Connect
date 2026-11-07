# Entrega Android demonstrativa 0.1.0 build 1

06/11/2026. APK autônomo instalado e testado em emulador Android 16/API 36. Somente dados sintéticos; assinatura Android Debug de desenvolvimento. Não é candidato de chat operacional e não encerra APP-006 nem os requisitos de backend.

- [APK privado](https://drive.google.com/file/d/1DY8cWL_2OswEmQXCh1CXw8wP99v1Fwps/view?usp=drivesdk)
- [Instruções](https://drive.google.com/file/d/1as3E4Uu74Szt3tvqmXKaN6KvAWcY9ZYR/view?usp=drivesdk)
- [Manifesto do lote](https://drive.google.com/file/d/1VHSMUTr-cqfPh8owg7LIMnkij7nkE4m_/view?usp=drivesdk)
- [SHA-256](https://drive.google.com/file/d/1vVlm6_4ktpM8WJthPMfSa9iHBxAL44EV/view?usp=drivesdk)
- [Resultado Android nativo](https://drive.google.com/file/d/141xvXa4BAb0G9pIkheQZL3-lEszNs3y2/view?usp=drivesdk)
- Capturas do APK: [chat](https://drive.google.com/file/d/14O3tE2xe0ZoKkNKEjAjvd0drej2-5X__/view?usp=drivesdk), [privacidade](https://drive.google.com/file/d/1XVfOrTdEIM273eLIbpD0EMz0KzLpanp8/view?usp=drivesdk), [equipe por convite](https://drive.google.com/file/d/1-jKvqiWwQ8WLpgWkNyynTued1pYPVzJ9/view?usp=drivesdk).

Arquivo: `resicheck-connect-demo-0.1.0-build1-arm64-x86_64.apk`, 42.044.422 bytes (40,1 MiB). SHA-256 local: `bf6e0a4095ac9e7630589f42e2eeea6d3d39cecf6e36968b877c9286cd11e719`. Upload e tamanho confirmados por leitura do Drive; permissão retornada somente proprietário, sem compartilhamento público. O conector não retornou checksum remoto, portanto não foi possível recalcular/verificar hash no servidor.

Pacote `com.resicheck.connect.demo`, nome instalado **Connect Demo**; Android mínimo declarado 7/API 24, alvo API 36, ARM64 e x86_64. Não inclui ARM de 32 bits. Android mínimo e aparelhos físicos ainda não testados; iOS não compilado. Tamanho e fluidez em celulares modestos continuam pendentes.

Fonte do app: commit público `3790bac53dbc16bf611fb89cc99c114974041fc9`, confirmado em `Spinon/Resicheck_Connect`, branch main. Scripts de QA/build e documentação desta entrega são alterações locais posteriores, ainda não publicados.

## Evidência e limites

TypeScript, 13 testes de modelo, 19 verificações web e cinco jornadas Android passaram. Jornadas nativas: abrir empresa/próprio chat; enviar texto sintético; padrão seguro e nível quatro de prévia de notificações; convite de funcionário com entrada direta; solicitação sem convite pendente e sem conversas. Evidência local: `output/android-qa/2026-11-06T17-27-26-041Z/result.json` e seis capturas/XMLs.

Sem backend, autenticação, CPF/CNPJ verificado, mensagens remotas, push, upload, compressão ou som real. Anexo/áudio são ilustrativos; sair reinicia o estado. Não usar dados reais. Não há agenda, IA ou conectores. Estes testes não comprovam autorização no servidor ou conformidade do produto futuro.

Manifesto empacotado verificado sem INTERNET, microfone ou acesso amplo a arquivos; backup desativado. Assinatura v2 verificada. Auditoria npm: quatro alertas moderados, zero altos/críticos; remediação compatível pendente. Relatório em `docs/testing/PROTOTIPO-0.1.0.md`.

## Reprodução

Toolchain oficial preparado com autorização: JDK 17.0.19, Gradle 9.3.1, NDK 27.1.12297006 e CMake 3.30.5. Após `npm ci` e `npm run prebuild:android` em `apps/mobile`, executar `./scripts/build-android.ps1`. A propriedade `-Pandroid.cmakeVersion=3.30.5` resolve a falha Ninja observada com CMake 3.22.1 neste caminho Windows; não houve alteração de registro, política ou encurtamento artificial de caminhos. APK contém bundle Hermes embutido e abre sem Expo Go/Metro.
