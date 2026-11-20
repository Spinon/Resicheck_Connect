# Prévia de dados por CNPJ — proposta, não implementada

Solicitação: investigar como preencher o formulário empresarial a partir do CNPJ sem confundir consulta pública, criação de cadastro e prova de representação.

## Capacidade confirmada e limite atual

A [documentação oficial do Minha Receita](https://docs.minhareceita.org/como-usar/) descreve consulta GET por CNPJ e campos de razão social, nome fantasia, situação, componentes de endereço e telefones. Valores de contato podem vir vazios. A resposta também contém QSA e dados desnecessários, que não devem ir ao app/cache/log.

No Connect, o decoder createMinhaReceitaSource/decodeMinhaReceitaCompany mantém somente CNPJ, legalName, tradeName, registrationStatus, observedAt/sourceRequestId e mês da base. Ele descarta endereço/telefone e o restante. Isso foi verificado no fonte atual; não foi feita nova consulta de empresa para esta investigação.

A rota atual recebe **somente request_id/operation_id**, depois de o pedido já ter nome e CNPJ. A validação compara o nome informado com o cadastro público e gera prova vinculada ao pedido/sessão/snapshot. Ela não pode preencher um formulário ainda vazio sem alterar esse contrato. O resumo CNPJ desta etapa apenas recupera o número já enviado; não implementa prévia.

## Implementação recomendada

1. Formulário começa pelo CNPJ validado localmente e ação explícita **Buscar dados do CNPJ**. Não consultar a cada tecla.
2. Prévia autenticada no Edge, com as mesmas validações de sessão atual, conta/perfil e limites de tempo da consulta existente. CNPJ é o único dado empresarial enviado; sem aceitar ator, role, empresa ou “prova” do cliente. Não criar empresa/pedido/vínculo ao apenas buscar.
3. Reutilizar o adapter HTTP/frescor atual; acrescentar um decoder de prévia com lista permitida pequena. Proposta de resposta: cnpj, legalName, tradeName opcional, registrationStatus, datasetMonth, endereço estruturado opcional e telefone opcional. Nenhum QSA, CPF de sócio, responsável, e-mail pessoal, capital ou dados brutos.
4. Razão social preenche Nome da empresa; nome fantasia pode ser informação auxiliar, sem criar um campo de negócio novo. Endereço é montado apenas dos componentes válidos disponíveis, limitado a500 caracteres. Telefone vazio/inválido permanece em branco; se preenchido, manter o valor editável e limitado ao contrato atual de80 caracteres.
5. Todos os valores são sugestões editáveis. Mostrar o mês da base e aviso de possível desatualização (regra atual: mês atual/anterior, teto62dias). O usuário confere e toca Enviar solicitação; depois conclui pela jornada normal.
6. Resposta atrasada só vale para a mesma conta, sessão, geração do formulário e CNPJ. Alterar CNPJ/cancelar/sair descarta a prévia. Não sobrescrever silenciosamente campos que a pessoa já editou. Guardar a sugestão somente na memória do formulário.
7. Prévia **não concede acesso nem serve como prova final**. A finalização mantém a validação normal vinculada ao pedido. A primeira versão simples pode exigir uma consulta de prévia e outra na validação final; eliminar essa segunda consulta demandaria um vínculo de prova transacional novo e não deve ser presumido seguro nem implementado por antecipação.

Não precisa de nova VPS, banco de cache, credenciais do usuário ou contratação. Reutilizar runtime/adapters e criar um contrato de prévia separado do comando atual evita tornar a simples edição do formulário uma criação de registros pendentes.

## Contrato inicial proposto

Rota nova e separada: `POST /functions/v1/connect-company-registry-preview`, JWT obrigatório. Corpo mínimo `{p_cnpj:"14 posições canônicas"}`. Resposta found/not-found/unavailable; no caso found, lista permitida com CNPJ, suggestions.name/address/phone opcionais, situação cadastral e mês da base. Não devolver proof_id, conceder papel ou criar pedido.

A autorização deve reaproveitar a validação viva de sessão/conta/perfil, inclusive após logout ou suspensão; o gateway JWT sozinho não basta. Se possível usar o bearer do próprio solicitante nas leituras já autorizadas, sem nova chave administrativa. A integração exata desse gate precisa ser demonstrada na implementação, sem relaxar o gate atual.

## Critérios para implementação futura

- Campos válidos/vazios/parciais; dados desatualizados ou fonte indisponível deixam preenchimento manual disponível.
- Sessão encerrada, troca de conta/CNPJ e respostas fora de ordem não preenchem nem revelam dados antigos.
- Nenhuma escrita de empresa ao consultar; nenhuma ativação sem confirmação e prova final.
- Decoders rejeitam controles/excesso e ignoram campos fora da lista permitida; sem persistir resposta bruta ou QSA.
- Preservar cadastro manual e clientes antigos, inclusive CNPJ alfanumérico no formato já suportado. A disponibilidade de registros alfanuméricos no fornecedor não foi provada nesta rodada.
- Provar no navegador/Android no lote correspondente; dados documentados pelo fornecedor não substituem um teste real.

Atualização: contrato, composição autenticada e formulário editável implementados como candidato local OFF. Evidências e diferenças finais em `docs/testing/EMPRESA-PREVIA-CNPJ-CANDIDATO-2026-11-18.md`. A nova rota teve prova real e permanece instalada/OFF; não há autofill geral habilitado. Resultado atual em `docs/testing/EMPRESA-PREVIA-CNPJ-REAL-FECHADA-2026-11-18.md`.
