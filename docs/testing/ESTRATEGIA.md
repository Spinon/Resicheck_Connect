# Estratégia de testes

Estado: plano para implementação futura. Nenhum teste de aplicativo, backend ou dispositivo foi executado nesta preparação.

Prioridade atual: MVP de cadastro, vínculos e chat com anexos, independente de agenda, integrações externas e IA. Cenários dessas funções estão reservados para fases posteriores e não bloqueiam o MVP pela ausência da função. R27 será aplicado ao chat nesta fase; a parte de reservas/agendamento fica adiada.

O assistente deve preparar e executar a maior parte da validação. O usuário revisa o fluxo e o resultado visual e faz uma conferência pontual em aparelho real quando necessária; não deve receber um APK sem evidência e virar o testador principal.

## Camadas e aceite

| Camada | Regressão que deve impedir | Execução prevista |
| --- | --- | --- |
| Domínio | Duplicação de envio, estado de conversa e marcação/importância inválidos; agendamento somente na fase futura | Testes unitários determinísticos na stack escolhida |
| Componentes | Botões sem ação, perda de rascunho, estados de carregamento/erro sem saída | Testes de interação e acessibilidade, com mocks identificados |
| Backend | Leitura/escrita cruzada entre empresas, pacientes ou conversas; anexos públicos | Integração contra backend local/isolado com autenticação real e duas empresas sintéticas |
| Concorrência | Duplicação de mensagem e vínculo indevido; dupla reserva somente na fase futura | Requisições concorrentes pertinentes ao chat e vínculos; teste de reserva quando houver agenda |
| Android | Navegação, teclado, anexos, ciclo de vida e reconexão quebrados | Jornadas automatizadas em emulador, screenshots e logs sanitizados |
| Aparelho real | Problemas específicos de permissões, seletor de arquivo e notificações | Smoke curto após automação; explicitar o que não pôde ser validado |

Ferramentas de interface são propostas, não instaladas: para Expo, avaliar Jest/React Native Testing Library e Maestro ou alternativa compatível no Windows. Para Flutter, testes unitários/widget e `integration_test`. Só fixar a ferramenta após demonstrar que funciona no ambiente. Playwright pode validar uma futura superfície web; não cobre o APK.

## Jornadas mínimas do candidato Android

1. Cadastro de empresa e funcionário; entrada de paciente pelo convite, inclusive com app fechado ou ausente.
2. Paciente envia mensagem; equipe recebe e responde; fechar/reabrir preserva histórico.
3. Perder internet durante envio, voltar e verificar ordem e ausência de duplicatas; sessão expirada oferece recuperação.
4. Anexar PDF e imagem sintéticos, negar permissão, cancelar seleção, interromper upload, reenviar e abrir o anexo autorizado. Validar tamanho e tipo no servidor, incluindo extensão enganosa.
5. Empresa B não lista, busca, assina eventos nem baixa anexos da A. Paciente A2 não acessa conversa A1. Funcionário removido perde acesso. Repetir tentativas por IDs e caminhos diretos.
6. Todos os funcionários aprovados da mesma empresa leem todas as conversas de seus pacientes, sem depender de atribuição; pendente/revogado e outra empresa não acessam. Indicadores de principal/última mensagem seguem critérios definidos antes de implementar. Criar/remarcar/cancelar e concorrência de reserva ficam para a fase futura de agenda.
7. Sair e trocar conta sem expor conversa ou cache da sessão anterior. Notificação abre o destino somente após autorização atual.

## Extensões de IA e integração — testes futuros

Esses cenários não são pré-requisitos para rodar o MVP sem IA ou conectores. A futura apresentação como assistente virtual, explicação de camada adicional para evitar filas, tomada humana a qualquer momento e resumo do atendimento devem ser testados quando a fase for autorizada.

Critérios para quando as [extensões planejadas](../architecture/EXTENSOES-IA-E-INTEGRACOES.md) forem implementadas; nenhum cenário foi executado nesta preparação:

- IA só obtém contexto da conversa/empresa autorizada. Conteúdo malicioso em mensagem, anexo ou documentação externa não altera política, dispara exportação nem revela outras conversas, dados ou segredos.
- Operação administrativa permitida segue validação determinística e autorização atual. Ação de risco sem revisão necessária é negada; confiança declarada pelo modelo não libera execução. Telemedicina e decisões clínicas estão fora do escopo atual: demanda clínica gera encaminhamento humano, sem resposta substantiva autônoma e sem usar revisão posterior como justificativa para automatizá-la.
- Handoff humano, suspensão e falha do provedor não produzem resposta concorrente do bot, sucesso inventado ou repetição de efeito. Auditoria distingue autoria, rascunho, revisão, envio e ação externa.
- Contratos de entrada/saída rejeitam origem não autorizada, escopo errado, payload inválido e troca de empresa. Exportação contém apenas campos autorizados; anexos/chat não são enviados por padrão.
- Timeout após sucesso, retry, chave repetida com payload igual ou divergente, evento fora de ordem e callback duplicado preservam idempotência e consistência. Sincronização bidirecional não cria ciclos nem sobrescreve estado mais novo sem política.
- Importação de disponibilidade não confirma reserva sem o sistema autoritativo. Conflito de horário, fuso, procedimento sem correspondência, ID externo ambíguo e falha parcial vão para tratamento definido.
- Destino inválido ou fora do permitido, credencial revogada e conector desativado não geram novas trocas. Logs e evidências permanecem sanitizados.
- Adaptador/mapeamento sugerido por IA passa por testes de contrato e revisão em ambiente isolado antes de ativação autorizada. Sem credenciais, rede de produção ou execução direta de código gerado pelo modelo.

