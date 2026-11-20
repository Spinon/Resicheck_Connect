# Cache privado de conversas e áudio — APP-257

Lucas autorizou a implementação após a entrega do lote28, em 16/11/2026. Lote anterior preservado. Primeira implementação limitada entregue no lote29; resultados e limites em docs/testing/CACHE-LOTE29-RESULTADO-2026-11-16.md.

## Contrato inicial

- Cópias recebidas, separadas por usuário, empresa e conversa. Nunca guardar token, senha, rascunho ou tentativa de envio neste armazenamento.
- Android: arquivo privado sem backup, AES-GCM e chave Android Keystore. Web: IndexedDB cifrado, chave não extraível e separação por aba; código da própria origem continua confiável. Não é proteção contra aparelho/origem comprometidos.
- Exibir mensagens locais somente depois da confirmação atual de acesso à conversa. Sem acesso comprovado, não abrir cópias offline. Revogação/recusa remove a cópia correspondente; logout apaga o cache da conta.
- Cache limitado à janela recente de 25 mensagens por conversa, até 20 conversas, 1 MiB de mensagens e 2 MiB de áudio recebido, expiração de 24 horas. A contabilização exibida é do conteúdo, sem overhead da cifra/serialização.
- O servidor atual não oferece cursor de alterações/exclusões. Reconciliar a janela recente por resposta autoritativa: substituições e exclusões não podem ser ignoradas por um filtro que busque apenas sequências novas. Páginas antigas continuam sob demanda; não alegar sincronização delta de todo o histórico.
- Primeira carga: barra indeterminada acessível, pois não há total conhecido. Reabertura: cópia recente durante conferência em segundo plano; conteúdo só produz recibos após resposta validada.
- Áudio automático desligado por padrão. Preferência explícita permite dados móveis e Wi-Fi; limite por entrada e espaço total, sem reproduzir nem marcar como lido. Não inventar detecção de Wi-Fi no navegador.
- Cada uso de áudio local exige autorização atual e integridade. Download automático não pode bloquear ou duplicar envio. Cancelar trabalho e rejeitar callbacks antigos em troca de conta/contexto, limpeza e saída.
- Configurações: espaço ocupado, limites, opção de download e limpar cópias locais. Não apagar conversas no servidor nem rascunhos/áudios pendentes. Cache pode ser reconstruído depois.

## Validação e entrega

Testar isolamento, expiração, corrupção, callback antigo, logout, perda de acesso, concorrência de download/envio, limpeza, mudanças/exclusões e abertura fria/quente. Medir separadamente acesso remoto e apresentação local. Exercitar IndexedDB real e Android/Keystore real, depois regressão conectada de áudio. Testes simulados não comprovam serviço ou telefone físico. APK e web somente após revisão agrupada.
