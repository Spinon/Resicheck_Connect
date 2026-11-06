# ResiCheck Connect — direção visual

Nome provisório e direção definidos pelo usuário em 06/11/2026. O usuário aprovou os exemplos de telas v0.2 e escolheu **verde como cor padrão**. Este documento orienta o produto; tema dinâmico completo e pipeline de logo empresarial continuam planejados. Aprovação visual não demonstra funcionamento operacional ou acessibilidade.

Atualização da implementação: há agora telas demonstrativas React Native e QA em prévia web, com ícone original ResiCheck autorizado. Isso não significa APK, tema dinâmico completo ou validação Android/acessibilidade; ver [resultado do protótipo](../testing/PROTOTIPO-0.1.0.md).

Referências v0.2 fornecidas pela coordenação: [exemplo visual 1](https://drive.google.com/file/d/1DNOU9BjjWfNL-iMPaI7S3XB9J2gkZqvR/view) e [exemplo visual 2](https://drive.google.com/file/d/1gMWO1GeDdqtn_vhBWfiKWO42-Dyf_ai5/view). A aprovação orienta o primeiro protótipo; estes links não foram tratados como prova de execução Android nem como assets finais já incorporados ao código.

## Experiência principal

Android primeiro, limpo, fluido e ergonômico na palma da mão. Referências de familiaridade: WhatsApp e Instagram para listas de conversas, leitura de mensagens, compositor e navegação. Preservar identidade própria, sem copiar telas, marca ou assets dessas aplicações.

Dar prioridade à leitura, à conversa e às ações frequentes alcançáveis com uma mão. Proposta: compositor e ações principais na região inferior, anexar/enviar claramente identificados, teclado sem cobrir a mensagem ou o botão, voltar previsível e contexto da empresa sempre legível. Testar alcance, recortes de tela e barras do sistema no Android; não concluir ergonomia a partir de um mockup desktop.

Fluidez significa resposta rápida e transições discretas que ajudam a entender o estado. Não depende de animações elaboradas. Respeitar redução de movimento, fonte ampliada e estados de conexão/envio visíveis, sem sacrificar a legibilidade para imitar outra aplicação.

## Marca

Nome de trabalho: **ResiCheck Connect**. O usuário autorizou aproveitar o logotipo ResiCheck se encontrado. O arquivo original, variante, origem e adequação visual devem ser verificados antes da incorporação; este documento não afirma que o logo foi encontrado ou copiado. Não modificar o projeto ResiCheck para obtê-lo.

Logo ResiCheck serve à identidade do produto; o logo da empresa identifica a empresa vinculada. Não confundir o upload empresarial com troca da marca do aplicativo. Na ausência de arquivo utilizável, manter nome textual e fallback visual neutro; não inventar um símbolo como se fosse o original aprovado.

## Tema e precedência

| Contexto | Aparência esperada |
| --- | --- |
| Antes de vínculo com empresa | Base neutra/pastel com verde como destaque padrão do Connect |
| Empresa vinculada sem logo ou paleta definida | Mantém o padrão com verde |
| Empresa com logo válido e sem personalização global posterior | Paleta inicial derivada do logo para os vinculados que não tenham preferência pessoal |
| Gestor altera cores globais da empresa | Tema empresarial atualizado para vinculados que seguem o tema da empresa |
| Usuário configura preferência pessoal | Sobrescreve apenas a aparência para esse usuário; não muda a empresa nem a experiência de outros |

Precedência solicitada: **usuário > empresa > padrão**. Aplicar a precedência por token configurável, completando valores ausentes com a camada seguinte. Verificação de acessibilidade e fallback são aplicados ao resultado final; personalização não deve tornar texto, foco ou controles ilegíveis.

Proposta de tokens semânticos: superfícies, texto principal/secundário, destaque, ação principal, bolhas de mensagem e estados de informação/erro/sucesso. Extrair cores candidatas do logo e ajustá-las para uso na interface, em vez de aplicar cegamente a cor dominante a todos os elementos. Cor de marca não substitui sinal de erro ou estado; usar também rótulo/ícone. Pastel é direção estética, não motivo para reduzir contraste de texto.

Claro e escuro precisam de conjuntos de tokens próprios. A política entre seguir o sistema e escolha manual ainda será definida, mantendo a preferência pessoal acima do tema empresarial. Derivar tema escuro preservando contraste e hierarquia; não apenas inverter as cores do logo.

## Cores impróprias e fallback

Logo transparente, monocromático, branco, preto, muito claro, com muitas cores ou sem extração confiável não pode gerar interface ilegível. Usar base neutra/pastel com verde padrão seguro quando faltar candidato adequado e oferecer ajuste pelo gestor. Mostrar preview do resultado antes de confirmar mudanças globais.

Cores personalizadas inválidas ou com contraste insuficiente pedem ajuste/sugestão e preservam a última configuração válida. Falha no upload/extração mantém o tema anterior; não apaga a preferência pessoal. Na primeira configuração sem tema válido, aplicar o padrão do Connect.

Evitar que um novo logo sobrescreva silenciosamente cores globais já escolhidas pelo gestor: como proposta, oferecer nova paleta para revisão. A decisão exata sobre substituição do logo e rederivação ainda será validada com o produto.

## Isolamento e permissões

Somente gestor autorizado altera logo e tema global da empresa. Usuário altera apenas sua preferência. Tema não concede papéis nem acesso a dados; cada atualização global tem empresa, autoria e versão. Troca de conta ou empresa deve carregar o tema correto sem vazar identidade visual ou cache da sessão anterior.

Pacientes podem ter mais de um vínculo e escolhem empresa após login ou vinculam nova; funcionários ficam inicialmente em uma única empresa. Proposta: aplicar tema da empresa no contexto ativo e padrão do Connect em telas sem empresa; a abrangência da preferência pessoal (global ou por empresa) ainda será definida. A troca de empresa nunca deve recolorir conversas de outra empresa nem perder seu rascunho.

## Upload e processamento do logo

Proposta de fluxo: gestor autorizado seleciona imagem → validação de arquivo/tamanho/dimensões e decodificação controlada no servidor → remoção de metadados desnecessários e geração de variante estática segura → extração de cores → preview → salvar versão do logo/tema. Formatos e limites exatos serão escolhidos antes de implementar.

Não confiar apenas na extensão/MIME declarado, aceitar conteúdo executável ou SVG não sanitizado, buscar URLs arbitrárias nem processar arquivos sem limites. Tratar imagem excessiva, arquivo malformado e metadados como entrada não confiável. O arquivo de logo não deve conter dados de pacientes; processamento deve ter acesso mínimo e não usar credenciais de documentos clínicos.

Disponibilidade do logo no diretório público, regras de acesso, retenção das versões e mecanismo de cache serão definidos separadamente; upload não muda compartilhamento de anexos. Usar placeholders e logos sintéticos nas evidências iniciais.

## Critérios visuais e de teste

Adotar como alvo inicial texto comum com contraste mínimo de 4,5:1 e texto grande de 3:1, verificando o resultado de cada paleta no claro/escuro. Referência para esses limiares: [W3C — contraste mínimo](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Isso é um critério específico, não uma declaração de conformidade integral.

Alvo Android: áreas de toque de pelo menos 48 × 48 dp para controles interativos, com espaçamento e rótulos acessíveis. Referência: [Android — tamanho do alvo de toque](https://support.google.com/accessibility/android/answer/7101858?hl=en).

Validar lista de chats, conversa com teclado e anexos, cadastro, vínculo pendente de funcionário e seleção da empresa em Android compacto, fonte ampliada e temas claro/escuro. Vínculo de paciente é imediato. A agenda fica para fase futura e não bloqueia o MVP visual de chat. Cobrir precedência completa, reset pessoal para seguir empresa, logo ausente/inválido, extração sem cores úteis, ajuste global, troca de logo, troca de empresa e sessão. Leitor de tela e foco não podem depender somente de cor. Capturas serão sintéticas; o conceito visual ainda precisa de avaliação na implementação.

## Decisões em aberto

Arquivo e variante do logo ResiCheck; tipografia e iconografia finais; tons/valores exatos do verde e da base neutra/pastel; navegação detalhada; quais tokens o gestor/usuário pode alterar; escolha claro/escuro; preferência pessoal global ou por vínculo; regras de rederivação após trocar logo; formatos/limites e visibilidade do logo. A direção dos exemplos v0.2 já está aprovada, restando implementação e testes. APP-016 a APP-018 no quadro são a fila canônica para essa direção.
