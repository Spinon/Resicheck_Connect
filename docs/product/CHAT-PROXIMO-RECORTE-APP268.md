# APP268 - proximo recorte do chat

Direcao de Lucas,21/11/2026. Somente depois do hotfix APP267;branch/checkout separados. Nao integra o candidato0.0.34 nem APP266.

- Selecao por pressao longa conserva botao,barra e duracao do audio. Pode desativar interacoes,sem reproduzir nem resetar progresso. Sem mudanca da infraestrutura de audio.
- Mensagem nova acompanha o fim somente se o leitor ja estiver perto dele. Preservar posicao durante leitura do historico;reaproveitar atalho existente. Nao rolar por polling equivalente,recibo,edicao ou carregamento antigo.
- Texto enviado aparece imediatamente no proprio balao,com relogio pendente e tique na aceitacao pelo servidor. Retirar a previa pendente separada acima do campo. Reconciliar pela identidade estavel da mesma tentativa,sem duplicar,piscar ou reordenar. Falha recuperavel no mesmo balao pelo retry/reconciliacao seguros;nao disparar dois envios nem permitir acoes de mensagem confirmada enquanto pendente. Preservar rascunhos,previa de resposta e revisao de imagem,que tem finalidades distintas. Comecar por texto,sem trocar a logica de midia validada.

Checagem focal Web/Android do codigo afetado:selecao/soltura do audio;chegada no fim e lendo historico;refresh equivalente;latencia,falha e refresh/realtime em ordem invertida para a mesma tentativa. Fixtures nao equivalem a backend/dispositivo real. Nao gerar/publicar outro APK ou Web antes de fechar o lote pela rotina.

Antes de medir rolagem,comprovar que a nova mensagem chegou ao historico nas duas superficies. Preservar controlador/posicao do audio durante selecao e usar clientMessageId na recuperacao de resposta incerta. O plano M33 e roteiro,nao teste executado destes itens novos. Nenhuma implementacao APP268 esta no APK/Web0.0.34.
