# ResiCheck Connect — demonstração 0.1.0

Base Expo 57.0.32, React Native 0.86.3, React 19.2.3 e TypeScript 6, com lockfile. A versão foi verificada no registro oficial e usa SDK de compilação Android 36/minSdk 24 no catálogo de dependências, ainda sem comprovação em dispositivo.

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

A configuração da demonstração solicita remoção de INTERNET, microfone, acesso amplo a arquivos, overlay e vibração e desabilita backup. É necessário verificar o manifesto mesclado do APK quando compilado; isso ainda não foi feito. O áudio atual é só visual e a reprodução não contém som. A futura implementação real exige permissão contextual e arquivos privados, conforme o backlog.

## Validação e bloqueio nativo

Typecheck, 13 testes de modelo, geração nativa e bundle Android passaram. Uma prévia React Native Web foi exercitada com Playwright/Chrome já instalados; isso não comprova funcionamento Android. Ver [relatório](../../docs/testing/PROTOTIPO-0.1.0.md).

APK ainda não gerado: falta preparação autorizada do Gradle 9.3.1, NDK 27.1.12297006 e CMake 3.30.5, e configuração ADB do perfil. Não executar instalação de componentes nem aceitar termos sem a autorização aplicável. Não foi repetido o ADB negado nem redirecionado ANDROID_USER_HOME. Depois da autorização, compilar release de teste com bundle embutido, conferir assinatura de teste/manifesto e instalar no Android autorizado antes de chamar a fatia concluída.
