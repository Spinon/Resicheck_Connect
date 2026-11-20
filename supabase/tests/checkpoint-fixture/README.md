# Fixture de schema portatil para o checkpoint33

Somente PostgreSQL descartavel local, sem cliente remoto. Esta fonte nao cria conta Auth hospedada, nao faz login e nao aplica migracao no Connect.

- `protected-fixture.PORTABLE.mjs` exporta o mesmo contrato `prepareProtectedLocalFixture(sql)` e `fixtureIdentity` do helper historico, que permanece intacto.
- `managed-functions.FIXTURE.sql` contem apenas sete definicoes SQL necessarias ao schema protegido. Nao inclui linhas de usuarios, senhas, tokens, sessoes capturadas, status de prova ou configuracao hospedada.
- `migration-history.FIXTURE.json` contem apenas24 pares publicos de versao/nome. Nao atesta que um clone esta implantado nem leva metadados de permissoes/sessoes.
- O helper cria somente linhas sinteticas no banco descartavel recebido pelo callback, inclusive cinco sessoes com prefixo sintetico. O unico UUID literal nas definicoes extraidas e a empresa usada pela fixture; nao havia literal de sessao comprovada a substituir.
- A modelagem Auth e a tabela/protocolo Storage sao fixtures SQL, nao os produtos Supabase reais. Este helper nao fornece prova de cliente hospedado, codec ou Linux.
- Depende dos compiladores e SQLs locais ja existentes de catalogo/audio/escopo. Eles sao fonte de schema; nao deve ser executado nenhum launcher/piloto ou arquivo de deploy como consequencia da importacao.

Validacao desta preparacao: limites de extracao, ausencia de campos/valores de segredo, conjunto de sete funcoes e24 versoes conferidos; `node --check protected-fixture.PORTABLE.mjs` passou. Nenhum PostgreSQL ou teste de audio foi executado por esta preparacao. O teste novo de elegibilidade deve importar este helper e usar PNG sintetica fixa, sem importar a prova temporaria ou reservas de contas.


image-managed-shape.FIXTURE.json preserva somente project, nove definicoes com signature/owner/securityDefiner/bodySha256, e schema/name/owner/acl de accounts e storage.objects. Sem observedAt, policyGrants, catalogo, linhas ou sessoes. Nenhum UUID literal nas nove definicoes; os hashes de corpo foram conferidos. Fonte de schema, nao readback hospedado nem prova funcional.\n
Correcao de montagem: cada definicao extraida termina com ponto e virgula; sete corpos SQL preservados byte a byte. O helper historico enviava cada definicao em chamada separada; o arquivo portatil agrupa as sete em uma chamada. Esta correcao nao altera comportamento nem permissao.\n
Confirmacao posterior do coordenador: o novo caso de elegibilidade com este helper/shape portateis passou em PostgreSQL real (8.931ms), na quarta invocacao do mesmo alvo apos correcao de ACL da fixture e dos separadores. Auth/Storage continuam modelados na fixture; nao houve codec, rede ou prova nova hospedada. Esta frente nao executou PostgreSQL e nao repete esse caso. O resultado completo fica no board/contexto e no recibo do coordenador, fora do checkpoint de fonte.\n