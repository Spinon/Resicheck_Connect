# Acessibilidade dirigida dos modais — alterações após o APK0.1.3

Data: 2026-11-07. Fonte local posterior à entrega, sem alterar os bytes do APK distribuído. Não é auditoria WCAG completa nem validação TalkBack/VoiceOver.

Uma revisão independente no export D preservado demonstrou três problemas: em320×640 com fontes/entrelinhas CSS2×, os títulos/instruções dos painéis de áudio, anexo e saída ficavam fora da janela, sem ancestral rolável; os diálogos web não tinham nome acessível; Parar e revisar substituía o botão por um fragmento, deixando foco no BODY. Escape/retorno e rascunho passavam após a animação. Diagnóstico e nove capturas em `output/a11y-directed/REVIEW.md` e `result.json`, com hash do bundle D; o primeiro diagnóstico anterior ao fim da animação está separado.

A correção local aplica um componente comum aos três modais: cartão limitado a85% da área, cabeçalho com título e Fechar fixos, corpo rolável, nome no Modal e título header. Mantém fontes. No áudio, o primeiro Button permanece montado e muda rótulo/ação entre os três estágios; só Enviar é adicionado no estágio de revisão. Estado simulado usa live region polite e onda ilustrativa é decorativa. O modal de opções também recebeu nome acessível.

TypeScript,13 checks web de fila/opções e37 regressões passaram na fonte alterada, sem erros/warnings ou requisições externas. Artefatos novos em `output/a11y-followup-web` e `output/a11y-followup-regression`; os resultados da entrega anterior não foram sobrescritos.

Reteste independente:10/10 cenários passaram (anexo, áudio inicial/revisão, saída e opções × fontes1/2 em320×640), com20 capturas em `output/a11y-modal-fix`. Nome do diálogo, título e fechamento de ao menos48px visíveis; todo texto no corpo rolável e cada ação alcançável. Em fonte2, corpo309px e conteúdos de anexo863px/áudio revisão977px/saída607px tiveram rolagem efetiva. Tab/Escape/retorno de foco e rascunho preservados. O mesmo elemento DOM do botão permanece focado nas transições dos três estágios do áudio. Zero erros de página/requisições externas.

Fonte verificada antes/depois: `b54f9ff4acfd435f856615050f9288e4e99c782a585312b9062da336254e3808`; bundle `7089a49a3939b1bf6bd9bf1bdac1df2acb4e9b4fe7fc459feff982cb08754087`. Evidência não equivale à execução nativa Android da fonte nova.

Nada grava áudio, acessa arquivos ou envia dados. Android nativo dos novos modais, leitor de tela, dispositivos físicos e contraste completo ainda pendentes. A seleção após redimensionamento segue investigação própria; não é resolvida por esta alteração.

Um candidato0.1.4/code8 compilou com assinatura v2 válida e mesmas permissões (SHA84aa1b94a0240ca0befd4c68e03628a588ad3806cbf7100fa74077d7fd5f9c31). A revisão apontou depois o limite incorreto da fila, cuja correção mudou a fonte: o candidato ficou superado antes de instalação ou distribuição. Não usar esse build como prova da correção da fila nem como QA Android dos modais. Próximo build exige novo código e reteste.
