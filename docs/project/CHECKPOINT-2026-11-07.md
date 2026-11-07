# Checkpoint de desenvolvimento — 07/11/2026

O repositório havia permanecido no protótipo inicial3790bac enquanto código posterior estava na cópia de trabalho. O núcleo foi preservado em `e7a1839` e a interface/ferramentas Android em `d2bbe1d`; este documento acompanha o checkpoint de documentação e quadro. A confirmação de publicação é dada pelo histórico remoto Git, não pela existência deste arquivo.

## Estado verificável

- 124 testes passaram:18 acesso,10 sessão,8 texto (incluindo766 casos oficiais Unicode17),26 chat,22 chat-client e40 app. Os seis typechecks passaram. HTTP de teste usa somente loopback com fixtures fictícias; não comprova Supabase Auth positivo.
- Fila corrigida após revisão: confirmações antigas liberam espaço, pendências/retries permanecem protegidos e105 envios na interface preservam histórico. [Regressões](../testing/FILA-CAPACIDADE-0.1.md).
- Histórico paginado valida páginas e contexto com integração ao servidor de referência em memória; ainda não integrado ao Android conectado. [Limites](../testing/HISTORICO-CLIENTE-0.1.md).
- Novos modais passaram10 cenários web de acessibilidade dirigida,13 checks e37 regressões; Android/TalkBack da fonte posterior ainda pendentes. [Evidência](../testing/ACESSIBILIDADE-MODAIS-0.1.md).
- Seleção após resize foi localizada no EditText puro/Android API36, sem recriação de Activity. O APK entregue reproduz comportamento equivalente, sem instrumentação interna. Não foi aplicado workaround. [Diagnóstico e ressalvas](../testing/SELECAO-REDIMENSIONAMENTO-CAUSAL.md).
- Fundação SQL aplicada anteriormente foi preservada byte a byte, SHA445da1ce346266e485ae3e8103f2888337d626c5a280f90bb3f80b71d763b0f3. A verificação local do artefato passou; não houve reaplicação remota nesta fase. [Implantação anterior](../testing/IMPLANTACAO-SUPABASE-ONLINE.md).

## Pendências que bloqueiam funcionalidade real

Auth positivo e canal administrativo seguro para fixtures continuam pendentes. O APK ainda não usa transporte remoto. A discrepância entre2000 grafemas/64KiB do cliente e char_length2000 do SQL foi reproduzida; candidato de correção permanece local, fora de migrations até equivalência Unicode, custo e revisão. Relaxar apenas para bytes não garante o limite de grafemas. Sem alteração remota autorizada nesta fase.

O Drive continua distribuindo0.1.3/code7. O candidato local0.1.4/code8 compilou antes da correção da fila e ficou superado sem instalação/distribuição; próximo build exige código novo e QA nativa. Nenhuma versão anterior foi substituída.

## Escopo da revisão para versionamento

Inventário de código/documentação revisado com padrões de credenciais, nomes de artefatos e bytes binários, além de proveniência sintética das fixtures. Sem chaves privadas, tokens/JWT reais, URLs com senha, dados de pacientes, APKs, keystores ou logs na seleção. Isso não substitui auditoria de segurança completa. O logo já autorizado e os dados oficiais Unicode/licenças são as fontes de terceiros pertinentes.

A análise interna de outro produto foi generalizada para requisitos do Connect; a evidência original permanece em área local ignorada. Notas privadas de coordenação não são documentação do produto. O fixture oficial Unicode mantém os bytes originais; apenas seu cabeçalho upstream possui exceção pontual de whitespace em.gitattributes.

Testes, modelos e documentação não certificam segurança de produção ou conformidade. Dados reais, gravação/arquivos/push, dispositivos físicos/antigos e leitores de tela continuam fora desta demonstração.
