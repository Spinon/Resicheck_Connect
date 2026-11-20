# Mensagens de áudio

Vocabulário atualizado em 10/11/2026: **Cliente** é o termo de produto. [Mapa de compatibilidade e limites](TERMINOLOGIA.md). Identificadores técnicos e evidências anteriores permanecem preservados; esta revisão não altera permissões nem comprova novas funcionalidades.

Atualização APP-092/093: existe uma [integração Android local opcional ao chat demonstrativo](../testing/CHAT-AUDIO-LOCAL-0.1.md), com gravação, revisão, cópia temporária privada e reprodução. Os cartões são explicitamente não enviados. A [parada automática nativa](../testing/AUDIO-PARADA-AUTOMATICA-0.1.md) também foi corrigida. Os APKs entregues permanecem ilustrativos; captação física, qualidade acústica, envio real e autorização de backend continuam pendentes.

Requisito do chat MVP, acrescentado pelo usuário em 06/11/2026. Experiência familiar de gravar, cancelar, revisar/ouvir, enviar e reproduzir áudios; não presumir parâmetros proprietários do WhatsApp.

O protótipo inicial entregue usa somente controles e cartões fictícios, explicitamente identificados como simulação visual sem som. Não pede microfone, grava, envia ou reproduz arquivo real. A integração conectada de áudio permanece pendente e não depende de IA.

## Comportamento a implementar

- Solicitar permissão de microfone somente ao iniciar gravação, com explicação contextual. Negada/revogada: mensagem compreensível e chat de texto/anexos utilizável. Não presumir permissão por cadastro ou configuração de notificações.
- Gravar com indicador claro, tempo decorrido e controles alcançáveis/acessíveis; permitir parar, cancelar, ouvir a prévia e confirmar envio. Cancelar não cria mensagem e descarta apenas a cópia de gravação temporária do app conforme política.
- Enviar com progresso, falha, nova tentativa e deduplicação; não afirmar entrega até confirmação real. Definir limites de duração/tamanho, formatos/codecs, interrupções por chamada/segundo plano e política de retenção antes de liberar.
- Reproduzir com rótulo, duração, play/pause e estado acessível. Evitar reprodução inesperada e múltiplos áudios simultâneos. Definir saída de áudio e comportamento com fones/aparelho bloqueado nos testes de plataforma.
- Gravação original e representações derivadas ficam privadas por empresa/conversa. Cliente só acessa seu próprio chat; todos os funcionários aprovados da empresa podem atender conforme a política atual. Pendente/revogado ou outra empresa não obtém áudio por URL, cache, exportação ou realtime.
- Validação no servidor de tipo real, tamanho e processamento limitado; metadados minimizados, duração conferida e logs sem gravação, URL permanente ou dados sensíveis. Notificação segue filtro e nível de privacidade; não enviar conteúdo ou transcrição como atalho.

Não incluir transcrição automática, análise clínica, envio a IA ou terceiros sem decisão e autorização específicas. Provedor de armazenamento, quando houver, segue a avaliação de dados e fornecedores do chat.

## Testes futuros

Dados sintéticos somente: permissão concedida/negada/revogada, cancelar antes/depois de gravar, revisão e envio, timeout/retry, gravação interrompida, falta de espaço, erro de decodificação, fones, retorno do segundo plano e fonte/leitor de tela. Testar isolamento por empresa/cliente e revogação durante upload/playback. Android primeiro; validar iOS antes da entrega iPhone. A simulação visual não comprova esses comportamentos nativos.
