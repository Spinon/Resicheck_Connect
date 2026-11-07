# Protótipo instalável, compatibilidade e desempenho

Atualização posterior: o código da demonstração e seus testes locais já existem; APK/execução Android continuam pendentes. As observações iniciais abaixo são históricas e não representam o estado atual de `apps/mobile`. Ver [resultado 0.1.0](../testing/PROTOTIPO-0.1.0.md). A estimativa deve ser revista após preparar o toolchain e realizar o primeiro build nativo.

Avaliação inicial em 06/11/2026. Não há APK nem código do aplicativo. Estimativas são julgamento de planejamento, sem velocidade medida de implementação, e precisam ser revistas após o primeiro build Android.

## Estado real e pré-requisitos

Confirmados novamente por leitura: `apps/mobile/` contém somente README; não há `node_modules`, lockfile ou dependências mobile no projeto. O package.json atual contém apenas comandos de organização. Node 24.15.0/npm 11.12.1 e Java 17 foram observados na inspeção inicial; SDK Platform/Build Tools 36, ADB, emulador e imagens Android 36 estão disponíveis em disco.

Ainda não comprovados: configuração compatível de Expo/React Native/Gradle, downloads e resolução de dependências, virtualização/AVD utilizável, primeira compilação, assinatura do APK de teste, instalação ou execução. Presença de `android-sdk-license` não é prova de que todos os termos/requisitos necessários estão resolvidos.

O bloqueio anterior de ADB permanece: tentativa de criar `%USERPROFILE%\.android` recebeu permissão negada. A operação não foi repetida nesta etapa e nenhuma permissão ou variável global foi alterada. A primeira fatia precisa resolver o uso autorizado da configuração Android e demonstrar um emulador/dispositivo; emulador.exe existir não prova que ele inicia. Ver [AMBIENTE.md](AMBIENTE.md).

Não foram instalados programas ou pacotes, feitas contratações, criadas contas/chaves ou aceitos termos. Preparar instalações necessárias dentro da autorização aplicável antes de executar.

## Recorte do primeiro APK de teste

Protótipo demonstrativo Android instalável, com dados exclusivamente fictícios: entrar numa sessão de demonstração, alternar papéis/empresa sintéticos, lista de conversas, conversa com envio local e respostas simuladas identificadas, seleção de empresa do paciente, estados de vínculo de funcionário, tema básico e configurações de notificação com prévias sintéticas. Anexo local e prévia podem entrar nessa fatia se não atrasarem o primeiro build.

Objetivo: revisar leitura, ergonomia, navegação, teclado e comportamento básico em APK próprio. O APK de demonstração deve abrir sem depender de Expo Go ou de um servidor de desenvolvimento na máquina do usuário. O modo demonstrativo deve ser explícito: não apresentar troca simulada como autenticação, consulta de CPF/CNPJ, envio persistido em nuvem ou push real. Não usar dados reais nesse protótipo.

Não inclui agenda, conectores externos, importação, IA, confirmação oficial de identidade/representação, backend de produção nem todas as políticas de conformidade. Testar chat real entre duas contas/dispositivos e persistência do servidor é uma fatia seguinte em ambiente sintético, após escolher e preparar backend autorizado; não confundir com a demonstração local.

## Intervalo de planejamento

Para o APK demonstrativo acima: **12–24 horas de trabalho efetivo, aproximadamente 2–4 dias úteis de sessões de desenvolvimento**, depois de disponíveis a instalação autorizada das dependências e um ambiente Android utilizável. A faixa inclui primeira implementação pequena, build, testes básicos e uma rodada de correção. Não é promessa de uma data nem prazo que começa a correr sem execução.

Preparação e diagnóstico do ambiente podem consumir uma sessão inicial de algumas horas; bloqueios de permissão, downloads/SDK, incompatibilidade de versões ou ausência de emulador funcional podem ultrapassar essa sessão. Não é possível limitar o atraso de aprovações ou serviços externos antes de verificá-los. Reestimar após compilar, instalar e abrir o app vazio.

Chat entre duas sessões com autenticação e persistência reais em ambiente sintético deve ter estimativa própria depois da decisão de backend e do teste das permissões. Não prometer produção ou todos os 48 requisitos na faixa do protótipo. Notificação remota, verificação oficial de CPF/CNPJ, política de identidade, compressão final e casos especiais dos indicadores não precisam estar completos para mostrar a primeira demonstração, mas precisam de aceite antes de prometer as respectivas funções completas.

## Versões mínimas e aparelhos antigos

Escolher a menor versão de sistema que a stack estável e mantida, as bibliotecas necessárias e os testes permitam, sem congelar dependências inseguras para ampliar compatibilidade. `compileSdk`, `targetSdk` e versão mínima são conceitos distintos: SDK 36 instalado não significa Android 16 como mínimo.

