# Imagens compactadas e documento original

Requisito recebido em 06/11/2026. Estado: proposta para implementação e validação com dados sintéticos; pesquisa técnica em andamento. Nenhuma imagem foi transformada nesta etapa.

## Experiência proposta

Oferecer envio de **imagem compactada**, reduzindo tamanho/qualidade com prévia, e opção explícita de **enviar como documento original**. A referência a aplicativos de chat orienta simplicidade de uso; não significa copiar parâmetros proprietários do WhatsApp nem prometer resultado equivalente.

A prévia deve permitir inspecionar/abrir a imagem antes de enviar, apresentar a opção original de modo acessível e evitar compactação silenciosa ao escolher documento. Reduzir bytes não é critério suficiente: guias precisam continuar legíveis. Se o resultado não servir à leitura, o usuário pode voltar e escolher original. Não apresentar prévia como garantia de legibilidade clínica.

Definição do usuário: **compactar no celular antes de enviar ao servidor**, gerando uma cópia otimizada a partir da fonte. A prévia é ampliável e representa o arquivo efetivamente enviado; formato, resolução mínima inicial candidata e qualidade serão registrados e ajustados empiricamente após os testes. O servidor mantém as mesmas validações de segurança dos anexos, independentemente da transformação no cliente. Não substituir o conteúdo depois sem informar.

## Preservação e metadados

- Nunca modificar ou apagar o original na galeria/arquivos do usuário.
- Imagem enviada como compactada é uma representação transformada; manter rótulo e metadados técnicos mínimos de formato/dimensões/tamanho, sem alegar que preserva cada detalhe do original.
- Documento original conserva seus bytes: não rasterizar, recomprimir ou alterar PDF assinado de modo que invalide assinatura. Miniatura é derivada e não substitui o arquivo; download deve corresponder ao original enviado.
- Proposta de privacidade: remover EXIF desnecessário (como localização) da cópia de imagem transformada, tratando orientação corretamente. Verificar o resultado; não prometer remoção por simples troca de extensão.
- Envio como documento original mantém metadados presentes no arquivo, inclusive EXIF/GPS quando existentes, pois seus bytes não são alterados. Explicar essa diferença; não editar silenciosamente original/arquivo assinado sob o pretexto de remover EXIF. Definir com o produto a política transparente de metadados por formato.
- Definir separadamente retenção do anexo transmitido, miniatura e cópias temporárias; não guardar no backend o original anterior à compressão sem finalidade e necessidade explícitas. Expiração/limpeza do cache do app não autoriza excluir a fonte do usuário.

## Segurança e limites

Usar a autorização da conversa e empresa em original, versão compactada, prévia e download. Validar tipo real, tamanho, dimensões, arquivos malformados e limites de decodificação; reduzir resolução não torna arquivo confiável. Não enviar imagens/documentos ao provedor de IA para compactar; nenhuma integração generativa é necessária para o MVP.

Falha na compactação ou validação deve oferecer recuperação compreensível sem enviar arquivo inesperado, perder seleção ou divulgar caminhos internos. Fallback para original precisa ser explícito, pois pode aumentar consumo e preservar metadados. Limites de tamanho, formato, resolução, qualidade e tratamento de imagem multipágina ainda estão em aberto.

## Testes e aceite futuro

Usar guias fictícias com texto pequeno, baixo contraste, sombras, carimbos/linhas finas, foto inclinada/desfocada, orientação EXIF, diferentes tamanhos, QR e código de barras sintéticos. Comparar antes/depois, ampliar no Android e realizar leitura/decodificação dos códigos quando pertinente. Incluir prévia ampliável e arquivo baixado pelo destinatário, não só resultado local. Atendente deve poder ampliar e pedir foto melhor quando a fonte estiver ruim; compressão não restaura foco ou recupera informação ausente.

Medir bytes, dimensões, consumo de memória/tempo e qualidade de leitura por cenário antes de fixar parâmetros. Registrar perfil candidato de resolução mínima e qualidade, testes e trade-offs de leitura, tráfego e desempenho; só promover o perfil após validação empírica. Nenhuma resolução universal nem percentual de redução garante leitura. Validar redes instáveis, timeout/retry, memória, download, original vs compactada e autorização cruzada por empresa/paciente. PDFs, especialmente assinados, não são regravados; comparar hash do original antes/depois e validar assinatura sintética quando aplicável. Criação de fixtures assinadas é uma tarefa futura, não uso de documento real.

Verificar EXIF na cópia transformada, preservação deliberada de bytes no envio original e limpeza da cópia temporária conforme política, sem apagar a fonte do usuário. A pesquisa técnica deve orientar os valores, seguida de testes; nenhum resultado de legibilidade foi demonstrado nesta preparação.
