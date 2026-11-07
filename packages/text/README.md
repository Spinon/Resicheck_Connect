# Texto Unicode de mensagens

Contrato compartilhado pela demonstração e pelo domínio local de chat: `analyzeMessage` e `messageInputError`. Não possui rede, armazenamento de usuário ou credencial.

Limite inicial: **2.000 extended grapheme clusters** e, separadamente, **65.536 bytes UTF-8 (64 KiB)** no corpo original. Excesso é recusado no envio; o rascunho continua editável sem truncamento. Não normaliza NFC/NFD, não substitui surrogates e não remove espaços/quebras de linha do corpo. Vazio, controles C0 exceto tab/LF/CR, DEL e surrogates isolados são recusados. UTF-8 é contado sem depender de TextEncoder; a segmentação de payload acima do orçamento não é executada.

Dependência de projeto `unicode-segmenter` **0.17.3**, sem dependências transitivas, fixada no package-lock com integridade do registro npm. Usa apenas `unicode-segmenter/grapheme`, sem alterar o Intl global. A biblioteca implementa Unicode17/UAX29 e declara suporte a Hermes; a validação própria do Android continua necessária. [Fonte do mantenedor](https://github.com/cometkim/unicode-segmenter). Manter a versão única nos futuros adaptadores, sem depender de dados Unicode diferentes de cada sistema.

Após obter as dependências de projeto autorizadas: `npm ci --prefix packages/text --ignore-scripts`; depois `npm run text:typecheck` e `npm run text:test` na raiz. Instalação é separada da pasta mobile, sem converter o workspace para hoisting. Metro já observa a pasta packages; esse pacote não instala módulo nativo.

Oito testes Node cobrem os limites, UTF-8/surrogates, erros e **766 casos oficiais de segmentação Unicode17**. Fixtures, proveniência, hashes e licença oficial estão em `tests/fixtures`. Licença MIT da biblioteca preservada em `UNICODE-SEGMENTER-LICENSE.txt`; o script canônico de build Android copia os avisos MIT/Unicode V3 para assets/third-party no APK. Isso não inclui as fixtures de teste no APK.

O domínio de chat usa o mesmo validador; a prévia local de notificação tem limite menor por grapheme e orçamento separado de 3.072 bytes para os campos selecionados, sem truncamento ou corpo oculto. Esses números são parâmetros de engenharia locais, não garantia de aceitação por provedor push.

**Backend online ainda não alinhado**: a migração já aplicada usa char_length 2.000, e o APK não se conecta ao banco. A integração real exige nova migração/validação e roundtrip autenticado, não alterar o histórico aplicado nem concluir APP-057 apenas pelos testes locais. Persistência sintética UTF-8 em arquivo de teste está no pacote chat; o app permanece em memória.
