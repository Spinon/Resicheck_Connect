# Protótipo 0.1.0 — evidências e limites

Data: 06/11/2026. Resultado: código de demonstração implementado e validado localmente; **sem APK e sem execução Android**. A fatia APP-002 não está concluída.

## O que funciona na demonstração

Entrada/cadastro com nome fictício; vínculo imediato e seleção de empresa do paciente; próprio chat; equipe aprovada com todas as conversas da mesma empresa; convite do gestor com entrada direta e espera do funcionário que solicitou sem convite; envio e resposta locais; importância; anexo fictício; ensaio visual de áudio (gravar/parar/revisar/enviar, sem som); perfil; dois filtros e quatro níveis de prévia de notificação. Toda a interface sinaliza demonstração. Verde padrão e ícone original ResiCheck autorizado.

Mensagens e preferências ficam em memória e são reiniciadas ao sair. Não há servidor, autenticação/identidade real, persistência remota, upload, compactação de arquivos, gravação/reprodução de áudio real, push ou permissão de microfone. Não há agenda, IA ou conectores. Seletores de escopo e testes locais não comprovam segurança de um backend.

## Verificações observadas

| Verificação | Resultado |
| --- | --- |
| TypeScript `tsc --noEmit` | Passou |
| `npm test` — modelo local | 13 testes passaram |
| Expo prebuild Android | Passou, arquivos nativos gerados |
| Expo export Android/Hermes | Passou, bundle de aproximadamente 1,5 MB; não é tamanho de APK |
| Prévia web exportada | Passou |
| Playwright/Chrome, prévia local | 19 checagens passaram, sem erros/warnings do console |
| APK/manifesto final/instalação | Não executados: preparação nativa pendente |
| Emulador/aparelho real/iOS | Não executados |
| Desempenho físico, notificações nativas e acessibilidade completa | Não demonstrados |

Os testes de modelo incluem convite direto vs. pedido sem convite, exclusividade da empresa e verificam escopo de paciente/empresa; equipe aprovada e pendente; vínculo sem duplicação; rascunhos separados; envio vazio; anexo e áudio fictícios; importância; privacidade progressiva; reset de sessão; indicadores com empate/sem funcionário. Não definem uma política definitiva de desempate ou implantação clínica.

## QA da interface

Fluxo: abrir prévia → paciente → empresa → chat → mensagem/resposta simulada → anexo/áudio fictícios → perfil → privacidade 1/4 e filtro → equipe e marcação → cadastro → convite direto do gestor → equipe sem segunda aprovação; novo cadastro → busca sem convite → pedido pendente. Capturados 390×844, 360×740 e desktop 1280×900; sem overflow horizontal em 360. Corrigidos nomes acessíveis das abas, estado checked das opções na adaptação web, fonte da prévia e rolagem da última bolha acima do compositor. Isso não prova teclado/áreas seguras Android reais.

Ambiente QA: `http://127.0.0.1:8788`, título `Connect Demo`. Browser plugin não está disponível; usados Playwright 1.61.1 já instalado e Chrome instalado, sem instalar navegador. Servidor e navegador foram executados juntos no mesmo ambiente local e encerrados ao fim. Uma primeira tentativa em ambientes separados teve timeout, sem efeito sobre o produto.

Evidências locais ignoradas por Git: `output/prototype-qa/result.json`, capturas `01-welcome-390.png` a `10-invited-team-390.png`; bundle em `output/mobile-bundle/`; prévia em `output/mobile-web-preview/`. Não são imagens de um APK instalado. O script temporário de QA reutilizou a instalação de Playwright existente sem modificar o ResiCheck.

## Dependências

Expo 57.0.32/React Native 0.86.3 selecionados a partir do template oficial 57.0.34 e catálogo compatível. Safe-area-context ~5.7.0 e system-ui ~57.0.4 seguem o catálogo Expo. Código/fontes e lockfile versionam o protótipo; caches, binários e código nativo gerado são ignorados.

Auditoria npm de execução: 0 altos, 0 críticos e 4 moderados na cadeia `expo`/`@expo/fingerprint`/`glob`/`minimatch`. A correção automática sugerida pelo npm exige downgrade principal do Expo; não foi aplicada. Reavaliar atualização compatível e exposição antes de uso não demonstrativo; não declarar auditoria limpa. Relatório bruto local em `output/npm-audit-mobile.json`. Nenhum dado real foi usado.

## Ação necessária para concluir o APK

As leituras confirmaram ausentes nos locais do SDK/cache: Gradle **9.3.1** (wrapper nativo), Android NDK **27.1.12297006** e CMake **3.30.5** (versões do código React Native). SDK Platform/Build Tools 36 estão presentes. Baixar/preparar esses componentes é uma instalação de ferramentas e grava fora da área do projeto no SDK/perfil quando aplicável, portanto aguarda autorização.

ADB anteriormente negou criar `%USERPROFILE%\.android`; a pasta permanece ausente e a operação não foi repetida nem contornada com redirecionamento de home. É necessário uso autorizado dessa configuração/ADB para validar dispositivo/emulador. Não houve tentativa nova de ADB, aceite de termos ou instalação de NDK/CMake/Gradle nesta fatia. A solicitação de autorização foi apresentada enquanto o trabalho independente de código/QA foi concluído.

Após autorização: preparar componentes oficiais sem aceitar termos pendentes em nome do usuário; compilar APK com bundle embutido; conferir assinatura de teste e manifesto mesclado; instalar/abrir; executar jornadas no Android e registrar limitações. Só então disponibilizar APK e hash como entrega instalável. A geração de bundle ou a QA web não fecha esse aceite.
