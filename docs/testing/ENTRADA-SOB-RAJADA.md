# Investigação de entrada sob rajada — diagnóstico local

06/11/2026. Caso separado do defeito de layout de áudio. Somente fixtures e emulador/navegador próprios; não envolve login ou mensagem real.

## Observações confirmadas

- No candidato emoji0.1.0 (`1edd4a91…`), uma chamada `adb input text` solicitou2.000 letras ASCII. Campo nativo e contador terminaram ambos em1.130, e o teste completo permaneceu falha. Não era apenas contador fora de vista. Evidência original em `output/android-qa/2026-11-06T21-10-06-203Z`.
- Adicionar50 letras em um lote produziu exatamente50 a mais (1.130→1.180), conforme `output/emoji-integration/adb-input-diagnostic.json`.
- Probe posterior, com cada lote de50 confirmado antes do seguinte, preservou exatamente2.000; a2.001 manteve o texto, bloqueou envio e mostrou erro seguro; apagar uma restaurou2.000 e o envio. Colagem nativa de texto composto e seleção real de um emoji pelo Gboard também passaram. Não foi uma segunda execução completa dos13 casos. `output/emoji-integration/native-targeted-result.json`.
- No navegador, `keyboard.type` com delay0 gerou2.000 eventos input confiáveis, com comprimentos sequenciais1–2.000; o campo e contador preservaram2.000 e o envio ficou habilitado. O controle `fill` fez uma única edição e também preservou2.000. Nenhum erro/warning/requisição externa. `fill` não é evidência de colagem nativa. Resultado e script em `output/input-stress-web`.

Tempo web observado:2,832 segundos para a sequência de teclas e3,7ms para fill; isso descreve essa execução, não é benchmark Android ou promessa de desempenho.

## O que não foi demonstrado

A causa Android permanece aberta entre injeção de eventos, IME, caminho nativo e reconciliação do campo controlado. O teste web não reproduzir a perda não isenta o app Android nem prova defeito do ADB. Também não foi observada perda em digitação humana normal.

## Controle adicional do estado local

Em `output/input-stress-store/check.mjs`, dois ensaios entregaram 2.000 callbacks síncronos ao store usado pelo app: letras ASCII e emoji composto de profissional de saúde com tom de pele. Cada notificação conferiu o comprimento por grapheme, os seletores de acesso e o indicador de atendentes. Os 2.000 estados foram observados em ordem; o envio preservou o texto integral e uma mudança de empresa rejeitou o callback antigo, sem apagar o rascunho da empresa anterior.

Resultado e hashes de fonte: `output/input-stress-store/result.json`. Essa execução usa Node, sem renderização React, Hermes, teclado ou eventos Android: demonstra apenas que o caminho síncrono recebeu e conservou todos os callbacks fornecidos pelo ensaio. Não substitui a investigação nativa nem demonstra desempenho de um celular.

