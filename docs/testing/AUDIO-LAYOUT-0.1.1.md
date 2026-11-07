# Correção do balão de áudio — demonstração 0.1.1

Solicitação de responsável pelo projeto após teste do lote2 em 06/11/2026: autor/título e descrição/horário se sobrepunham em um cartão estreito. Correção local autorizada, sem reduzir fontes arbitrariamente ou apresentar gravação/reprodução reais.

## Inspeção e reprodução

A captura enviada foi localizada na Library, com metadados JPEG926×2048/217.651 bytes. A materialização pelo helper oficial falhou porque `os.setxattr` não existe no Python Windows instalado; não foi alterado o helper nem contornado o armazenamento de identidade. O destino final permaneceu sem imagem. Leitura direta retornou descrição/metadados e ponteiro de imagem, sem pixels utilizáveis nesta execução. Portanto, não houve comparação de pixels com o arquivo original; o prosseguimento pela descrição estava explicitamente autorizado. Nenhuma cópia da captura do usuário foi publicada.

O defeito foi então reproduzido e inspecionado em **capturas nativas próprias**, usando dados fictícios e o componente antigo: `output/audio-layout/baseline-2026-11-06T21-32-37-720Z/01-baseline-audio-keyboard-closed.png` e `02-baseline-audio-keyboard-open.png`. Autor invadia o título e o horário invadia a descrição, com teclado aberto e fechado. Este baseline é do candidato0.1.0 anterior à correção, separado dos APKs entregues.

## Alteração

- Balões de mídia têm largura88%, limitada a360dp, mínimo0; não dependem mais de um cartão estreito calculado pelo conteúdo. Cartão interno ocupa100% e a coluna flexível aceita quebra de linha.
- Autor/cabeçalho, cartão de áudio e rodapé são irmãos verticais separados, sem altura fixa ou truncamento. Título e duração/descrição ficam em textos separados; fontes anteriores foram mantidas.
- O botão mantém o rótulo de prévia fictícia e informa duração fictícia/ausência de som por hint acessível. Ícone decorativo não duplica a leitura. O mesmo limite de largura corrige a estrutura de cartão de anexo, sem implementar arquivo/upload.
- A primeira matriz web descobriu outro problema de espaço com fonte200% e janela curta: resumo fixo da equipe e controles auxiliares podiam zerar a área da conversa. Resumo foi para ListHeader; resposta simulada/estado do rascunho para ListFooter. Informações continuam disponíveis na área rolável, e o composer/contador continuam fixos. Não houve redução de fonte nem remoção de informação.
- Versão canônica atualizada para **0.1.1 / versionCode2**, com prebuild offline e sem nova dependência nativa. Reutiliza a assinatura de teste anterior. Nenhum APK entregue foi substituído.

## Verificação até o momento

Typecheck e26 testes do app passaram. Na exportação final, revisão independente mediu **32 combinações e64 balões**: larguras320/360/393/480; alturas844/480; escalas de texto CSS1/1,3/1,6/2. Inclui nome fictício longo, áudio recebido/esquerda e enviado/direita.

Cabeçalho/cartão/título/descrição/horário ficaram contidos e sem sobreposição/corte de glifos; não houve overflow horizontal ou erro/warning/requisição externa. A área da lista permaneceu positiva em32/32 casos: mínimo163px, contra0px antes do ajuste rolável. CSS altera métricas de fonte/linha, não apenas deviceScaleFactor ou transform. É evidência web complementar; não equivale a fontScale ou teclado Android.

Relatório/script/medições e31 screenshots próprios: `output/audio-layout/web/REVIEW.md`, `result.json` e `check.mjs`. Antes da correção da área rolável está em `before-viewport-fix`. Imagens expanded-inspection usam altura1600 para mostrar balões inteiros; não devem ser apresentadas como viewport844. Inspeção estática e imagens do baseline confirmaram o problema e a separação dos blocos após a alteração.

