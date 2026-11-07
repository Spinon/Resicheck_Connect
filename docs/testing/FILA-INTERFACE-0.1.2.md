# Fila local na interface — candidato 0.1.2/code3

06/11/2026. Fatia APP-061, contribuindo para APP-004 sem concluir o chat operacional. Dados inteiramente fictícios, somente memória local e transporte simulado; sem rede, login, upload, push, áudio real ou persistência após fechar o processo.

## Comportamento

- O envio de texto usa `packages/chat-client` através de `demo-delivery.ts` e `demo-session.ts`. A bolha é criada uma vez e apenas seu rascunho é limpo quando a fila aceita a intenção.
- Os estados se identificam como simulação. A confirmação exibida é **“Confirmado na simulação · sem envio real”**; não significa entrega ou leitura por outra pessoa.
- A opção de falha vale para a próxima nova mensagem. Depois de uma falha simulada, tentar novamente conserva o ID e o texto e atualiza a mesma bolha.
- Trocar conversa, empresa ou identidade invalida callbacks antigos. Pendências interrompidas conservam o texto para o autor, ficam não confirmadas e não ganham novo ID de retry. Reabrir a mesma conversa ativa preserva a tentativa; ir à tela pública da mesma empresa não abre outra conversa.
- Outro autor não vê pendências/falhas. Indicadores de atendentes e importância usam somente mensagens confirmadas na simulação ou exemplos anteriores. Isso é isolamento da demonstração, não prova de autorização de produção.
- Fila cheia mantém o rascunho e mostra aviso fixo, sem erro técnico. Logout reinicia os dados e cancela timers. Nenhuma mensagem bruta de erro entra na UI.

## Validação confirmada

**Modelo:** 39/39 testes do app, incluindo13 novos, e TypeScript estrito passaram. Relógio e transporte controlados exercitam pending/sending/accepted/failed, confirmação perdida, retry, capacidade, Unicode, acesso revogado sinalizado, troca A/B/A e exceção de subscriber. A geração local por contexto invalida também `bindDispatch` antigo; transições internas da fila não aceitam payload pelo dispatcher público.

Evidência: `output/delivery-integration/controller-validation.json` e `apps/mobile/tests/demo-delivery.test.ts`.

**Web:**10 verificações passaram no export RNWeb, em Chromium/Playwright existente. Browser plugin não disponível. Assets locais interceptados em `https://connect-demo.invalid/`, sem servidor remoto; relógio do navegador controlado para observar transições. Identidade da página, conteúdo inicial, Unicode exato, rascunho, erro, retry sem duplicação, contexto, logout, texto ampliado e saúde do console foram verificados. Zero erros, warnings de runtime ou requisições externas. Em320×640, fontes e entrelinhas dos estados de envio foram dobradas; ranges dos glifos ficaram contidos e sem sobreposição, retry com alvo mínimo48px e sem overflow horizontal. Isso não substitui escala de texto Android.

Evidências: `output/queue-interface/web/result.json`, `narrow-glyphs.json`, `sending.png`, `failed.png` e `narrow-failed.png`.

As37 verificações web de regressão anteriores também passaram no export atual, sem erros ou warnings: `output/queue-interface/web-regression/result.json`. Incluem Unicode, rascunhos, navegação, contextos e simulações de anexos/áudio; não significam envio desses arquivos.

Encontrado/corrigido: o checkbox precisava `aria-checked` para informar seu estado no RNWeb. A execução anterior foi preservada em `before-checkbox-accessibility-fix`. Uma falha do seletor do harness (`Perfil` era tab, não button) foi preservada em `before-profile-selector-fix`. A primeira simulação CSS ampliava apenas fonte, mantendo entrelinha original; essa captura produziu sobreposição artificial, preservada em `before-font-simulation-fix`. O ensaio final escala ambas as métricas e mede glifos; não se atribui aquele artefato ao Android.

