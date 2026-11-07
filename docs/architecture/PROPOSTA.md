# Proposta técnica — 06/11/2026

Estado deste documento: snapshot da recomendação inicial, preservado para explicar a comparação. Atualização em07/11/2026: React Native/Expo/TypeScript já geram APKs demonstrativos Android; a fundação Supabase foi aplicada separadamente no projeto Connect. Auth positivo e transporte real do aplicativo ainda não estão integrados. Consulte [estado atual](../project/STATUS.md), [banco](BANCO-CONNECT.md) e [entregas](../delivery/ENTREGAS.md). As descrições de ferramentas ausentes e ausência de schema abaixo retratam a preparação inicial, não o estado atual.

Escopo da primeira fase atualizado: cadastro, vínculos e chat funcionais sem agenda, integrações externas ou IA. Reservar apenas fronteiras para as extensões futuras, conforme [MVP-CHAT.md](../product/MVP-CHAT.md); não instalar nem exigir provedores dessas extensões para rodar o chat.

## Aplicativo

| Opção | Adequação | Custo de complexidade nesta máquina |
| --- | --- | --- |
| React Native + Expo + TypeScript | Candidata preferida: base compartilhada Android/iOS e opção web; ferramentas de build e distribuição documentadas | Node e parte do SDK Android já presentes; dependências do projeto e emulador ainda precisam ser validados |
| Flutter + Dart | Alternativa forte para uma UI compartilhada e testes unitários, de widgets e integração | Flutter/Dart não encontrados no PATH; instalação e aprendizado da base necessários |
| Kotlin Multiplatform + Compose | Compartilha lógica e pode compartilhar interface Android/iOS | Mais decisões de toolchain e integração nativa; não é a primeira candidata para minimizar preparação |

A preferência por Expo é um julgamento sobre o esforço inicial e o fluxo de entrega, não uma prova de desempenho nem uma decisão definitiva. Antes de fixar: compilar e testar uma fatia Android com teclado, seletor de arquivo, reconexão e navegação.

Android de teste pede APK instalável. AAB é o formato habitual para loja e não substitui o APK entregue diretamente. iOS exige ferramentas Apple: builds podem usar infraestrutura macOS remota, mas simulator iOS não roda neste Windows. Publicação e contas são decisões futuras. Compartilhar código não elimina testes por plataforma.

## Backend

A pesquisa do projeto favorece inicialmente um serviço gerenciado com banco relacional, autenticação, canal em tempo real e armazenamento privado de arquivos. A recomendação de Supabase/PostgreSQL será consolidada com a comparação de custo e operação da pesquisa principal. Nenhum SDK, schema, projeto remoto ou credencial foi criado nesta preparação.

Independente do fornecedor, a proposta deve responder:

- Identidade e autorização por empresa, papel e conversa verificadas no servidor, inclusive em assinaturas em tempo real.
- Mensagens persistidas como fonte da verdade; reconexão recupera o histórico e idempotência evita envio duplicado.
- Arquivos fora das linhas do chat: metadados e vínculo no banco; conteúdo em armazenamento privado com download autorizado e links temporários quando aplicável.
- Revogação de funcionário e sessão remove acesso futuro, inclusive a arquivos e novas mensagens.
- Reserva confirmada precisa de garantia atômica no servidor; um teste com duas sessões simultâneas deve demonstrá-la.
- Notificações são aviso; abrir o app refaz autenticação e consulta. Evitar conteúdo sensível no texto da notificação.
- Backup de banco e recuperação dos arquivos devem ser planejados e testados separadamente.

O Drive é área de entrega de APKs e assets sintéticos, não backend de mensagens nem repositório de documentos de pacientes. TLS e criptografia do provedor não devem ser descritos como criptografia ponta a ponta. Antes de dados reais, definir proteção, retenção, recuperação, auditoria e responsabilidades aplicáveis; esta estrutura não certifica conformidade.

## Organização de código proposta

Começar com um app, agrupando `identity`, `organizations`, `conversations`, `attachments` e `appointments`. Regras não dependem de componentes; acesso a backend fica em adaptadores. Não criar monorepo, engine genérica ou múltiplos serviços sem necessidade demonstrada.

### Extensões solicitadas

Preparar contratos desacoplados para atendimento generativo no chat, API de saída para agendas externas, API de entrada de agendas/serviços e configuração de conectores assistida por IA. O desenho, a separação entre atendimento administrativo e decisões clínicas e os limites de execução estão em [EXTENSOES-IA-E-INTEGRACOES.md](EXTENSOES-IA-E-INTEGRACOES.md). São capacidades planejadas, sem endpoints ou conectores implementados e sem acesso autorizado a sistemas externos nesta tarefa.

Telemedicina está fora do escopo atual. IA planejada para atendimento administrativo/operacional, com encaminhamento humano de demandas clínicas; a circulação de documentos de saúde continua exigindo proteção dos dados.

## Fontes primárias consultadas

- [Expo: serviço de build Android/iOS](https://docs.expo.dev/build/introduction/).
- [Expo: APK para Android](https://docs.expo.dev/build-reference/apk/).
- [Expo: preparação do emulador Android e JDK](https://docs.expo.dev/workflow/android-studio-emulator/).
- [Flutter: plataformas suportadas](https://docs.flutter.dev/reference/supported-platforms).
- [Flutter: tipos de teste](https://docs.flutter.dev/testing/overview).
- [Kotlin Multiplatform: compartilhamento de código/UI e requisitos iOS](https://kotlinlang.org/docs/multiplatform/faq.html).

Revalidar versões e requisitos no momento de inicializar o app; nenhuma versão de framework foi fixada aqui.