Na tabela Expo consultada nesta data, SDKs 56–58 listam Android 7+ e iOS 16.4+; os requisitos de compilação variam entre eles. Essa é uma referência para selecionar versão, não configuração já adotada. Candidato inicial: avaliar Android 7/API 24 como piso da stack e confirmar o piso de cada dependência; iOS continua secundário e depende de ambiente Apple e testes próprios. Não anunciar suporte antes de instalar e executar nessa versão. [Expo: compatibilidade por SDK](https://docs.expo.dev/versions/latest/).

O emulador/imagem atualmente presente é Android 36. Testar o mínimo exigirá imagem/dispositivo correspondente, ainda não disponível/validado nesta tarefa. Definir também ABIs suportadas conforme bibliotecas; não prometer todos os aparelhos antigos apenas pela versão do Android. Políticas das lojas e requisitos de segurança serão revalidados na submissão, sem confundi-los com o piso do sistema.

## Orçamento inicial proposto

Metas internas para validar e ajustar após a primeira medição; não são números alcançados ou exigências legais. Usar build de teste representativo de release, sem depurador, identificando tamanho/ABI e aparelho.

| Métrica | Alvo candidato | Condição de medição |
| --- | --- | --- |
| APK Android por ABI alvo | Até 50 MB | Registrar também APK universal separadamente, sem compará-lo diretamente ao tamanho instalado |
| Instalação sem anexos/cache | Até 150 MB | Separar binário, dados e cache; cache precisa de limite/limpeza definida |
| Abertura fria até chat local utilizável | p95 até 3 s | Amostra repetida, dados sintéticos e aparelho modesto definido; separar TTID e TTFD |
| Retorno do segundo plano | p95 até 1 s | Sem rede como condição para renderizar estado local seguro |
| Resposta visual a toque/envio local | Até 100 ms como alvo | Confirmação do servidor medida separadamente; não inventar mensagem entregue |
| Rolagem a 60 Hz | Pelo menos 95% dos frames no orçamento de 16,7 ms | Lista/histórico paginados com carga e dispositivo documentados |
| Memória PSS em conversa comum | Até 200 MB como alvo inicial | Medir início, navegação repetida e estabilidade; processamento de imagem terá pico separado |

Valores precisam ser recalibrados se a linha de base da stack justificar, com trade-off e aceite registrados, não relaxados silenciosamente. O Android classifica abertura fria de 5 s ou mais como excessiva em Android vitals; nosso alvo de 3 s é uma proposta interna mais restrita, não garantia. [Android: startup](https://developer.android.com/google/play/vitals/launch-time).

Evitar carregar todo o histórico, anexos originais ou SDKs de funções futuras no caminho de abertura. Usar paginação, miniaturas, limites de cache e processamento de imagem fora do fluxo crítico de interação; só escolher bibliotecas após necessidade e compatibilidade demonstradas. Segurança e legibilidade não podem ser removidas para melhorar uma medição.

## Matriz progressiva e evidências

Começar por funcionalidade no emulador autorizado; em seguida validar Android mínimo e atual suportados, tela compacta, fonte ampliada, teclado, rede lenta/offline, memória/armazenamento limitados. Alvo de aparelho modesto proposto: 2–3 GB de RAM, identificado por modelo/OS/ABI antes de medições, além de um aparelho intermediário. Nenhum aparelho físico foi identificado ou testado aqui.

Testar carga sintética paginada (por exemplo, 200 conversas e histórico com 10 mil mensagens no conjunto, sem carregá-lo todo), rolagem, troca repetida de empresa/conta, abertura de anexo, compressão e recuperação após sistema encerrar o app. O tamanho final da carga é parte do protocolo a aprovar, não promessa de capacidade ilimitada.

O assistente pode executar testes unitários, de interação, backend e jornadas no emulador quando o ambiente estiver liberado; gerar APK, hash, screenshots/vídeo sintéticos e relatório de cenários/limites. Precisará de dispositivo físico acessível para afirmar desempenho em aparelho antigo, comportamento de fabricante, teclado real e notificações/lockscreen. Número de emulador não comprova desempenho físico. [Android: medição com dispositivo e limite do emulador](https://developer.android.com/codelabs/android-macrobenchmark-inspect).

Pendências para começar: fixar stack/versão mantida; autorizar instalações necessárias; resolver Android/AVD; decidir o recorte visual mínimo do conceito; distinguir demonstração local de backend sintético. Pendências de produto para funções completas: identidade/representação, regras dos indicadores, importância inicial e renotificação, preferências por dispositivo e perfil de compressão. Agenda, IA e conectores não entram nessa lista de pré-requisitos do APK demonstrativo.


## Atualização após autorização e build, 06/11/2026

As pendências de preparação nativa acima são históricas e foram resolvidas com autorização específica: Gradle 9.3.1, NDK 27.1.12297006, CMake 3.30.5 e ADB no perfil normal. APK compilado, instalado e aprovado em cinco jornadas no emulador Android 16/API 36. Não mede desempenho em aparelho físico nem comprova Android mínimo. Ver [relatório atual](../testing/PROTOTIPO-0.1.0.md) e [entrega](../delivery/DEMO-0.1.0-BUILD1.md).