**Build:** candidato local `output/queue-interface/candidate/connect-queue-0.1.2-build3.apk`,42.087.092bytes, SHA256 `f62918470bd7f51b295736f4f52d3bd12c5110f7b5934a9b95c9c0ea4cafbb7c`. Assinatura v2 válida, mesmo certificado Android Debug das versões anteriores. ARM64+x86_64, minSdk24/target36. Apenas permissão interna de receiver; sem INTERNET ou RECORD_AUDIO. Build concluído com ferramentas existentes, sem dependências novas; avisos de depreciação das ferramentas/bibliotecas não foram tratados como falhas de runtime.

**Android:** cinco jornadas padrão passaram: confirmação simulada, falha/retry com mesma identidade da bolha e teclado aberto/fechado, BACK rápido sem reabrir chat, troca de empresa/logout após falha e falha privada de funcionário não exibida a outro. Um PNG nativo registrou `Confirmando na simulação…`; pending permanece cobertura do modelo. A troca de contexto/logout **antes** da conclusão e a confirmação perdida não são inferidas desses cenários pós-falha: sua cobertura determinística continua no modelo/web.

**Reteste dirigido320dp/fontScale2:** passou com limitações em `output/queue-qa/directed-font2-2026-11-06T23-20-23-435Z/result.json`. Activity iniciada já em880×2048px/densidade440/fontScale2: compositor presente, status inteiro de176px observado em `open-step14.png`, retry inteiro em `open-step9.png`, erro de242px coberto por vistas sobrepostas num viewport de241px. O retry foi acionado com IME aberta e confirmou a mesma bolha `message-queued-demo-1-intent-1`. A transição accepted foi observada na AX com teclado aberto; **não** se afirma que a legenda accepted inteira coube nesse frame. O texto completo foi verificado após fechar o teclado, em `accepted-closed-full-caption.png`. O instante individual do tap não foi instrumentado; há IME observada antes/depois e registro do pedido no orquestrador.

O ensaio inicial após referência de altura4096px e retorno para2048px deixou o compositor fora da área visível; segue preservado sem causa atribuída e não foi convertido em aprovação pelo teste frio. Resultados iniciais de estresse incompletos permanecem como falhas/não verificados. Correções no harness trataram seleção de estado fora da janela, decisão de direção da rolagem, gesto curto com pouco deslocamento e canal stdin sem PTY; não houve alteração no App para obter o reteste.

Evidência inicial: `output/queue-qa/run-2026-11-06T22-56-25-464Z`; retestes frios em `output/queue-qa/stress-cold-*`. Resultados incompletos e falhas de seletor/decisão de rolagem permanecem preservados. Não substituir suas falhas por aprovação retroativa.

Limite de UX observado: com texto200% e teclado aberto, os controles da demonstração no rodapé ocupam várias áreas roláveis antes da última bolha. A conferência exige rolagem extra; essa organização ainda merece revisão para que os controles de teste não disputem espaço com a conversa. Não apresentar a configuração como experiência final de produção.

## Limites e entrega

O APK0.1.1 distribuído, hash `3eb80a05…`, está preservado. O candidato0.1.2 ainda não foi enviado ao Drive nem publicado no Git. Manifesto local em `output/queue-interface/candidate/manifest.json` vincula fontes, hash e escopo.

A fatia de integração APP-061 está concluída no escopo sintético documentado. APP-062 acompanha simplificação do rodapé e investigação do redimensionamento; concluir esta fatia não encerra a acessibilidade nem o MVP operacional.

Login real/Auth Admin, alinhamento Unicode do SQL, transporte autenticado, recuperação após fechar o app, TalkBack, iOS e aparelhos antigos continuam pendentes. A investigação APP-060 de entrada sob rajada foi feita no APK0.1.1 e permanece aberta; esta integração não é uma correção daquele fenômeno. Não houve mudança no banco ou serviço remoto.
