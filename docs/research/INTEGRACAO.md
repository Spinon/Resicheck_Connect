# Integração do plano técnico e normativo

Importação em 06/11/2026. Pesquisa recebida da coordenação, versão 1.0, proposto para revisão. Nenhum controle foi implementado, testado ou certificado nesta integração.

## Origem e rastreabilidade

- [Plano no Drive](https://drive.google.com/file/d/1YCQaVZlzitsgCh1t8O6Jk3qe4_qJOGeL/view) e [JSON no Drive](https://drive.google.com/file/d/12tfJicGU0aR7muMkSPB7k2JF1fCswhPC/view), lidos pela integração Google Drive.
- [Snapshot do plano](PLANO-TECNICO-v1.0.source.md) e [snapshot do JSON](BACKLOG-SAUDE-v1.0.source.json), preservados como fonte histórica recebida, não como filas correntes.
- A fila única é [project-board.json](../../project-board.json). Os 48 requisitos R01–R48 aparecem exatamente uma vez em regulatoryRequirements de seus itens executores; as fontes S01–S49 ficam em regulatoryIntegration.sources. Esta tabela é um índice de mapeamento, sem estado próprio.
- Preservados requisito, teste, aceite, natureza, prioridade, responsável sugerido, dependências expandidas e fontes. Responsáveis sugeridos não são pessoas designadas. Evidências documentais de planejamento não substituem implementationEvidence.

## Adaptações às decisões mais recentes

Nome provisório ResiCheck Connect; Android primeiro. Telemedicina fora do escopo; IA apenas administrativa/operacional com encaminhamento humano de demanda clínica. Funcionário fica em uma única empresa inicialmente, por convite válido do gestor com entrada direta, ou por busca sem convite aguardando aceite; paciente pode ter várias e escolhe contexto após login ou vincula nova, sem escolher funcionário e sem aceite manual de gestor acrescentado. Não há unificação de histórico entre empresas.

O cenário R09 de profissional multivínculo foi adaptado a funcionário de empresa única e paciente multivínculo. R07/R08 incorporam as regras acima. R10 usa os quatro níveis solicitados; recepção/clínico/faturamento do texto original são possíveis refinamentos, não perfis aprovados. R06 usa fixtures explicitamente sintéticas, nunca CNPJ real da notícia. Fonte original permanece intacta.

A classificação da informação é prioridade da fundação: gestor, funcionário, paciente e ADM têm destinatários distintos; logs restritos, dados de desenvolvimento, erros internos e conversas privadas do projeto não chegam a usuários comuns. Ver [matriz proposta](../architecture/CLASSIFICACAO-E-PERMISSOES.md). Controle no backend cobre API, realtime, storage, interface, push, exportação e erros.

## Revisão posterior: MVP somente de chat

A primeira fase é cadastro, vínculos e chat humano com anexos e notificações configuráveis; agenda, APIs externas e IA só depois de o app funcionar sem elas. O board reserva fronteiras, sem implementar extensão nem exigir seus provedores. Todos os funcionários aprovados veem todas as conversas dos pacientes da própria empresa. Paciente tem vínculo imediato, dados públicos gerais e próprio chat, sem acervo empresarial. Ver [MVP-CHAT.md](../product/MVP-CHAT.md).

R27 foi realocado para APP-004 com aceite de consistência do chat; reservas/fuso/disponibilidade ficam adiados em APP-005. R31 usa R27 no escopo atual de chat, sem exigir agenda. R43–R48 e os conectores permanecem pós-MVP. R35 foi separado em APP-053: preparar submissão não é condição para APK privado de teste em APP-006. R19 incorpora os quatro níveis de notificação solicitados, com nível 1 por padrão proposto; conteúdo extra nunca supera autorização. Snapshots de origem não foram alterados.

## Correção posterior do fluxo de funcionário

Convite válido enviado pelo gestor vincula e libera entrada direta, sem segunda aprovação. Só cadastro sem convite seguido de busca/solicitação aguarda aceite. Essa decisão supera descrições anteriores de espera nos dois caminhos. R07 e APP-009 foram adaptados; snapshots de pesquisa permanecem como histórico. Segurança técnica de convite (validade, revogação, uso e destinatário/empresa) não pode virar aprovação humana extra. Paciente continua imediato nos dois caminhos.

## Marcos e gates

A: definição e regras de identidade/vínculo R01–R08. B: fundação R09–R27 e demais P0 aplicáveis. C: piloto R28–R31 após os controles pertinentes. D: lançamento R32–R35/R42. E: operação R41. F: IA e conectores R43–R48 com avaliação e controles próprios. Nenhuma data de entrega foi prometida.

P0 bloqueia dados reais ou a função condicional correspondente; P1 bloqueia seu marco; P2 estabelece rotina futura. Revisar aplicabilidade e responsáveis antes de execução. Os controles iOS/Apple aplicam-se à entrega iOS pertinente; compartilhar base não comprova validação iOS. Normas voluntárias não foram convertidas em obrigação legal geral ou certificação. Textos ISO/ABNT integrais pagos não foram adquiridos nesta integração; não inventar cláusulas.

R36–R40 são gates condicionais, sem ativação do público/função. R37 (assistência remota) e R39 (SaMD), citados como dependências de R43, requerem avaliação de enquadramento do escopo administrativo, não implementação de telemedicina/SaMD. Não aplicabilidade precisa de justificativa e gatilho de reabertura, sem marcar implementação inexistente como pronta.

As dependências são critérios Rxx, preservados no board. Quando vários R estão num mesmo APP, não exigir conclusão integral desse APP para executar cada critério: seguir o grafo de requisitos. O planejamento local sintético pode avançar, mas não habilita dados reais, contratação, integração externa ou publicação. Revalidar fontes e regras de loja no marco pertinente.

## Índice dos 48 requisitos

| Requisito | Item executor | Marco | Prioridade de origem | Fontes |
| --- | --- | --- | --- | --- |
| R01 | APP-019 | A — Definição | P0 | S01 S09 S10 S11 S14 S17 S19 |
| R02 | APP-020 | A — Definição | P0 | S01 |
| R03 | APP-021 | A — Definição | P0 | S01 S04 |
| R04 | APP-022 | A — Definição | P0 | S06 S24 S26 |
| R05 | APP-007 | A — Definição | P0 | S01 S24 S26 S46 |
| R06 | APP-008 | A — Definição | P0 | S01 S26 S44 S45 |
| R07 | APP-009 | A — Definição | P0 | S01 S26 |
| R08 | APP-010 | A — Definição | P0 | S01 S26 |
| R09 | APP-023 | B — Fundação | P0 | S01 S08 S26 |
| R10 | APP-011 | B — Fundação | P0 | S01 S08 S26 |
| R11 | APP-004 | B — Fundação | P0 | S01 S26 |
| R12 | APP-024 | B — Fundação | P0 | S08 S24 S26 |
| R13 | APP-025 | B — Fundação | P0 | S24 S26 |
| R14 | APP-026 | B — Fundação | P0 | S24 S25 S32 |
| R15 | APP-027 | B — Fundação | P0 | S24 S26 S38 |
| R16 | APP-004 | B — Fundação | P0 | S01 S24 S26 |
| R17 | APP-004 | B — Fundação | P0 | S26 |
| R18 | APP-004 | B — Fundação | P0 | S01 S26 |
| R19 | APP-028 | B — Fundação | P0 | S01 S24 S28 S30 S35 |
| R20 | APP-029 | B — Fundação | P0 | S24 S25 |
| R21 | APP-030 | B — Fundação | P0 | S01 S07 S08 S26 |
| R22 | APP-031 | B — Fundação | P0 | S01 S07 S11 |
| R23 | APP-032 | B — Fundação | P0 | S01 S29 S33 |
| R24 | APP-033 | B — Fundação | P0 | S02 S03 |
| R25 | APP-034 | B — Fundação | P0 | S01 S26 S38 |
| R26 | APP-035 | B — Fundação | P0 | S01 S05 |
| R27 | APP-004 | B — Fundação | P0 | S26 |
| R28 | APP-036 | C — Piloto | P1 | S24 S25 S26 |
| R29 | APP-037 | C — Piloto | P1 | S24 S26 |
| R30 | APP-038 | C — Piloto | P1 | S24 S25 S26 |
| R31 | APP-049 | C — Piloto | P1 | S21 S22 S23 |
| R32 | APP-039 | D — Lançamento | P1 | S27 S28 S30 S35 |
| R33 | APP-040 | D — Lançamento | P1 | S27 S32 |
| R34 | APP-041 | D — Lançamento | P1 | S28 S34 S35 |
| R35 | APP-053 | D — Lançamento | P1 | S31 S32 S36 |
| R36 | APP-042 | Condicional — avaliar gatilho antes de habilitar | P0 antes de público abrangido | S01 S19 S20 |
| R37 | APP-043 | Condicional — avaliar gatilho antes de habilitar | P0 antes da função clínica | S09 S10 |
| R38 | APP-044 | Condicional — avaliar gatilho antes de habilitar | P0 antes da função | S10 S11 S12 S13 |
| R39 | APP-045 | Condicional — avaliar gatilho antes de habilitar | P0 antes da função | S14 S15 S16 S41 S42 S43 |
| R40 | APP-046 | Condicional — avaliar gatilho antes de habilitar | P0 antes da integração | S17 S18 |
| R41 | APP-047 | E — Operação | P2 contínuo | S37 S38 S39 S40 |
| R42 | APP-048 | D — Lançamento | P1 | S01 S05 S26 |
| R43 | APP-012 | F — Capacidades futuras | P0 da IA | S01 S09 S10 S14 S42 S47 S49 |
| R44 | APP-012 | F — Capacidades futuras | P0 da IA | S01 S05 S26 S49 |
| R45 | APP-012 | F — Capacidades futuras | P0 da IA | S01 S26 S42 S49 |
| R46 | APP-013 | F — Capacidades futuras | P0 dos conectores | S01 S05 S26 S48 |
| R47 | APP-014 | F — Capacidades futuras | P0 dos conectores | S01 S26 |
| R48 | APP-015 | F — Capacidades futuras | P0 da função futura | S01 S26 S49 |
