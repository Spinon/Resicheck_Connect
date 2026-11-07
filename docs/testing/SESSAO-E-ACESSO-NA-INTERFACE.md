# Sessão e acesso na interface demonstrativa

06/11/2026. Integração local, reversível e exclusivamente sintética, independente do bloqueio Auth Admin. Sem mudanças no banco, configuração Auth, credenciais, contas ou projeto ResiCheck.

## Comportamento implementado

- A interface usa `createDemoSession` e `useSyncExternalStore`. Tickets de `packages/session` invalidam ações antigas ao trocar conta, empresa, cenário de vínculo ou sair. Voltar de A para B e A não revalida um callback antigo. Logout invalida imediatamente e reinicia os dados fictícios.
- A função dispatch é capturada por render/intent. Ações rejeitadas não executam seus efeitos associados de navegação/modais. Uma revisão independente identificou essa necessidade; foi corrigida e recebeu teste de regressão com callback antigo após logout.
- Seletores de conversa e marcação de importância usam o contrato de `packages/access`. `demo-access.ts` monta um snapshot fictício para consistência da experiência. Não é fonte confiável de autoridade: no app real, contas e vínculos precisam ser resolvidos no servidor e sujeitos a RLS.
- Funcionário fictício aprovado vê as conversas da própria empresa; pendente não acessa; paciente vê seu chat no contexto selecionado. Convite direto e pedido por busca mantêm os comportamentos distintos.
- Trocar empresa oculta mensagens/rascunhos da outra. O rascunho continua guardado por conversa somente em memória e volta ao retornar à empresa, conforme o comportamento já aprovado de rascunhos por conversa. Trocar usuário/cenário limpa rascunhos e reinicia a privacidade em nível 1. Histórico sintético da empresa permanece compartilhado entre cenários de equipe na mesma sessão, como antes; logout reinicia tudo.
- Entrar/sair e selecionar empresa fecham os modais de áudio/anexo e limpam a seleção anterior do chat. A simulação permanece explicitamente identificada; sem gravação, upload, login, push ou envio real.

Arquivos principais: `apps/mobile/src/demo-session.ts`, `demo-access.ts`, `demo.ts`, `App.tsx` e `tests/demo-session.test.ts`.

## Empacotamento

O primeiro export detectou que Metro não enxergava os pacotes fora de apps/mobile. Adicionado `apps/mobile/metro.config.cjs`, baseado no expo/metro-config, com watchFolders restrito à pasta packages. Nenhuma instalação nova, mudança de resolução de dependências ou inclusão de output/credenciais no projeto de arquivos. Este repositório mantém instalações npm separadas por prefixo; não foi convertido silenciosamente para instalação hoisted de workspaces. [Documentação Expo sobre monorepos](https://docs.expo.dev/guides/monorepos/).

## Verificação

- Typecheck do app passou; **24 testes locais** passaram, incluindo sete cenários do store integrado: resposta tardia após logout, troca A/B/A, troca de usuário/privacidade, navegação rejeitada, mudança para vínculo pendente, regras de conversa/importância e fluxos convite/busca/link.
- Pacotes reutilizados: typechecks estritos passaram; **10 testes de sessão e 18 cenários de acesso** passaram. Na tentativa dentro do sandbox, 17 de acesso passaram e o cenário HTTP falhou com EACCES no loopback; esse único cenário foi repetido com a permissão adequada e passou, sem acesso externo nem mudança de segurança do sistema.
- Export web passou após o ajuste Metro. Chromium local executou **27 verificações**, sem erro/warning de console e sem solicitações externas. Mensagens sentinela A/B, rascunhos, ida/volta ao perfil, logout e privacidade, convite direto e pedido pendente foram verificados. Larguras 360/390/1280 sem overflow horizontal. Evidência em `output/session-interface-integration/web/result.json`, screenshots company-b.png/privacy-reset.png; script local `web-check.mjs` na pasta de integração. Playwright/Chromium já instalados foram reutilizados em leitura, com bundle/asset interceptado localmente; não foi aberto painel Auth ou serviço externo.
- Android: **11/11 jornadas passaram, zero avisos**, no emulador próprio Connect_Demo_API36/Android 16. Inclui as dez regressões anteriores e nova ida/volta Horizonte/Centro Vida com mensagens e rascunhos sentinela separados, ida ao perfil preservando contexto e logout removendo ambos. Evidências: `output/android-qa/2026-11-06T20-43-00-453Z/result.json` e 14 pares PNG/XML. AVD próprio foi encerrado ao final; nenhum aparelho físico foi usado.

## Candidato Android local

Build release demonstrativo passou em 30 segundos, ARM64/x86_64, assinatura de teste v2 válida. Artefato separado: `output/session-interface-integration/connect-session-candidate.apk`, **42.054.338 bytes**, SHA-256 **69918a0c67a1919aaefbfc054431cf00af6c7545e09e5453ea4c1a589db3c378**. minSdk24/target36 declarados; compatibilidade com aparelhos antigos não foi demonstrada. Manifesto sem INTERNET/microfone/acesso amplo a arquivos. Não é assinatura de loja nem nova versão publicada.

Resumo, hashes dos fontes, verificação de manifesto/assinatura e resultado de QA em `output/session-interface-integration/build-summary.json`, `apk-manifest-summary.txt` e `apk-signature-verification.txt`. Os fontes empacotados foram conferidos por hash após o build e não mudaram durante os testes.

O APK entregue no Drive permanece exatamente o anterior, hash `bf6e0a4095ac9e7630589f42e2eeea6d3d39cecf6e36968b877c9286cd11e719`. O candidato anterior de navegação, hash `6552c10b7d663e9b928f4a6ba96c56152a130b5695d6c70dc31f229ec5d55897`, também foi preservado. Nenhum upload ou publicação Git foi realizado.

Atualização posterior: por pedido de responsável pelo projeto, esse candidato de sessão foi entregue como **lote2**, sem substituir o primeiro APK. Links, leitura de confirmação e limites em `docs/delivery/DEMO-0.1.0-LOTE2.md`. A frase acima registra o término da integração local antes dessa entrega; o estado de versionamento posterior é registrado no histórico Git, sem alterar os bytes desse lote.

## Limites

Essa camada controla a apresentação simulada. Não prova segurança de backend, validade de token, armazenamento persistido, revogação remota ou login real. O snapshot da demonstração é feito de fixtures locais, jamais de pacientes reais. Mensagens de erro públicas do pacote de sessão estão testadas, mas não há transporte Auth integrado para exercê-las no app.

Auth positivo continua pendente de canal administrativo seguro para fixtures. Não foram fabricados usuários ou sessões por SQL. A próxima integração real depende de canal administrativo seguro para fixtures, onboarding de menor privilégio, adaptador Supabase e armazenamento/ciclo de vida nativo.
