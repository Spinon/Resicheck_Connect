# Integração da navegação na cópia principal

06/11/2026. Patch recebido da frente independente, integrado sem conflitos após conferir manifesto, SHA-256 e baseline do App.tsx. A evidência histórica da frente está em [INTERFACE-NAVEGACAO-0.1](INTERFACE-NAVEGACAO-0.1.md); os resultados abaixo são da cópia principal.

Patch: `a2ff4e20b9d72f21f0116e99cbf13aabf50e6eca42ebb65835780ab3744b9706`, commit de origem `dd90c90bebcd749a8cc08934ae1530e8f4092289`. Quatro arquivos previstos: App.tsx, navigation.ts, navigation.test.ts e relatório da frente; nenhum board da cópia isolada foi importado. Baseline App.tsx `54b2381c…` conferido; fonte integrada `c18727b11b457403af50437d0afe42df6e3005e52d8e91b68868981f341b59f8`.

## Resultado

| Verificação | Resultado observado |
| --- | --- |
| TypeScript | Passou |
| Modelo/navegação local | 17 testes passaram |
| Web exportada/Chrome existente | 20 verificações; zero erros/warnings no console, 360×740/390×844/1280×900 |
| Build Android | Passou em 40 s com toolchain já instalado |
| Assinatura | APK candidato verificado, esquema v2, certificado de desenvolvimento |
| Android 16/API 36, AVD próprio | 10/10 jornadas passaram, zero avisos |

Validados no Android: chat/envio sintéticos e privacidade de prévia; convite direto e pedido sem convite pendente; Perfil retorna à lista de origem; busca sem acento, vazio e limpar; Back na raiz confirma; cancelar e Back dentro do Modal preservam mensagem/rascunho; saída confirmada reinicia mensagem, rascunho e preferências. Capturas foram revisadas; o AVD próprio foi encerrado ao fim sem encerrar outros servidores ADB.

Evidências ignoradas por Git: `output/interface-integration/web/result.json` e capturas; `output/interface-integration/build-android.log`; `output/android-qa/2026-11-06T19-51-01-265Z/result.json`, 11 PNGs e XMLs. O harness reproduzível foi ampliado em `apps/mobile/scripts/android-smoke.mjs`.

## Artefatos separados

O APK entregue no Drive continua byte a byte preservado: SHA-256 `bf6e0a4095ac9e7630589f42e2eeea6d3d39cecf6e36968b877c9286cd11e719`.

Candidato atualizado **somente local**, não publicado ou entregue como nova versão: `output/interface-integration/connect-navigation-candidate.apk`, 42.046.842 bytes, SHA-256 `6552c10b7d663e9b928f4a6ba96c56152a130b5695d6c70dc31f229ec5d55897`. Mantém pacote/versão de demonstração; não é release de produção nem substituição automática do arquivo que o usuário vai testar.

Sem backend integrado, contas reais, push, arquivos/áudio reais ou mudança de permissões. Não há teste em aparelho físico, Android mínimo, iOS, teclado completo, TalkBack ou fonte ampliada; APP-016 permanece em andamento. O requisito novo de emojis/graphemes está registrado em APP-057 e ainda não implementado. Nenhum código novo foi publicado no GitHub e nenhuma migração Supabase foi aplicada durante a integração.
