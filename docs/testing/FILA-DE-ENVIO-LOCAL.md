# Confirmação e repetição de envio — fatia local

Atualização: a integração posterior com a interface sintética está em [FILA-INTERFACE-0.1.2.md](FILA-INTERFACE-0.1.2.md). O texto abaixo registra a primeira fatia do módulo independente; o transporte permanece fictício.

06/11/2026. Implementação em `packages/chat-client`, sem credenciais, SDK, rede, armazenamento persistente ou integração ao APK entregue. Contribui para APP-004; não conclui o chat operacional.

O cliente distingue `pending`, `sending`, `accepted` e `failed`. `accepted` exige uma confirmação válida e compatível com usuário, empresa, conversa e texto da tentativa. Não significa entrega ao aparelho destinatário nem leitura. Timeout ou falha de rede deixam a aceitação incerta: uma nova tentativa usa o mesmo `clientMessageId` e os mesmos bytes de texto, sem retry automático.

Cada contexto aberto invalida os anteriores, inclusive A → B → A e novo login da mesma conta. Logout e revogação informada pelo integrador limpam a memória e descartam respostas atrasadas. Isso protege a apresentação local; não descobre revogação por conta própria, não cancela um comando já aceito e não substitui autorização atual no backend.

## Evidência

`npm run chat-client:test`: **13 testes passaram**. `npm run chat-client:typecheck`: passou. Os testes incluem promessas controladas e relógio injetado; o cenário de confirmação perdida usa a implementação local `packages/chat/src/chat.ts`: o servidor de referência aceita a mensagem, a confirmação se perde, o cliente repete a mesma intenção e permanece uma única mensagem e um único evento de auditoria.

Outros casos: tentativa duplicada simultânea, confirmação antiga durante nova tentativa, troca de contexto, logout, revogação explícita, resposta de outra empresa/conversa/usuário, texto divergente, dados malformados, erro desconhecido sem diagnóstico na mensagem pública, Unicode composto/NFD íntegro, limites de entrada, capacidade da fila e limpeza de timer com falha.

## Limites

- Apenas memória local e testes sintéticos; não é fila offline durável nem prova de comportamento HTTP, Supabase ou Android.
- A fila tem capacidade técnica configurável, padrão 100 entradas; não representa o histórico completo da conversa. Antes da integração, conciliar e retirar recibos aceitos sem perder mensagens pendentes.
- A geração de IDs e o transporte são injetados; a integração precisa IDs únicos entre sessões e autenticação/autorização reais. Contexto e `sessionKey` não são credenciais.
- Ainda falta integrar os estados às telas, testar transições nativas e recuperar mensagens após fechar o processo. Nenhuma afirmação de entrega/leitura foi acrescentada ao protótipo.
- O APK 0.1.1 e sua assinatura permanecem preservados. Sem publicação Git ou mudanças remotas.
