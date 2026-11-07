# Emojis nas mensagens

Requisito solicitado por responsável pelo projeto em 06/11/2026. Emojis fazem parte do texto do chat, com entrada pelo teclado do sistema. Não implica implementar reações, figurinhas, GIFs ou um seletor próprio.

## Comportamento e aceite

- Aceitar Unicode válido completo em mensagem, incluindo emojis compostos com ZWJ, modificadores de tom de pele, bandeiras, seletores de apresentação e marcas combinantes. Preservar o conteúdo original; não remover partes de uma sequência para validá-la ou salvá-la.
- Medir o limite percebido de texto por **grapheme clusters**; contador, validação, colagem, edição e eventual prévia não podem cortar uma sequência. Limites técnicos de bytes/payload continuam separados, explícitos e com erro seguro; não transformá-los silenciosamente em corte do texto.
- Usar o teclado do sistema Android e, futuramente, iOS. Validar composição/colagem e cursor/backspace reais, sem substituir o teclado ou pedir permissões extras.
- Renderizar e persistir a mensagem de forma íntegra em app, API, banco e retorno ao cliente. Não interpretar texto como HTML/comando. Quando uma fonte/versão do sistema não tiver o desenho, preservar os caracteres; não prometer aparência idêntica entre fabricantes/sistemas.
- Garantir leitura e navegação acessíveis com TalkBack/VoiceOver, fonte ampliada, ordem do texto e contraste. Não inventar transcrição clínica ou significado que o usuário não escreveu; testar os nomes falados pelo leitor do sistema.
- Separar teste de autorização do teste de renderização: emoji não amplia acesso, não mistura conversa e não transporta dados escondidos em logs ou campos de notificação abaixo do nível permitido.

## Casos sintéticos necessários

| Caso | Evidência esperada |
| --- | --- |
| Texto misto e emoji astral simples | Mesmo texto antes/depois de envio, leitura e novo login |
| Tom de pele e gesto composto | Cursor, apagar, colar e limite não separam modificadores |
| Família/profissão com ZWJ | Sequência permanece completa na entrada, payload, banco e retorno |
| Bandeiras e seletores de apresentação | Pares/seletores não são cortados em contador, colagem ou prévia |
| Acento combinante e acento pré-composto | Integridade preservada, sem normalização destrutiva ou deduplicação acidental |
| Exatamente no limite e acima | Conta por grapheme; rejeita excesso com mensagem clara sem regravar/truncar conteúdo |
| Rede/retry/contexto | Reenvio não duplica nem altera corpo; contexto de empresa/conversa continua correto |
| UTF-8 inválido ou surrogate isolado | Entrada inválida rejeitada de modo seguro, sem substituir silenciosamente a mensagem válida |
| Android antigo/atual, teclado e leitor de tela | Registro por aparelho/OS/fonte; distinguir Unicode preservado de desenho disponível |

## Estado atual

**Implementação local em andamento; requisito completo ainda não concluído.** App e domínio local de chat usam `packages/text`: Unicode17 com unicode-segmenter0.17.3, 2.000 graphemes e orçamento independente de 64 KiB UTF-8. O composer não corta por maxLength UTF-16; mantém o excesso editável, mostra contador/erro seguro e bloqueia envio. Corpo original, espaços e NFC/NFD são preservados. Emojis entram pelo teclado do sistema, sem seletor próprio nem novas permissões. Texto é renderizado literalmente e disponibilizado à acessibilidade com seu conteúdo original.

Passaram os 766 casos oficiais de segmentação Unicode17, testes locais de limites/Unicode inválido, persistência sintética em arquivo UTF-8, retry, isolamento e roundtrip HTTP local com decodificação estrita. A validação web e Android tem evidência própria em `docs/testing/EMOJIS-0.1.md`; não representa roundtrip Supabase ou confirmação de identidade.

A fundação Supabase **já foi aplicada online**; seu SQL continua usando char_length2.000. Não foi alterada nesta fatia. Antes da integração real, alinhar o validador confiável de entrada com os comandos/políticas do banco em migração revisada: não confiar em contagem enviada pelo cliente nem relaxar o SQL isoladamente. Login positivo/Auth Admin continua bloqueado. Gboard com emoji simples e colagem composta já foram verificados; TalkBack/VoiceOver, composição/cursor/backspace dos casos complexos e aparelhos antigos precisam de evidência específica. A divergência de entrada sob rajada está em APP-060. APP-057 permanece in_progress até os critérios restantes demonstrarem o aceite.

O lote2 anterior continua preservado e não inclui esta implementação. A **entrega0.1.1** passou a incluir os emojis locais junto à correção de áudio, com evidência/limites em `docs/delivery/DEMO-0.1.1-BUILD2.md`. Isso não conclui a integração com backend, aparelhos antigos ou TalkBack.
