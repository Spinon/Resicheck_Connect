# ResiCheck Connect

Entrega conectada atual: **0.0.33/build33**, APK em canal privado e [Web Connect](https://connect.resicheck.com.br/) verificada. [Hashes, provas e limites](delivery/RELEASE-0.0.33.json). Este checkpoint de fonte nao publica binarios nem dispara deploy.

Terminologia atual: o papel de atendimento é **Cliente**, para empresas de diferentes setores. [Compatibilidade técnica e escopo da mudança](docs/product/TERMINOLOGIA.md). A documentação histórica e os APKs já entregues preservam o vocabulário original.

> Demonstração local preservada: [demo Android 0.1.10/build17](docs/delivery/DEMO-0.1.10-BUILD17.md), com mídias locais cobertas ao perder foco e revelação explícita.383 testes/typecheck,19 critérios funcionais+2OS em cada QA/Phone e5 critérios adicionais de pinça/pan no Phone. Continua sem cadastro/chat remoto conectado. [0.1.9 preservada](docs/delivery/DEMO-0.1.9-BUILD16.md).

O estado conectado atual está no [status gerado](docs/project/STATUS.md) e na [fila única](project-board.json). A série de teste conectado usa versões `0.0.x`; o demonstrativo local `0.1.x` acima é uma entrega histórica separada.

Nome de trabalho provisório definido pelo usuário. Android é a plataforma principal; iPhone deve aproveitar a mesma base. Web é secundária.

Primeira fase: cadastro, vínculos e chat com anexos. Agenda, APIs de integração externa e IA ficam para depois de o app funcionar sem elas; reservar apenas fronteiras de arquitetura.

**Registro histórico em 07/11/2026:** [Android0.1.4/build11 no Drive](docs/delivery/DEMO-0.1.4-BUILD11.md), com modais roláveis, digitação adaptada a teclado/fonte ampliada e105 envios locais verificados no Android. [Cobertura e limitações](docs/testing/ANDROID-0.1.4.md). Essa entrega anterior tinha áudio/anexos ilustrativos e não tinha Auth/transporte/push reais. Unicode do banco continua em candidato local com rollout ensaiado; sem alteração online nesta fatia.

## Começar

- [Contratos locais de identidade e acesso](packages/access/README.md), com testes sintéticos separados do APK.
- [Chat local e prévias de notificação](packages/chat/README.md), com retry, autoria e isolamento testados sem serviços externos.
- [Texto Unicode e emojis](packages/text/README.md), com limites por grapheme e fixtures oficiais.
- [Banco Connect e RLS](docs/architecture/BANCO-CONNECT.md), com migração versionada e testes PostgreSQL reais; stack Supabase completo ainda bloqueado pelo Docker.
- **Registro inicial da fundação:** [Supabase online e testes](docs/testing/IMPLANTACAO-SUPABASE-ONLINE.md): migração aplicada e controles de negação verificados. O [diagnóstico Auth 0.0.2](docs/testing/AUTH-OPERADOR-0.0.2.md) teve login e encerramento confirmados pelo operador; cadastro, vínculos e autorização de negócio conectados ainda não estão validados. Essa frase registra a etapa inicial; as validações posteriores de cadastro, vínculos e chat estão no status atual.
- [Status gerado](docs/project/STATUS.md) e [fila única](project-board.json).
- [Escopo e jornadas](docs/product/ESCOPO.md).
- [MVP de chat e decisões atuais](docs/product/MVP-CHAT.md).
- [Notificações e privacidade](docs/product/NOTIFICACOES.md).
- [Imagens compactadas e documentos originais](docs/product/ANEXOS-E-IMAGENS.md).
- [Mensagens de áudio](docs/product/AUDIO.md).
- [Fluxos de cadastro, identidade e vínculos](docs/product/FLUXOS-E-IDENTIDADE.md).
- [Direção visual e temas](docs/product/DIRECAO-VISUAL.md).
- [Comparação e proposta técnica](docs/architecture/PROPOSTA.md).
- [Extensões planejadas de IA e integrações](docs/architecture/EXTENSOES-IA-E-INTEGRACOES.md).
- [Classificação da informação e permissões](docs/architecture/CLASSIFICACAO-E-PERMISSOES.md).
- [Plano técnico incorporado e rastreabilidade dos 48 requisitos](docs/research/INTEGRACAO.md).
- [Plano de testes](docs/testing/ESTRATEGIA.md).
- [Resultado do protótipo 0.1.0 e bloqueio de compilação](docs/testing/PROTOTIPO-0.1.0.md).
- [Ambiente observado](docs/project/AMBIENTE.md).
- [Protótipo instalável, estimativa e desempenho](docs/project/PROTOTIPO-E-DESEMPENHO.md).
- [Entregas e Drive](docs/delivery/ENTREGAS.md).

Node já instalado é suficiente para os comandos de organização, sem `npm install`:

```powershell
npm run project:check
npm run project:status
```

Esses dois comandos verificam apenas a organização. Os comandos `mobile:typecheck` e `mobile:test` verificam o código da demonstração; não substituem teste no Android.

Para código/testes, obter também a dependência compartilhada com `npm ci --prefix packages/text --ignore-scripts`, além de `npm ci --prefix apps/mobile`. Não são necessários para os dois comandos de organização acima. Instalações de projeto por prefixo e lockfiles são preservados.

## Estrutura

```text
apps/mobile/             demonstração React Native/Expo com dados sintéticos
assets/visual/           referências, ícones e imagens aprovadas
docs/                    produto, arquitetura, testes, ambiente e entregas
delivery/                modelos versionados de entrega
output/                  artefatos locais ignorados pelo controle de versão
scripts/                 ferramentas locais sem dependências externas
tests/fixtures/          dados sintéticos compartilhados para futuros testes
project-board.json       fila canônica; STATUS.md é derivado dela
```

A organização aproveita o método do ResiCheck: fila única, status gerado, critérios de aceite e evidências. Nenhum código, agenda ou configuração do ResiCheck foi copiado. O ícone original foi localizado, conferido e reutilizado conforme autorização; ver [origem da marca](assets/visual/ORIGEM-MARCA.md).