A [documentação oficial de TextInput](https://reactnative.dev/docs/textinput) distingue `onChange` (inclui `eventCount`) e `onChangeText`, e descreve `value` como controle do valor nativo. Essa é a fronteira escolhida para eventual instrumentação de contagens. Não vamos aplicar `maxLength` como solução para o limite de graphemes: sequências de emojis podem ocupar várias unidades de código e devem permanecer íntegras para edição.

## Comparação Android com campo padrão

O APK final entregue `3eb80a05…` foi identificado pelo hash instalado no emulador próprio API36/x86_64, fonte1 e dimensões originais. Um segundo APK diagnóstico, em pacote separado `com.resicheck.connect.inputprobe`, usa somente Activity/EditText/TextWatcher do SDK, sem React Native, rede, persistência ou permissões adicionais.

Primeira comparação em `output/input-burst/run-2026-11-06T22-29-32-243Z`:

| Alvo | Letras solicitadas | Comprimento final estável | Comando |
| --- | --- | --- | --- |
| Connect0.1.1 | 2.000 | 1.110 no campo e contador | exit0,11.563ms |
| EditText padrão | 2.000 | 1.517 | exit0,10.649ms |

O TextWatcher do controle contou1.517 mudanças/inserções, nenhuma remoção e nenhuma regressão de comprimento. As três leituras por UIAutomator permaneceram estáveis. Seus dumps levam cerca de2segundos cada: os horários efetivos estão registrados; não são amostras exatas a0/1/3segundos.

O controle também apresentar divergência demonstra que o fenômeno não é exclusivo de React Native. Não demonstra que o ADB seja a causa, nem isenta o Connect de diferenças de carga/reconciliação. A primeira versão do controle redesenhava o contador a cada alteração; a próxima etapa separa a contagem primitiva de eventos da atualização visual e observa a entrega de teclas à janela/IME, sem mudar configurações do teclado ou do app.

A execução anterior `run-2026-11-06T22-28-41-554Z` parou antes de injetar texto porque a validação do caminho instalado não aceitava `~`. Essa falha do harness foi preservada, a guarda foi corrigida para o caminho observado e os testes de produto começaram somente na segunda execução. Não é uma falha do aplicativo.

## Controle com contadores sem renderização por tecla

Na segunda versão do controle, somente contadores primitivos são alterados durante a digitação. Um botão publica as estatísticas após o comando. Foram acrescentadas contagens de tecla A em `onKeyPreIme`, `Activity.dispatchKeyEvent` e `EditText.onKeyDown/onKeyUp`, preservando o comportamento de `super`.

Ensaio estendido: `output/input-burst/run-2026-11-06T22-34-38-308Z/result.json`.

| Alvo | Cadência | Final nas três leituras |
| --- | --- | --- |
| EditText diagnóstico v2 | Uma rajada de2.000 | 1.602 |
| EditText diagnóstico v2 | 40 lotes de50, pausa100ms | **2.000 exatas** |
| Connect0.1.1 | Uma rajada de2.000 | 1.232 |
| Connect0.1.1 | 40 lotes de50, pausa100ms | **2.000 exatas**, campo e contador |

O controle de argumento `shell printf` devolveu as2.000 letras exatas. Na rajada nativa, os contadores pré-IME observaram1.602 eventos down e1.602 up; o TextWatcher contou1.602 inserções, sem remoções/regressões. No teste pausado, ambas as contagens chegaram a2.000. A janela/EditText receberam0 down e1.602/2.000 up, respectivamente: esse caminho não implica uma tecla física por inserção; o IME pode consumir eventos e escrever por InputConnection.

Isso demonstra dependência de cadência nas duas rotas testadas e restringe a divergência a uma cadeia que também ocorre sem código Connect/RN. Não localiza o ponto exato entre geração, despacho e processamento dos eventos. Não foi instrumentado InputConnection nem observado o fluxo nativo do próprio Connect; a diferença de carga entre rotas permanece uma limitação. Por isso não foi aplicada uma correção especulativa ao App, ao teclado ou ao React Native, e APP-060 continua aberto.

A falha de seletor em `run-2026-11-06T22-33-11-136Z` também foi preservada: o botão Android expôs o rótulo em maiúsculas; o harness esperava caixa mista. A correção usa o rótulo observado. Não é uma falha do Connect nem é contada como ensaio nativo concluído.

Reprodução com código versionado: [REPRODUZIR-RAJADA-ANDROID.md](REPRODUZIR-RAJADA-ANDROID.md), `tools/android-input-probe/` e `apps/mobile/scripts/android-input-diagnostic.mjs`. O campo padrão não precisa de acesso à rede, microfone ou arquivos de pacientes. APKs entregues e código do App permanecem intactos.

Leitura da implementação instalada RN0.86 mostra callback onChangeText antes de atualizar lastNativeText/mostRecentEventCount, enquanto ReactEditText nativo rejeita atualizações JS com contagem antiga. Isso indica onde instrumentar somente contagens/eventos sintéticos; não constitui prova causal nem motivo para refatoração preventiva. Fonte de revisão em `output/input-stress-web/REVIEW.md`.

## Próximo ensaio rastreado

APP-060 compara condições controladas e, se necessário, artefatos anteriores (reducer, store de sessão e contador Unicode) no mesmo ambiente, sem tocar aparelhos reais ou testes simultâneos que usam o AVD. Deve registrar eventos/comprimentos e estado atual, sem senhas, texto de paciente ou tokens. Não mascarar a falha inicial com resultados dos lotes pausados; corrigir somente depois de isolar um caminho reproduzível.

Esse diagnóstico não muda os APKs entregues nem demonstra falha de autorização/dados no backend. A correção de layout APP-059 continua independente.
