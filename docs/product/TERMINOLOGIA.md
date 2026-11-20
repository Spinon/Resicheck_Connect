# Cliente: vocabulário do produto e compatibilidade

Decisão de Lucas em 10/11/2026: usar **Cliente** no lugar de **Paciente** na documentação atual. O Connect é um produto de comunicação e atendimento entre empresas e seus clientes, aplicável a diferentes setores. A mudança de nome não cria um novo papel nem restringe o produto à saúde.

## Regras preservadas

Cliente pode ter vínculo com várias empresas e escolhe o contexto; vê apenas seus próprios chats/anexos e os dados gerais públicos permitidos da empresa. O vínculo de cliente continua imediato por link ou busca, com autenticação e verificações da conta aplicáveis. Funcionários aprovados e ativos veem as conversas dos clientes da própria empresa. Gestor sem papel operacional e ADM não herdam conteúdo de conversa. Separação por empresa, autoria, revogação, idempotência e demais controles permanecem iguais.

Exemplos antigos de saúde, consulta/exame e documentos clínicos descrevem contextos específicos ou extensões futuras; não tornam esses casos um requisito universal do produto. As exclusões de telemedicina/decisões clínicas e a proteção de dados sensíveis permanecem. Agenda, integrações e IA continuam fora da primeira fase. Esta revisão de vocabulário não aprova método de identidade, fornecedor, ativação, representação ou novas regras de negócio.

## Mapa técnico, sem migração

| Termo de produto | Identificador existente preservado | Interpretação |
| --- | --- | --- |
| Cliente | `patient` | Mesmo papel técnico de vínculo e autoria; não introduzir valor `client` nas APIs ou banco. |
| Titular cliente de uma conversa | `patient_id` | Mesmo identificador técnico; não renomear coluna, campo, FK ou payload. |
| Vincular como cliente | `link_patient` | Mesma RPC e autorização; nome de apresentação não muda rota nem parâmetros. |
| Cliente nos testes antigos | Nomes de fixtures, IDs, marcadores e arquivos que contêm `patient` | Permanecem reproduzíveis; nenhum ator, dado ou recibo é reescrito. |
| Aplicativo cliente / cliente HTTP | Termo técnico já existente | Refere-se ao software chamador, não necessariamente ao papel Cliente. Usar qualificação quando houver ambiguidade. |

Identificadores TypeScript, SQL, APIs, enums, chaves de cache, métricas e dados persistidos não são alterados por substituição textual. Uma eventual migração técnica exigiria escopo próprio e compatibilidade demonstrada; não é necessária para adotar Cliente como nome de produto.

## Documentação e interface

As normas atuais de escopo, jornadas, permissões, mídia, notificações e arquitetura usam Cliente. Registros datados, snapshots de pesquisa, testes, recibos de entrega, imagens aprovadas e APKs preservam o vocabulário observado. Ao consultá-los, interpretar o papel Paciente como o mesmo papel hoje chamado Cliente, sem reinterpretar seus resultados ou limitações. O status e a fila atuais continuam em [STATUS](../project/STATUS.md) e [project-board.json](../../project-board.json).

A adequação futura da interface deve ser registrada e priorizada nessa fila única: revisar textos visíveis e rótulos de acessibilidade de vínculo, escolha de contexto, listas e conversas; preservar contratos técnicos; testar ambos os papéis e validar no próprio Android antes de anunciar a mudança no APK. **Esta fatia altera somente documentação: não modifica telas, rótulos, testes de interface, APK, backend ou dados.** Os arquivos AGENTS.md e a fila/status são mantidos pela coordenação nesta rodada.
