# Notificações, importância e privacidade

Definição solicitada pelo usuário em 06/11/2026. Estado: especificação e backlog; o protótipo implementa somente configuração e prévia locais/simuladas, sem push, persistência de preferências ou registro de dispositivos. Integra o produto de chat; não depende de agenda, APIs externas de agenda ou IA.

## Mensagens importantes e filtro

Funcionários aprovados da empresa podem marcar mensagens das conversas autorizadas como importantes. A marcação é um estado auditável da mensagem, com ator, empresa e momento, protegido no servidor; não concede acesso extra nem altera a autoria. Funcionário pendente, revogado, paciente ou de outra empresa não ganha esse poder por chamada direta.

Cada usuário pode escolher **todas as notificações** ou **somente importantes**. O filtro e o nível de privacidade são escolhas independentes: receber somente importantes não permite mostrar mais dados. O padrão inicial de filtragem e o estado de cada opção devem ficar claros na interface; não tratar escolha no app como consentimento à permissão do sistema.

Decisões ainda em aberto: quem classifica um evento de entrada como importante antes de uma funcionária marcá-lo; se marcar uma mensagem já recebida gera nova notificação; quem pode desmarcar; se a marca é compartilhada pela equipe ou também tem preferências individuais; como evitar repetição/abuso de alertas; tratamento de marcação concorrente. Não inventar classificação automática ou assumir que toda mensagem de paciente é importante.

## Quatro níveis progressivos

| Nível | Conteúdo máximo solicitado |
| --- | --- |
| 1 | Apenas **ResiCheck Connect**, nome provisório do app |
| 2 | Nome do app + empresa |
| 3 | Nome do app + empresa + atendente |
| 4 | Nome do app + empresa + atendente + mensagem |

Padrão seguro proposto: **nível 1**, inclusive antes de configurar um dispositivo. Aumento do nível deve ser uma escolha consciente, com prévia sintética. Nome de empresa e atendente também podem revelar contexto de saúde; o nível 4 pode expor conteúdo sensível na tela bloqueada e dispositivos associados. Não enviar mensagem clínica no push por padrão.

Controle proposto: barra deslizante com **quatro paradas discretas**, rótulo do nível, descrição legível e preview sem dados reais. A mudança não pode depender de precisão de arrasto; oferecer navegação acessível pelos quatro níveis, anúncio pelo leitor de tela, foco e contraste. Não usar rolagem infinita ou posições intermediárias sem significado.

Quando não houver atendente humano (mensagem do paciente, evento de sistema ou futura IA), não inventar um nome. Exibição nesses casos é decisão a validar; até definição, usar fallback que não acrescente informações além do nível autorizado. Indicadores de atendente principal da conversa não substituem automaticamente o remetente da notificação.

## Usuário, dispositivo e sistema

Configurações pertencem ao usuário autenticado e devem contemplar seus dispositivos. Proposta para validação: preferência de usuário com override explícito por dispositivo; dispositivo novo começa no nível 1 até configuração consciente. Definir sincronização, prioridade de overrides e comportamento em reinstalação antes de implementar. Preferência da conta anterior nunca é herdada por outro usuário no mesmo telefone.

Solicitar permissão do sistema no contexto apropriado. Não assumir que foi aceita porque o usuário escolheu um filtro ou nível no app. Permissão negada/revogada deve manter o chat utilizável e mostrar estado de configuração compreensível, sem tentativas incessantes de pedir acesso. Políticas de lockscreen, canais Android, Focus/resumo e preferências iOS podem restringir o que aparece; o app não deve prometer que controla toda a apresentação do sistema.

## Autorização e payload

O servidor verifica usuário, dispositivo, vínculo ativo, empresa, conversa e evento antes de notificar. Paciente recebe apenas eventos do próprio chat; funcionário aprovado pode receber eventos das conversas da sua empresa conforme filtro. Outro paciente, empresa, gestor sem papel de atendimento ou ADM sem privilégio adequado não obtém conteúdo pela notificação.

Payload, cabeçalhos, mídia, ações rápidas e previews respeitam o nível, não apenas a interface expandida. Não enviar corpo completo escondido em campo de dados quando o nível permite só o app. IDs usados para abrir destino devem ser opacos e não conter CPF, documento, token de sessão ou dados clínicos. Abrir notificação exige autorização atual; o push não serve como credencial nem carrega documento anexo.

O nível máximo nunca supera a classificação e o escopo do destinatário. Definir limites e conteúdo do preview, minimização no provedor, retenção e telemetria antes de implementar. Registros de entrega/erro não devem copiar mensagem, nome de paciente ou segredos. Não reduzir a proteção do histórico por causa de uma opção visual.

Troca de conta, logout, revogação e mudança de empresa devem atualizar o vínculo de tokens/assinaturas, cancelar ações pendentes e impedir envio ao destinatário anterior. Paciente multivínculo pode receber evento de outra empresa em que continua autorizado, conforme preferências a definir; a notificação precisa abrir o contexto correto, sem misturar o chat que estava ativo. Não usar a empresa selecionada na tela como única prova de autorização.

Apagar notificações já entregues ou diminuir o nível não garante apagar cópias, capturas ou conteúdo já visto pelo sistema/provedor; documentar essa limitação sem prometer revogação retroativa. A plataforma deve aplicar a preferência atual a novos envios e definir tratamento de notificações em fila para não divulgar conteúdo após redução de privacidade.

## Testes futuros

- Combinar dois filtros × quatro níveis × usuário/dispositivo × permissão concedida/negada/revogada. Confirmar corpo visível, payload e ausência de dados proibidos em logs.
- Usar Android primeiro e iOS antes da entrega iPhone; testar app aberto, fechado, em segundo plano e tela bloqueada, incluindo configurações de preview do sistema. Web não prova esses comportamentos.
- Funcionário aprovado marca mensagem; paciente, funcionário pendente/revogado e empresa B tentam marcar ou receber conteúdo da A por API direta e eventos.
- Reduzir nível com notificações em fila, trocar usuário/empresa, revogar vínculo com sessão ativa e abrir notificação antiga; nenhuma entrega nova ou abertura contorna autorização.
- Verificar marcação depois do recebimento e deduplicação conforme a política que vier a ser escolhida. Até a decisão, o cenário permanece pendente, sem regra automática presumida.
- Validar slider com fonte ampliada/leitor de tela, quatro estados e preview sintético. Nenhuma mensagem real é necessária para testar.

Este documento especifica o comportamento pretendido; nenhum desses testes foi executado nesta etapa.
