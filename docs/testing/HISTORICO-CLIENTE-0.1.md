# Histórico paginado do cliente — referência local

Data: 2026-11-07. Fatia independente de APP-004, sem alterar o APK0.1.3 distribuído ou serviços remotos.

`packages/chat-client/src/text-history.ts` implementa carregamento de páginas do contrato local `listMessages`. Não contém fetch, SDK, credenciais, cache em disco ou assinatura realtime. O chamador injeta transporte e temporizador. Contexto de apresentação não autentica ninguém: o servidor autoriza cada página.

## Comportamento

- Uma requisição em andamento por contexto; cliques simultâneos compartilham a operação. Cursor/limite congelados; usuário, papel e chave da sessão não são enviados como identidade.
- Resposta desconhecida validada integralmente antes de aplicar: mesma empresa/conversa, IDs válidos, ordem crescente, sem duplicados, texto Unicode íntegro e metadados tipados. Página mista/inválida não é parcialmente aplicada. Projeção explícita descarta diagnósticos e campos internos.
- Cursor pela sequência do servidor, aceitando lacunas. Página vazia mantém posição; `hasMore=false` permite atualização explícita de mensagens posteriores. Sem repetição automática.
- Timeout/rede preservam só páginas já validadas; repetir usa o mesmo cursor. Resposta atrasada não modifica a nova tentativa.
- Troca de empresa/conversa/identidade, novo login e logout invalidam handles antigos e descartam operações pendentes. Handle antigo retorna vazio, nunca conteúdo do contexto novo.
- `UNAVAILABLE` limpa texto/cursor e bloqueia o handle até ativação explícita. Rede indisponível não comprova revogação; depende de negativa autoritativa/evento de sessão. Não promete revogação instantânea offline.
- Memória limitada a1000 mensagens/página50 por padrão; páginas entre1–100. Capacidade gera erro explícito, sem descarte silencioso. Orçamentos provisórios; navegação por janelas maiores continua pendente.

## Testes e limites

`npm run chat-client:test`:21 testes,13 de fila preservados e8 de histórico. Integração com servidor de referência em memória e roundtrip JSON: paciente e dois funcionários ativos leem; funcionário revogado, outro paciente da mesma empresa, outra empresa, gestor sem papel operacional, pendente e ADM com privilégios de metadados não leem. Negativa limpa páginas anteriores. Sessões são fixtures sintéticas, sem tokens/Supabase Auth.

Cobertura adicional: páginas mistas, cursores inválidos, duplicação, Unicode malformado, diagnóstico privado, timeout/resposta atrasada, A→B→A, logout, concorrência, memória e callbacks síncronos/reentrantes. TypeScript valida contrato. Sem rede ou portas nestes testes.

Ainda não integrado à interface Android. Adaptador autenticado precisa mapear esquema real para DTO, resolver principal no servidor e comprovar RLS com usuários de teste. Realtime/reconexão, persistência, edição/exclusão e atualização de importância de linhas antigas não estão implementados. Sequência/timestamp são números seguros neste contrato local; timestamp/BigInt do fornecedor exigem conversão validada. Auth positivo e SQLUnicode permanecem pendentes, sem contornar canal negado.
