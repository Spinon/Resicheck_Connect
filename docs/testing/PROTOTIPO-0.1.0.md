# Protótipo 0.1.0 — evidências e limites

Data: 06/11/2026. Resultado atual: APK 0.1.0 build 1 compilado, instalado e validado em cinco jornadas no emulador Android 16/API 36. APP-002 concluída como demonstração sintética; backend e chat operacional continuam pendentes. [Entrega](../delivery/DEMO-0.1.0-BUILD1.md).

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
| APK/manifesto final/instalação | Passou; 42.044.422 bytes, assinatura Android Debug v2, permissões verificadas |
| Emulador Android 16/API 36 | Cinco jornadas passaram, sem avisos |
| Aparelho real/Android mínimo/iOS | Não executados |
| Desempenho físico, notificações nativas e acessibilidade completa | Não demonstrados |

Os testes de modelo incluem convite direto vs. pedido sem convite, exclusividade da empresa e verificam escopo de paciente/empresa; equipe aprovada e pendente; vínculo sem duplicação; rascunhos separados; envio vazio; anexo e áudio fictícios; importância; privacidade progressiva; reset de sessão; indicadores com empate/sem funcionário. Não definem uma política definitiva de desempate ou implantação clínica.

## QA da interface

Fluxo: abrir prévia → paciente → empresa → chat → mensagem/resposta simulada → anexo/áudio fictícios → perfil → privacidade 1/4 e filtro → equipe e marcação → cadastro → convite direto do gestor → equipe sem segunda aprovação; novo cadastro → busca sem convite → pedido pendente. Capturados 390×844, 360×740 e desktop 1280×900; sem overflow horizontal em 360. Corrigidos nomes acessíveis das abas, estado checked das opções na adaptação web, fonte da prévia e rolagem da última bolha acima do compositor. Isso não prova teclado/áreas seguras Android reais.

Ambiente QA: `http://127.0.0.1:8788`, título `Connect Demo`. Browser plugin não está disponível; usados Playwright 1.61.1 já instalado e Chrome instalado, sem instalar navegador. Servidor e navegador foram executados juntos no mesmo ambiente local e encerrados ao fim. Uma primeira tentativa em ambientes separados teve timeout, sem efeito sobre o produto.

Evidências locais ignoradas por Git: `output/prototype-qa/result.json`, capturas `01-welcome-390.png` a `10-invited-team-390.png`; bundle em `output/mobile-bundle/`; prévia em `output/mobile-web-preview/`. Não são imagens de um APK instalado. O script temporário de QA reutilizou a instalação de Playwright existente sem modificar o ResiCheck.

## Dependências

Expo 57.0.32/React Native 0.86.3 selecionados a partir do template oficial 57.0.34 e catálogo compatível. Safe-area-context ~5.7.0 e system-ui ~57.0.4 seguem o catálogo Expo. Código/fontes e lockfile versionam o protótipo; caches, binários e código nativo gerado são ignorados.

Auditoria npm de execução: 0 altos, 0 críticos e 4 moderados na cadeia `expo`/`@expo/fingerprint`/`glob`/`minimatch`. A correção automática sugerida pelo npm exige downgrade principal do Expo; não foi aplicada. Reavaliar atualização compatível e exposição antes de uso não demonstrativo; não declarar auditoria limpa. Relatório bruto local em `output/npm-audit-mobile.json`. Nenhum dado real foi usado.

## QA Android concluída

Depois da autorização específica, componentes oficiais e ADB foram preparados no perfil normal. Build Gradle 9.3.1 com NDK 27.1.12297006 e propriedade CMake 3.30.5 passou. CMake 3.22.1 havia causado falha Ninja; a seleção suportada da versão corrigiu sem alterar registro/permissões.

APK autônomo assinado para teste, sem servidor Metro/Expo Go, instalado no AVD Connect_Demo_API36. Cinco jornadas passaram: paciente/empresa/chat; envio local; privacidade de prévia nível 1 e 4; funcionário por convite direto; funcionário sem convite pendente. Capturas verificadas; a prévia completa estava visível. Nenhum aviso na execução final.

Evidência: output/android-qa/2026-11-06T17-27-26-041Z/result.json e seis PNGs/XMLs. Harness reproduzível em apps/mobile/scripts/android-smoke.mjs; recusa dispositivos físicos e exige serial explícito de emulador. Não testa push, áudio, autenticação, segurança de convites ou backend reais. A nota anterior sobre capturas web refere-se apenas à evidência web, agora complementada pela Android.

Manifesto empacotado: minSdk 24, target 36, ABIs ARM64/x86_64; sem INTERNET, RECORD_AUDIO ou armazenamento amplo, backup desativado. Não inclui ARM 32 bits. Android mínimo e celulares modestos continuam sem validação; não foi feita medição formal de desempenho ou acessibilidade completa.
