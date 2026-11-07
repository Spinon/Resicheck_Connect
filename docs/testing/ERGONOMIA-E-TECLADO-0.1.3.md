# Ergonomia e teclado — 0.1.3/code7

Data: 2026-11-07. Somente dados sintéticos, sem autenticação ou transporte remoto.

Os controles de teste saíram do rodapé permanente e agora ficam em um modal aberto pelo aviso verde da demonstração. O modal tem fechamento por botão e BACK, área rolável e restauração de foco condicionada à mesma conversa. O compositor não é remontado para esconder o defeito. Avisos de validação continuam na lista rolável; alterações de entrega fazem a lista acompanhar a última mensagem. Nenhuma fonte foi reduzida. O subtítulo do paciente foi encurtado para “Conversa local”; o nome da empresa continua no título.

## Investigação controlada

O baseline 0.1.2/code3 e a variante A 0.1.3/code4, ambos com KeyboardAvoidingView/height no Android, reproduziram o compositor fora da janela após abrir e ocultar o teclado em4096px e reduzir para2048px. Inicialização fria e mudança sem usar IME foram medidas separadamente. Remover o rodapé não corrigiu esse caminho.

A variante B/code5 usa padding no Android, mantendo height na web e padding no iOS. Ela passou pelo mesmo caminho e por28 capturas nativas em393dp/fonte1 e320dp/fonte2, teclado aberto/fechado e mudanças nos dois sentidos. Modal Close/BACK preservou o rascunho. Fonte2 e rascunho multilinha ainda deixavam pouca área de conversa; a variante final D/code7 encurta o subtítulo sem esconder a empresa. A causa foi localizada no comportamento de ajuste da janela neste cenário; a causa interna exata no React Native/Android permanece não estabelecida.

Uma seleção inteira de SYNTHETIC123 foi testada com DEL como sonda comportamental: sem resize apaga a seleção, após resize apaga apenas o último caractere. O mesmo ocorreu em B/padding e C/code6/height. Portanto há uma limitação real de seleção após redimensionamento, sem evidência de exclusividade da mudança para padding. Texto permanece íntegro e pode ser selecionado novamente. Não declarar acessibilidade completa. Um frame intermediário C com UIAutomator sem idle foi excluído da evidência geométrica; helpers passaram a rejeitar dumps ausentes ou falhos.

## Evidências preservadas

- Baseline: `output/resize-baseline/run-2026-11-06T23-41-49-344Z/result.json`.
- A: `output/resize-comparison/run-2026-11-06T23-48-07-156Z`.
- B: `output/resize-comparison/run-2026-11-06T23-53-51-414Z` e `output/ergonomics-native/run-2026-11-06T23-55-42-153Z/result.json`.
- Seleção B/C: `output/selection-resize/run-2026-11-07T00-00-08-811Z/result.json` e `output/selection-resize/run-2026-11-07T00-05-53-631Z/result.json`.
- D: `output/ergonomics/final-d/source-delta.json`; resultado dirigido final e consolidado no lote de entrega.
- Scripts reproduzíveis: `apps/mobile/scripts/android-resize-diagnostic.mjs`, `android-resize-comparison.mjs`, `android-selection-resize.mjs`, `android-ergonomics-final.mjs`.

## Limites

O primeiro teste dirigido D preserva status failed: os casos estreito/resize/modal/retry passaram, mas o guard de resolução interrompeu o smoke padrão. O Android informa somente Physical size quando a resolução solicitada coincide com a física; o script exigia Override size. A leitura foi corrigida para dimensão efetiva (override quando presente, física caso contrário), sem relaxar o valor esperado. Um suplemento exclusivo do smoke padrão é exigido antes de liberar o APK; os dois resultados ficam no QA, sem reescrever o histórico.

API36 em emulador próprio; aparelhos físicos/antigos, iOS e TalkBack não validados. Nenhuma mudança no backend, credenciais ou permissões. A investigação de rajada artificial APP-060 e Auth real continuam independentes. APKs e falhas históricas preservados. O lote final registra hash, assinatura, versão e os resultados realmente obtidos antes da distribuição.
