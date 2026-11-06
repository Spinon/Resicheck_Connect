# ResiCheck Connect

Nome de trabalho provisório definido pelo usuário. Android é a plataforma principal; iPhone deve aproveitar a mesma base. Web é secundária.

Primeira fase: cadastro, vínculos e chat com anexos. Agenda, APIs de integração externa e IA ficam para depois de o app funcionar sem elas; reservar apenas fronteiras de arquitetura.

**Estado em 06/11/2026:** estrutura de trabalho criada; aplicativo, backend e APK ainda não implementados. Nenhum serviço foi contratado e nenhuma dependência foi instalada por esta preparação.

## Começar

- [Status gerado](docs/project/STATUS.md) e [fila única](project-board.json).
- [Escopo e jornadas](docs/product/ESCOPO.md).
- [MVP de chat e decisões atuais](docs/product/MVP-CHAT.md).
- [Notificações e privacidade](docs/product/NOTIFICACOES.md).
- [Imagens compactadas e documentos originais](docs/product/ANEXOS-E-IMAGENS.md).
- [Fluxos de cadastro, identidade e vínculos](docs/product/FLUXOS-E-IDENTIDADE.md).
- [Direção visual e temas](docs/product/DIRECAO-VISUAL.md).
- [Comparação e proposta técnica](docs/architecture/PROPOSTA.md).
- [Extensões planejadas de IA e integrações](docs/architecture/EXTENSOES-IA-E-INTEGRACOES.md).
- [Classificação da informação e permissões](docs/architecture/CLASSIFICACAO-E-PERMISSOES.md).
- [Plano técnico incorporado e rastreabilidade dos 48 requisitos](docs/research/INTEGRACAO.md).
- [Plano de testes](docs/testing/ESTRATEGIA.md).
- [Ambiente observado](docs/project/AMBIENTE.md).
- [Protótipo instalável, estimativa e desempenho](docs/project/PROTOTIPO-E-DESEMPENHO.md).
- [Entregas e Drive](docs/delivery/ENTREGAS.md).

Node já instalado é suficiente para os comandos de organização, sem `npm install`:

```powershell
npm run project:check
npm run project:status
```

Esses comandos verificam apenas a organização. Não compilam nem testam um app.

## Estrutura

```text
apps/mobile/             lugar reservado ao aplicativo multiplataforma
assets/visual/           referências, ícones e imagens aprovadas
docs/                    produto, arquitetura, testes, ambiente e entregas
delivery/                modelos versionados de entrega
output/                  artefatos locais ignorados pelo controle de versão
scripts/                 ferramentas locais sem dependências externas
tests/fixtures/          dados sintéticos compartilhados para futuros testes
project-board.json       fila canônica; STATUS.md é derivado dela
```

A organização aproveita o método do ResiCheck: fila única, status gerado, critérios de aceite e evidências. Nenhum código, agenda, identidade visual ou configuração do ResiCheck foi copiado nesta preparação. O reaproveitamento futuro do logo ResiCheck está autorizado pelo usuário e depende de localizar e verificar o arquivo.
