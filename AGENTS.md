# ResiCheck Connect - entrada de toda sessao

## Antes de programar

1. Ler [estado e contexto vivos](docs/project/AMBIENTE.md), [rotina canonica](docs/delivery/ENTREGAS.md#rotina-canonica-de-trabalho-e-fechamento), [STATUS gerado](docs/project/STATUS.md) e `project-board.json`. O board e a unica fila; retomar o ponto registrado, sem duplicar trabalho ou provas.
2. Conferir checkout, branch, HEAD e diff/status antes de editar. Nao sobrescrever trabalho pendente, trocar branch, apagar evidencias nem enviar historico local em massa.
3. Ao terminar a sessao ou mudar uma decisao, atualizar o contexto vivo e o board quando pertinente; executar `npm run project:status` se o board mudar e `npm run project:check` antes de concluir.

## Produto e acesso

- React Native, Expo e TypeScript; Android primeiro, preservando iOS. Web nao substitui Android. MVP: cadastro, vinculos e chat; sem agenda, IA ou integracoes externas antes dessa base funcionar.
- Direcao visual: [DIRECAO-VISUAL.md](docs/product/DIRECAO-VISUAL.md), verde/v0.2 aprovados; slogan: Empresas ao seu alcance. Usar somente logo autorizado e verificado. Aprovacao visual nao prova funcionamento/acessibilidade.
- Separar dominio, acesso e UI com contratos pequenos, sem abstracoes antecipadas ou fornecedor nas telas. Nao copiar implementacao/regras do ResiCheck principal.
- Isolamento aplicado no servidor e em todos os canais: gestor, funcionario, paciente e ADM. Logs e discussao de desenvolvimento nao sao conteudo do usuario comum. Ver [classificacao](docs/architecture/CLASSIFICACAO-E-PERMISSOES.md).
- Funcionario inicialmente tem uma empresa; todos os funcionarios aprovados veem as conversas dos pacientes daquela empresa. Paciente pode ter varias, escolhe contexto e acessa apenas seu chat e dados publicos gerais permitidos. Nao unificar historicos entre empresas. Indicadores de atendente nao sao permissoes; nao inventar desempates. Telemedicina/decisoes clinicas fora do escopo.
- Convite valido do gestor da entrada direta ao funcionario, sem segunda aprovacao. Cadastro por busca/solicitacao sem convite aguarda aceite. Preservar o isolamento de cliente.

## Ambiente, autonomia e limites

- Connect pre-beta, nao live; Supabase hospedado do Connect e o banco dev/homologacao padrao. Usar dados de teste; isolamento local nao e requisito geral. Contexto e autorizacoes vigentes em [AMBIENTE.md](docs/project/AMBIENTE.md).
- Trabalho, decisoes rotineiras, testes normais e janelas de teste do Connect ja autorizados: nao repetir pedidos por rotina. Isso nao contorna cartoes nativos, negativas especificas, verificadores ou controles de acesso.
- Avisar Lucas por risco critico, bloqueio efetivo, custo ou confirmacao obrigatoria; explicar alvo/efeito. Mudanca de escopo por si so nao cria pedido de permissao. Contas, credenciais, instalacao, compartilhamento e publicacao exigem autorizacao correspondente; aproveitar a ja existente quando cobrir a acao.
- Preservar ResiCheck principal, audio funcional, Palworld e demais sites/servicos. Se houver risco de interrupcao, parar e coordenar antes. Sem gastos sem confirmacao. Lucas decidira/avisara a transicao para live e fara o wipe; nao executar reset agora.
- Consultar `supabase/deployment/managed-membership/operator-test-reservation.json` antes de automacao, rotacao ou encerramento de contas/sessoes. Nao reutilizar contas reservadas para Lucas; usar atores separados.
- Nunca incluir dados pessoais reais, senhas, tokens, `.env`, chaves de assinatura ou credenciais em commits, Drive, screenshots ou relatos. Custodia de segredo nao e artefato de entrega.

## Testes e fechamento obrigatorios

- Seguir [ESTRATEGIA.md](docs/testing/ESTRATEGIA.md): testes focados e proporcionais durante dev; regressao agrupada uma vez por APK candidato. Repetir apenas por mudanca, falha ou risco concreto explicado. Nao reabrir piloto de audio resolvido sem regressao observada.
- Distinguir fixture/mock, banco/codec real, backend conectado, emulador e aparelho fisico. Lint, build e screenshot web nao provam Android nem isolamento. Permissoes, persistencia, concorrencia, anexos e Auth exigem integracao real pertinente.
- SEMPRE revisar diff/checks e versionar checkpoint suficiente para outra estacao ao fechar cada lote; validar clone limpo, enviar ao remoto existente em branch propria e verificar ref/SHA, conforme [rotina](docs/delivery/ENTREGAS.md#rotina-canonica-de-trabalho-e-fechamento). Nao e deploy, nao exige PR por ajuste, nao autoriza push em massa nem alterar main. Este lote so sera enviado no fechamento.
- Finalizar imagens antes do lote atual; entao gate/bump unico e trilhas paralelas Android/web com status/evidencias separados no mesmo item do board. APK unico validado no proprio artefato; web mesmo bump; push Git e frente distinta, nao deploy. Publicacao autorizada apenas em `connect.resicheck.com.br` apos os testes; preservar site principal e versoes anteriores.
- Builders: `npm run mobile:build:android:qa` e `npm run mobile:build:android:phone`, entry protegido/PrivacyActivity. Conferir Phone, assinatura, SHA-256 e limites; QA nao prova Phone ou aparelho fisico. Preservar Phone23/historicos. Nao commitar binarios gerados.
- Candidato0.0.33: adapters opt-in mobile:prepare:33, mobile:build:33:unsigned e mobile:inspect:33, sempre com CandidateRoot proprio, conforme apps/mobile/candidates/messaging33/README.md. Historicos23/32 ficam intactos; build/assinatura/deploy exigem gate conjunto. Nao usar builder23 para33.
- Aceite, proxima acao e evidencia no board; `done` demonstra apenas aquele criterio. R01-R48 estao no board; `docs/research/` e historico, nao fila paralela. Entrega inclui versao, SHA-256, instrucoes e evidencias. Drive privado e apoio, nunca fonte de verdade ou banco do chat.
- Modelos: GPT-6.2 Sol medio/alto no cotidiano; Astra 6.2 alto apenas quando a complexidade justificar, com testes proporcionais.
