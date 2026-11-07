# Navegação da demonstração — fatia local de interface

Registro histórico da frente isolada. A integração e validação Android posteriores na cópia principal estão em [INTEGRACAO-INTERFACE-0.1](INTEGRACAO-INTERFACE-0.1.md).

06/11/2026. Cópia isolada em `task-2/interface`, branch local `interface-navigation`. Nenhuma alteração no repositório compartilhado ou no APK build 1 entregue. Sem novas dependências, contas, credenciais, backend ou publicação.

## Comportamento

- Voltar na raiz de paciente/equipe/pendente solicita confirmação antes de reiniciar os dados fictícios. Continuar mantém a sessão; sair explicitamente reinicia os dados.
- Perfil retorna ao contexto de entrada, inclusive quando aberto da lista de vínculos. Tocar novamente na aba Perfil preserva essa origem. Configurações retornam ao perfil.
- Busca de empresa ignora acentos, caixa e espaços nas extremidades. Resultado vazio tem explicação e botão para limpar a busca. Fechar a busca limpa a consulta.
- Chat identifica rascunhos como temporários desta conversa/sessão. Os controles de saída têm rótulos claros, área de toque mínima de 48 dp e o texto de rascunho tem live region. Essas propriedades não demonstram acessibilidade nativa completa.
- Sem alterações em permissões, regras de convite/vínculo, dados clínicos, agenda, IA ou áudio/anexos reais.

## Verificação

| Verificação | Resultado |
| --- | --- |
| TypeScript `npm run mobile:typecheck` | Passou |
| Modelo e navegação `npm run mobile:test` | 17 passaram; 13 existentes + 4 novos |
| Expo export web | Passou |
| Expo export Android/Hermes | Passou; bundle, não APK |
| Playwright/Chrome instalado, execução offline | 20 verificações passaram; zero erros e warnings no console |
| Viewports web | 360×740, 390×844, 1280×900; sem overflow horizontal na lista de vínculos |
| Android nativo/teclado/TalkBack/fonte ampliada | Pendente; ADB não iniciou neste ambiente |

Browser plugin ausente. Playwright foi reutilizado da instalação existente, somente leitura, sem instalar navegadores. A primeira navegação HTTP local em `http://127.0.0.1:8792/` falhou com `ERR_NETWORK_ACCESS_DENIED`. A verificação final carregou HTML, bundle e imagem locais em `about:blank` via `setContent`/`addScriptTag`, sem rede. Isso testa o React Native Web exportado e não substitui o Android. As capturas foram inspecionadas: chat com rascunho, confirmação de saída e busca vazia.

Fluxo verificado: paciente → perfil → aba Perfil → voltar à lista; Horizonte → chat/rascunho → Vida/chat vazio → Horizonte/rascunho restaurado; voltar à raiz → cancelar saída; vincular → busca sem acentos → vazio → limpar; sair explicitamente → nova sessão sem rascunho; convite do gestor → equipe diretamente; cadastro sem convite → solicitação pendente sem conversas.

Evidência fora do Git: `../qa/result.json`, `../qa/navigation-qa.cjs` e capturas `../qa/01-draft-360.png`, `02-confirm-exit-360.png`, `03-empty-search-360.png`, `04-companies-360.png`, `04-companies-390.png`, `04-companies-1280.png` relativos à raiz desta cópia. Exportações ignoradas em `output/`. Avisos de build NO_COLOR/FORCE_COLOR são da ferramenta e não apareceram no console da aplicação.

## Integração e pendências

Aplicar apenas a fatia de código após comparar o hash do App.tsx original; atualizar APP-016 no board da frente principal manualmente, preservando mudanças concorrentes do banco. Não copiar o board/status inteiros desta cópia para o repositório compartilhado. A fatia melhora navegação local; APP-016 continua incompleta até validação nativa e de acessibilidade. Confirmar saída por Voltar físico, cancelar por Voltar no modal, teclado, TalkBack e fonte ampliada em emulador antes de um novo APK. Backend, isolamento efetivo, chat e áudio reais não foram demonstrados.

O Git no diretório compartilhado falhou com `cannot come back to cwd: Permission denied`, impedindo worktree. Foi criada cópia independente com Git local. A criação de junction para dependências também retornou `Acesso negado`; não foi repetida. Dependências existentes foram copiadas para o diretório isolado. ADB falhou com `could not read ok from ADB Server`/`cannot connect to daemon`, sem dispositivo/instalação alterados por esta frente.