Build Android final passou em31 segundos. Candidato: `output/audio-layout/candidate/connect-audio-0.1.1-candidate.apk`, SHA-256 **8edbd53901334d578a29ac7e72356bf8587db376c663f7753c71b4b0c6220d56**. Manifesto0.1.1/code2, minSdk24/target36, ARM64/x86_64; sem INTERNET/microfone. Certificado SHA-256 igual ao anterior: `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`.

## QA Android e ajuste final

A matriz nativa usou quatro pares representativos, cada um com teclado aberto/fechado e áudio dos dois lados:393dp/fonte1;360dp/fonte1,3;320dp/fonte1,6;320dp/fonte2. Configuração observada de wm/font/IME foi comparada à solicitada. Antes do último ajuste de copy, houve7 geometrias completas e5 acessos com os quatro componentes íntegros por segmentos;4 observações em fonte2 ficaram inconclusivas, sem falha de sobreposição observada. A execução foi mantida como falha, não renomeada para passe.

O teste também identificou placeholder longo recortado no campo e consumindo altura. A única alteração posterior foi `Escreva uma mensagem fictícia`→`Digite…`, mantendo fontes, estilos, rótulo acessível e lógica. Verificação independente reverteu essa substituição e recuperou exatamente o hash anterior do App. Nova exportação repetiu32/32 combinações e64/64 balões; input/placeholder CSS chegaram a26px no fator2, sem erro/warning ou rede externa. Evidências finais em `output/audio-layout/web-final-copy`.

**Artefato entregue final:** `output/audio-layout/candidate/connect-audio-0.1.1-final.apk`, **42.068.996 bytes**, SHA-256 **3eb80a054208dc970314611b63b4b6d4232b3b2b0e910e8a40bab1c9e093e948**. Build35s, mesmo certificado/versão0.1.1/code2. O candidato8ed acima permanece preservado como snapshot da matriz anterior; não é o arquivo entregue final.

Reteste dirigido no final confirmou placeholder inteiro a320dp/fonte1,6 e as quatro observações de fonte2: recebido/enviado, teclado fechado/aberto, com todos os componentes alcançáveis e íntegros por rolagem. Uma execução base terminou com1 observação não resolvida pelo limite do helper; um suplemento isolado confirmou essa mesma situação de Ana/enviado/fonte2/teclado aberto. Resultados base permaneceram falha, e o suplemento foi associado explicitamente. **Não se declarou geometria integral de uma bolha maior que a janela do telefone.** Referências separadas a4096px de altura, mesma largura/fonte, validaram a geometria dos blocos; os alvos a2048px validaram acesso por rolagem.

O fluxo completo de criar áudio a360dp/fonte1,3/altura2048 passou sem usar altura artificial. O cenário paciente/Marina também foi repetido no tamanho original1080×2280 com teclado aberto/fechado, com geometria integral confirmada no fechado e imagens próprias de comparação. Configurações originais de tela/densidade/fonte foram restauradas exatamente, e o emulador próprio foi encerrado.

Recibo consolidado: `output/audio-layout/candidate/final-qa-summary.json` (`passed-with-limitations`,0 acessos pendentes após suplemento). Base final em `output/audio-layout/matrix-2026-11-06T22-03-17-424Z`; suplemento em `output/audio-layout/supplement-2026-11-06T22-09-02-564Z`. Harness reproduzível versionado: `apps/mobile/scripts/android-audio-layout.mjs`. Não foram habilitados serviços de acessibilidade, alteradas permissões/segurança ou usados aparelhos físicos.

Entrega/links: `docs/delivery/DEMO-0.1.1-BUILD2.md`. Imagens de comparação são capturas nativas próprias com fixtures, não a imagem original do usuário cuja materialização falhou.

## Limites

Continua áudio ilustrativo sem microfone/som/upload e chat em memória com fixtures. TalkBack, aparelho físico do usuário e iOS não validados; árvore acessível/geometry não comprovam pronúncia ou funcionamento em todos os aparelhos. Login online permanece bloqueado por ausência de canal Auth Admin seguro, sem contorno do navegador. Fonte maior pode exigir rolar uma mensagem alta; isso difere de texto cortado dentro do balão. O teste deve garantir que todo o conteúdo seja alcançável.