## Matriz progressiva

### Informação por papel e temas — critérios futuros

- Executar a matriz de [classificação e permissões](../architecture/CLASSIFICACAO-E-PERMISSOES.md) por gestor, funcionário, paciente, ADM e usuário anônimo, com empresa e objeto corretos/incorretos. Negar leitura, busca, escrita, exportação e assinatura fora do escopo, não apenas ocultar menu.
- Provocar erros: mensagem pública segura e código opaco; stack, SQL, caminhos internos, segredos e sentinelas de desenvolvimento não aparecem em interface, API, push, exportação ou resposta de IA. Verificar acesso restrito aos logs e segregação de ambientes.
- Funcionário com vínculo em A não ganha segundo vínculo em B por convite, busca, aceite concorrente ou chamada direta. Política de pendências/transferência precisa estar definida sem migrar histórico.
- Paciente com A/B escolhe empresa após login ou vincula nova, com vínculo imediato. Só acessa nome/endereço/telefones públicos e próprio chat/anexos; troca de contexto separa conversas, cache, rascunhos, ações em voo e realtime. Não unifica histórico clínico. Agenda será coberta apenas na fase futura.
- Validar a [direção visual](../product/DIRECAO-VISUAL.md) no Android compacto: leitura, alcance com uma mão, teclado, fonte ampliada, leitor de tela, redução de movimento e áreas de toque.
- Tema segue usuário > empresa > padrão no claro/escuro, incluindo ausência de logo, cores inadequadas, falha de extração, reset pessoal, atualização global e troca de empresa/sessão. Usuário comum não altera tema global; gestor não altera preferência de outro usuário.
- Upload de logo malformado, excessivo, com extensão enganosa ou conteúdo ativo é rejeitado/normalizado conforme política e não apaga o último tema válido. Capturas e logos de teste são sintéticos.

### Cadastros e vínculos definidos em 06/11/2026

Acrescentar testes do [fluxo detalhado](../product/FLUXOS-E-IDENTIDADE.md) quando implementado:

- Funcionário com link e sem link termina pendente; acessar APIs, eventos e anexos antes do aceite é negado. Aprovação libera só o escopo autorizado; recusa/revogação efetivamente remove acesso, inclusive com sessão já aberta.
- Paciente com link e pela busca tem vínculo imediato e entra na conversa com a empresa sem selecionar funcionário, sem fila de aceite do gestor. Paciente não obtém papel de funcionário ao alterar parâmetros do link ou da requisição.
- CPF com formato válido não recebe marca de identidade confirmada; consulta indisponível, divergência cadastral e contato confirmado preservam estados distintos. Testes usam respostas sintéticas do provedor, nunca consultas de CPF/CNPJ reais.
- Cadastro repetido e pedido duplicado não criam contas/vínculos redundantes nem revelam a terceiros se um CPF tem conta. Recuperação e contestação têm cenários próprios.
- CNPJ localizado sem prova de representação não dá acesso de gestor. Disputa, filial e substituição de gestor não transferem acesso silenciosamente.
- CNPJ numérico e alfanumérico passam pelo cálculo oficial dos dígitos, sem perder zeros ou rejeitar letras na interface/armazenamento. Fixtures serão sintéticas, sem copiar números reais das fontes. Se Consulta CPF v3 for escolhida, testar também CPF/data de nascimento ausente ou divergente e falha do provedor.
- Busca pública de empresas não devolve usuários, CPFs, pacientes, conversas ou anexos. Link inválido, expirado ou revogado não amplia acesso.
- Usuário comum e gestor empresarial não acessam painel da plataforma. Operador sem privilégio de conteúdo não lê chat/anexo por tela, API, exportação ou personificação. Logs e evidências não contêm documentos, tokens ou CPF integral.

Os controles acima são critérios futuros, não testes já executados.

### Notificações e compactação de imagens

Executar os cenários detalhados em [NOTIFICACOES.md](../product/NOTIFICACOES.md): dois filtros, quatro níveis, configurações por usuário/dispositivo, permissão do sistema negada/revogada, lockscreen e payload real sanitizado. Testar marcação por funcionário autorizado e tentativas proibidas por outros papéis; importância inicial e reenvio após marcação aguardam decisão de produto.

Executar os cenários de [ANEXOS-E-IMAGENS.md](../product/ANEXOS-E-IMAGENS.md): prévia e opção original, texto pequeno, QR/códigos sintéticos, bytes/dimensões, EXIF, hash de original/PDF assinado sintético e preservação da fonte do usuário. Nenhum percentual de compactação ou garantia de leitura foi validado.

Começar por uma imagem Android instalada, tela compacta, fonte ampliada e teclado aberto. Depois incluir versão Android mínima escolhida, versão alvo, segundo tamanho e aparelho real. iOS entra antes de prometer entrega iPhone. Não declarar uma matriz validada por presença de SDK ou por sucesso de build.

## Evidências e divisão de trabalho

Cada execução registra data, commit/revisão quando houver Git, versão/build, dispositivo/API, dados sintéticos usados, comando, resultado, falhas e limitações. Screenshot demonstra aparência; teste de autorização precisa demonstrar tentativa permitida e negada no backend. Anexar só logs e imagens sanitizados ao lote de teste.

Primeira preparação verificou apenas board/status e a estrutura local. Os cenários acima permanecem pendentes no board. Não usar percentagem de cobertura como critério único de qualidade.
