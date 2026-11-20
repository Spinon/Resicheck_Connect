# Elegibilidade de imagens por empresa - candidato local OFF

20/11/2026. Prova hospedada positiva preservada e OFF. Nenhuma operacao no Supabase/VPS, Auth real ou ativacao nesta frente.

## Menor autoridade

A identidade tecnica continua sem conta ativa de aplicativo, membership ou papel de audio. Nao precisa virar funcionario de todas as empresas. Nova tabela privada image_inspector_companies enumera somente empresas atribuidas ao inspetor, OFF por padrao, enabled/revoked_at/valid_until; sem grants diretos a usuarios/servico, RLS e FORCE RLS. Nova funcao auxiliar e SECURITY INVOKER, sem acesso para authenticated; zero novo SECURITY DEFINER.

O servidor escolhe a tarefa dentre empresas explicitamente atribuidas e ativas; o remetente ainda precisa do vinculo atual, conversa propria, sessao e attachment_author_lock. Uma atribuicao administrativa nao libera leitura de conversas ao inspetor. Download/finish dependem do arquivo/hash/tamanho/sessao/lease de30s; revogacao ou vencimento da empresa bloqueia o escopo. Mantem fila serial por inspetor e limite de tentativas.

Seis corpos locais existentes foram adaptados: image_inspector_active, image_inspector_scope_guard, image_authorized_scope, image_claim, image_finish e image_storage_allow. Wrapper/public RPC, ACL/owner/atributos e numero de definers permanecem. Nenhum novo RPC ou grant operacional.

## Runtime

O worker aceita companyIds publicos de configuracao root-owned (1..256, UUIDs unicos), nao enviados pelo usuario do chat. O executor confere a empresa retornada pelo servidor antes de ler bytes; a mesma sessao executa uma tarefa por vez. O decoder privado autentica o UID do worker e confere permit/arquivo/sessao; empresa e metadado da lease, nao uma concessao fornecida pelo cliente. A lista local e defesa adicional: nao substitui a atribuicao no banco.

CONFIG.example permanece enabled=false. O company_id legado do registro image_inspectors fica como metadado/FK, nao e ampliado em memberships. Credencial/identidade nao mudam. Cada empresa nova exige elegibilidade explicita no backend; nao ha acesso global por existencia da conta tecnica.

## Verificacao focada realizada

Quatro despachos do mesmo caso novo em PostgreSQL17 real/loopback: primeiro parou numa comparacao incorreta da fixture (ACL anterior a ativacao local); segundo passou em9862ms. Para remover dependencias de snapshots/provas no checkpoint, a fixture foi portada para fontes sanitizadas: terceira invocacao revelou separador SQL ausente entre definicoes; corrigido sem mudar os corpos, quarta passou em8931ms. Nenhum destes erros mudou o backend hospedado. Helper portatil em supabase/tests/checkpoint-fixture, sem ler reservas/snapshots de prova. Auth/JWT/sessoes eram fixtures SQL; storage era tabela/metadados e predicado real, sem HTTP/codec. Duas empresas, vinculos de autores, fila A/B, outra empresa/sessao recusadas, revogacao imediata, rollback de seis corpos e originais/scopes/eventos preservados. A expiracao foi representada por metadata da fixture, nao espera real. Todos os clusters proprios encerrados.

Um check adicional somente da nova fronteira de roteamento passou uma vez: A/B aceitos na lista, terceiro negado antes de leitura, config invalida recusada e frame IPC exato. Transporte era fixture e parava ANTES de bytes; nao e outra prova ponta a ponta nem nova prova de Auth/Storage/codec. Nao repetir provas de midia/audio.

## Antes do hospedado e rollback

compile.mjs usa bases locais anteriores aos guards temporarios hospedados de rollout/remocao. **NAO e instalador hospedado pronto.** Compor a regra normal com as definicoes oficiais capturadas e fixar o diff/rollback de12 corpos unicos (seis de elegibilidade + oito de rollout, com dois em comum) antes de submeter uma migracao. Preservar tombstone, ACLs/owners, policies de outros recursos, RLS e checks de sessao; nao promover pairs/prazo da prova.

A nova tabela/helper e a alteracao de seis funcoes sao efeito duradouro de seguranca, requerendo revisao/confirmacao aplicavel pelo conector oficial; nao executar o SQL local contra o hospedado nem obter CREATE/SET ROLE por outro caminho. A atribuicao persistente e de empresas enumeradas, nunca wildcard ou membership de usuario. As23 assinaturas/quatro politicas continuam revisao separada, nao foram habilitadas aqui.

Rollback local testado restaura os seis corpos de entrada e desabilita/revoga atribuicoes preservando tabela/linhas para auditoria. No hospedado, usar snapshot exato da baseline real e fechar worker/Storage antes de restaurar; preservar arquivos, mensagens, logs e custodia. Sem novo login, PK/token compartilhado com clientes, imagem publica ou endpoint administrativo.
