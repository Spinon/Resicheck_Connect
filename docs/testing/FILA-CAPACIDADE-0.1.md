# Capacidade da fila após mensagens aceitas

2026-11-07. A revisão reproduziu QUEUE_FULL no101º envio aceito no mesmo contexto. O limite local de100 contava confirmações antigas como trabalho pendente; um teste da demonstração inclusive fixava esse comportamento incorreto.

A capacidade agora protege mensagens ainda não aceitas. Um enqueue válido pode retirar recibos aceitos antigos do mapa limitado para liberar espaço; mantém a confirmação observável até a próxima inserção. Pendente, enviando, falha/retry e confirmação incerta não são retirados. O snapshot da fila não é histórico: mensagens aceitas já copiadas para a apresentação continuam na conversa. O gerador de clientMessageId deve garantir IDs novos, inclusive após um recibo sair do cache; duplicatas ainda retidas são recusadas. A demonstração usa prefixo por instância e contador monotônico.

O transporte fictício também elimina recibos que saíram do mapa, mantendo os de intenções não resolvidas. A sequência deixou de depender do tamanho desse cache: usa contador monotônico próprio, para não repetir posição após retirar recibos. Contexto/logout continuam limpando filas e temporizadores.

Regressões:205 envios aceitos no mesmo contexto com snapshot≤100; fila mista preservando falha retryable e pendente e recusando excesso realmente não resolvido;105 envios na interface sintética mantendo todas as bolhas confirmadas; sequência crescente em cache2 e retry de confirmação perdida devolvendo o mesmo recibo/posição. O teste antigo de capacidade agora enche a fila enquanto o primeiro envio ainda está em andamento.

Resultado:22 testes chat-client (14 fila/8 histórico),40 do app e os dois typechecks passaram. Checkpoint completo:124 testes e seis typechecks passaram, incluindo HTTP apenas em loopback. São modelos e transporte sintéticos, sem comprovar persistência, servidor remoto ou Auth positivo.

O APK0.1.3 distribuído e o candidato local0.1.4/code8 foram compilados antes desta correção e preservam seus bytes. O candidato code8 está superado para distribuição; próximo build deverá receber novo código e nova validação nativa. Nenhuma alteração remota ou publicação Git é implícita neste relatório.
