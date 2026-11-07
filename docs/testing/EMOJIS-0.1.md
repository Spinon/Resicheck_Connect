# Emojis e texto Unicode — fatia local APP-057

06/11/2026. Implementado na demonstração e no domínio local de chat, com dados exclusivamente fictícios. Não houve conexão Auth, migração online, conta, credencial nova ou publicação de código. O lote2 enviado ao Drive permanece o candidato de sessão anterior; o candidato de emoji é um artefato separado.

## O que mudou

`packages/text` compartilha análise de mensagem entre app e chat: até2.000 extended grapheme clusters, orçamento independente de64 KiB UTF-8, validação de surrogates e controles. Não depende do Intl/TextEncoder do telefone, não aplica normalização NFC/NFD, não remove espaços do corpo e não corta sequências. Implementação de Unicode17/UAX29 via unicode-segmenter0.17.3, versão fixa com lockfile e sem dependências transitivas. [Fonte da biblioteca](https://github.com/cometkim/unicode-segmenter).

O composer removeu maxLength UTF-16. Mantém texto acima do limite editável, apresenta contador/erro seguro e desabilita envio. A mensagem enviada usa o corpo original; anexo/áudio continuam fictícios. O texto das bolhas é selecionável e possui rótulo acessível original, sem inventar nomes ou significados dos emojis. Teclado do sistema é preservado, sem seletor próprio ou permissões novas. [TextInput do React Native](https://reactnative.dev/docs/textinput).

Prévia local de notificação usa graphemes e os quatro níveis anteriores; não inclui mensagem abaixo do nível4. Orçamento de3.072 bytes sobre o payload efetivamente selecionado; excesso suprime a prévia sem cortar clusters ou embutir texto oculto. É parâmetro local de engenharia, sem provedor push ativo.

## Evidências verificadas

| Verificação | Resultado |
| --- | --- |
| Tipagem | Text, mobile e chat passaram em modo estrito |
| Texto | 8 testes passaram, incluindo limites completos, byte budget, surrogates/controles e mensagens públicas fixas |
| Conformidade | 766/766 casos oficiais Unicode17 passaram: fronteiras, contagem e reconstrução exata; fixture/proveniência/hash/licença em packages/text/tests/fixtures |
| App | 26 testes passaram: envio original, excesso editável, bloqueio seguro e isolamento de empresa além das regressões de sessão/navegação |
| Chat/prévia | 26 testes passaram: idempotência, autoria, acesso, Unicode e payloads privados; teste HTTP em loopback executado com permissão adequada após EACCES do sandbox |
| Persistência sintética | Estado de fixture gravado/reaberto em arquivo UTF-8 temporário; mensagem/ID preservados, retry não duplica, outro paciente não acessa; arquivo removido ao terminar |
| Transporte local | HTTP de teste mantém2.000 emojis compostos íntegros e rejeita UTF-8 sobrelongo, surrogate codificado, ponto fora do Unicode, sequência incompleta e byteFF com erro fixo. TextDecoder fatal evita substituir silenciosamente bytes por U+FFFD; envelope limitado a256 KiB |
| Web | 37 verificações passaram, erros0/warnings0/requisições externas0; counter de sequências compostas, backspace de tom de pele no Chromium, limite2.000/2.001 sem corte, byte budget, rótulos acessíveis, texto literal e regressões de contexto/logout |
| Android | Build e12 jornadas anteriores passaram; a execução completa permaneceu falha na rajada2.000→1.130. Probe dirigido separado passou: colagem Unicode exata45clusters, seleção real😀no Gboard46clusters, envio local e limite pausado2.000→2.001→2.000. Não há alegação de13/13 ou de estresse aprovado |

Os testes oficiais incluem controles e testam segmentação diretamente, separada da política de aceitação de mensagens. Não usar apenas exemplos produzidos pelo próprio código como prova de conformidade. Suite oficial: [Unicode17 GraphemeBreakTest](https://www.unicode.org/Public/17.0.0/ucd/auxiliary/GraphemeBreakTest.txt). Decodificação fatal documentada em [Node TextDecoder](https://nodejs.org/docs/latest-v24.x/api/util.html#new-textdecoderencoding-options).

Na revisão independente, a busca de texto com newline no JSON da auditoria foi corrigida para comparar a versão serializada e validar a lista de campos permitidos. Código inspecionado guarda somente metadados; a evidência não depende de uma comparação que falharia por escapes do JSON.

## Artefato Android separado

`output/emoji-integration/connect-emoji-candidate.apk`, **42.067.968 bytes**, SHA-256 **1edd4a91b7b78ea7ae21cdb9a73b753e818e7d8b57bc7570439610baa07d0766**. Build em34 segundos, sem instalar módulo nativo novo. Crescimento de13.630 bytes frente ao candidato de sessão; não é medição isolada da biblioteca ou de memória/fluidez.

O build canônico inclui os avisos MIT e Unicode V3 em assets/third-party, e os bytes dentro do APK foram comparados aos arquivos versionados. Não inclui fixtures da suíte Unicode no APK. Artefato, hashes dos fontes, licença e manifesto em `output/emoji-integration/build-summary.json` e arquivos associados. APKs anteriores preservados. Nenhuma entrega Drive deste candidato foi feita nesta fatia.

Web: `output/emoji-integration/web/result.json`, screenshot emoji-bubble.png e script web-check.mjs. A verificação usa Chromium/Playwright já instalados e assets locais interceptados; não abre o painel Auth ou rede externa. Tipagem/testes: `npm run text:typecheck`, `text:test`, `mobile:typecheck`, `mobile:test`, `chat:typecheck`, `chat:test` após obter dependências autorizadas.

## Limites e aceite restante

O app permanece em memória; o teste de arquivo não adiciona persistência ao APK. Sessões do teste HTTP são fixtures, não autenticação. Nenhuma evidência aqui demonstra login positivo ou segurança Supabase entre contas reais.

A migração online aplicada continua com char_length2.000. Precisa de alinhamento em nova migração e fronteira confiável de validação antes de habilitar este contrato online; não confiar em contagem enviada pelo cliente nem afrouxar SQL isoladamente. O histórico aplicado não foi editado.

Gboard real e colagem de ZWJ/tom/bandeira foram verificados no probe dirigido. TalkBack/VoiceOver, composição/cursor/backspace dos casos complexos, limite nativo não ASCII64KiB e versões antigas/aparelhos físicos ainda exigem evidência específica. Rótulo na árvore de acessibilidade não comprova pronúncia correta. Renderização depende da fonte/OS: bandeiras ou emojis novos podem aparecer como letras/glifos separados, preservando o conteúdo. APP-057 continua in_progress até os critérios restantes serem validados; não são reações, figurinhas ou transcrição.

Primeira execução nativa preservada em `output/android-qa/2026-11-06T21-10-06-203Z`:12 jornadas passaram, incluindo as11 regressões e Unicode exato das fixtures na árvore acessível. Na injeção de2.000 teclas ASCII em uma única chamada ADB, o campo real terminou com1.130 caracteres e o contador mostrou1.130. Não era contador fora da tela ou divergência do texto. Lotes e colagem observados passaram depois, com resultados em `output/emoji-integration/native-targeted-result.json`; um helper que ignorava botões desabilitados foi corrigido, sem mudar o app. Falhas anteriores estão preservadas. Causa da rajada segue aberta em APP-060 e `docs/testing/ENTRADA-SOB-RAJADA.md`. Nenhum APK foi alterado para esconder esse resultado.
