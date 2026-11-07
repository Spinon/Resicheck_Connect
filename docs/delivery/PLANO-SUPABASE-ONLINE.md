# Candidato de implantação no projeto novo

Preparado em 06/11/2026 e posteriormente executado após autorização específica. Destino confirmado: `https://ibdlvlwdzmsrbqadrudb.supabase.co`, ref `ibdlvlwdzmsrbqadrudb`. **Fundação aplicada na versão20261106200713**, com o hash aprovado abaixo. [Resultado, testes e bloqueio Auth positivo](../testing/IMPLANTACAO-SUPABASE-ONLINE.md). O roteiro abaixo documenta os gates; não autoriza reaplicar a migração ou ampliar escopo.

Custo registrado para o projeto Micro adicional: **US$ 10/mês indicados**, sujeitos a consumo e tributos; não inclui cobrança de outros projetos. [Detalhes do registro](../project/CUSTOS.md).

## Artefato concreto

Migração canônica: `supabase/migrations/20261106200713_connect_foundation.sql`, alinhada à versão remota. Artefato originalmente preparado/aprovado: `supabase/deployment/approved/20261106185009_connect_foundation.sql`. Mesmos bytes e SHA-256 `445da1ce346266e485ae3e8103f2888337d626c5a280f90bb3f80b71d763b0f3`. Manifesto e recibo em `supabase/deployment/`.

[Revisão local do candidato concluída](../testing/REVISAO-CANDIDATO-BANCO.md), com limites e gates explícitos. A autorização desse hash foi recebida e executada; não se estende automaticamente a mudanças futuras. Emoji/graphemes continua requisito não satisfeito integralmente pelos limites atuais.

O candidato revisado limita revogações de grants aos próprios objetos Connect. Substitui o hash local anterior `16d42c11…`; a revisão e o inventário somente leitura foram novamente executados em PostgreSQL 17.9 descartável e passaram 113 assertions RLS, checks de catálogo e três cenários reais de concorrência/rollback. Evidência: `output/postgres-rls/20261106-191101-366`. Auth continua fixture local, sem prova de login/HTTP Supabase.

A migração cria somente o modelo Connect, políticas e comandos descritos em [BANCO-CONNECT](../architecture/BANCO-CONNECT.md). Não cria usuários Auth, sessões, dados de teste, buckets, serviços, agenda, IA, integrações ou chaves. Não altera schema gerenciado Auth/Storage. Não reutilizar as fixtures locais em um remoto.

## Ordem de execução após liberação da coordenação

| Etapa | Evidência necessária antes de avançar |
| --- | --- |
| 1. Confirmar destino/acesso | Conector autorizado identifica o projeto novo e sua URL exata. Parar se ref/URL não baterem, se recurso for ambíguo ou houver negativa. Não consultar a organização/projeto ResiCheck negados nem usar navegador/outra rota |
| 2. Inventário somente leitura | Tabelas/funções existentes, versão PostgreSQL, schema Auth necessário, extensões, histórico de migrações e advisors. SQL preparado em `supabase/deployment/preflight-readonly.sql`; ele não confirma identidade do projeto |
| 3. Revisar candidato | Hash ainda igual; public/private sem objetos de aplicação preexistentes; Auth com funções e colunas esperadas; cliente não privilegiado; versão compatível. Qualquer diferença pede análise e novo candidato, sem sobrescrever ou reparar automaticamente |
| 4. Aprovação específica | Coordenação confirma aplicação desse artefato/hash nesse projeto, além do escopo dos testes/usuários sintéticos e limpeza. A existência da URL ou a intenção de testar online não foi tratada como autorização de escrita por esta frente |
| 5. Aplicar uma vez | Operação de migração DDL no conector autorizado, explicitamente no ref novo. Não usar SQL sem histórico para esconder a implantação. Confirmar versão/histórico e resultado; saída incerta exige leitura de verificação antes de repetir |
| 6. Validar estrutura | Comparar tabelas, FKs, índices, RLS, grants, funções e schemas expostos com o candidato. private deve ficar fora da Data API; wrappers expostos são invoker. Rodar advisors e registrar ocorrências/links sem declarar conformidade automática |
| 7. Criar fixture online autorizada | Usar Auth real e apenas novas contas sintéticas; setup administrativo delimitado ao run. Registrar IDs gerados, sem hardcode de IDs de conta/sessão e sem importar fixtures Auth locais |
| 8. Testar como usuários comuns | JWT real de cada conta e chave pública/publishable, nunca service_role nas verificações de autorização. Repetir a matriz abaixo via Data API e RPCs |
| 9. Encerrar run | Evidências sanitizadas, limpeza dos recursos daquele run conforme aprovação e verificação de resíduos. APK atual continua sem backend até integração e teste próprios |

Se o projeto novo já tiver objetos de aplicação ou alguma migração aplicada, **parar e reconciliar**; não rodar `reset`, drops ou grants globais. O preflight lista apenas metadados, não lê mensagens ou identificadores de usuários. Testar PostgreSQL 17 foi o que ocorreu localmente; outra versão requer revisão de compatibilidade antes da aplicação.

## Fixture online e autenticação reais

Proposta de run: duas empresas sintéticas; gestores A/B; dois funcionários A, um B, um pendente, um convidado; dois pacientes A e um paciente multivínculo; operador com grant administrativo de metadados. Contas e IDs são gerados no run, não copiados do ResiCheck. Sem CPF/CNPJ, telefone real, documento, áudio ou mensagem de paciente. CNPJ permanece nulo; evidências de identidade continuam não confirmadas.

Criar contas por mecanismo administrativo Auth autorizado, restrito ao executor de teste, com endereço fictício e senha aleatória efêmera. Não enviar convites por e-mail/SMS, OTP ou recuperação. Confirmar antes o comportamento efetivo do método no projeto; se houver envio a terceiros, não executar. A documentação suporta `admin.createUser` e confirmação administrativa de e-mail; isso só vale para a fixture, não é verificação de identidade do produto. Nenhuma chave privilegiada entra no app, código, log, relatório ou chat. [Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

Setup da aplicação insere perfil/estado de conta e vínculos sintéticos somente para os IDs recém-criados e empresas daquele run. Fazer login por senha na API Auth real e manter tokens apenas em memória/repositório de segredos autorizado. Os testes recebem o JWT emitido e a sessão criada pelo serviço; não fabricam claims nem inserem linhas em auth.sessions. [Login por senha](https://supabase.com/docs/reference/javascript/auth-signinwithpassword).

**Nunca executar online:** `postgres-auth-fixture.sql`, `rls_cases.sql` ou `concurrency_fixture.sql` locais. Eles criam objetos/linhas Auth ou IDs fixos e estão restritos ao cluster descartável. O plano online exige um runner separado, ainda não executado, com Auth real e IDs retornados pelo serviço.

## Matriz de aceite online

| Caso | Resultado exigido |
| --- | --- |
| Sem sessão/JWT inválido/expirado | Sem conteúdo privado; distinguir falha segura do gateway de sucesso com dados vazios |
| Paciente A1 x paciente A2 | Só conversa/mensagens próprias, inclusive filtragem alterada, busca por ID e chamadas RPC diretas |
| Paciente em A e B | Contextos separados; link imediato; uma conversa por paciente/empresa, sem mistura de histórico |
| Funcionários A1/A2 | Ambos veem todas as conversas de A e respondem com sua própria autoria; B nunca retorna conteúdo de A |
| Convite x busca | Convite válido ativa diretamente sem segunda aprovação; busca cria pendente sem chat até gestor da mesma empresa aprovar |
| Convite inválido/expirado/revogado/outro destinatário | Nega sem ativar/consumir; replay não ressuscita vínculo revogado |
| Duas ativações concorrentes | No máximo uma empresa ativa por funcionário; conflito não revela a empresa alheia |
| Gestor/ADM | Gestão restrita à empresa; gestor sem papel operacional e ADM de metadados não leem chat nem alteram importância |
| Tentativa direta de escrita/promoção | PATCH/POST/DELETE de tabelas, autor/papel/empresa falsos e metadata editável não ampliam privilégios |
| Revogação com JWT ainda válido | Novas leituras/envios/recibos são negados para o vínculo/conta/sessão revogados; verificar sessão real, não apenas logout da UI |
| Retry/ordem/importância | Mesmo ID e um único registro por chave/contexto; payload divergente conflita; sequência e auditoria coerentes; importância só pela equipe e sem toggle acidental |
| Dados internos | Sem acesso a private, contador interno, recibos brutos, diagnóstico, segredo ou conteúdo de desenvolvimento; erros e cabeçalhos sanitizados |

Não comprovar RLS usando somente consultas administrativas do conector: elas podem contornar as políticas. Grants e RLS são camadas distintas; testar respostas HTTP e conteúdo como papéis comuns. [Segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api).

Storage, Realtime, push, áudio, anexos e integração Android continuam fora desta primeira implantação; nenhuma aprovação de estrutura significa que esses canais foram validados.

## Limpeza e retorno

Manter mapa restrito do run com ref, IDs recém-criados e contagens; nunca senhas/tokens. Revogar sessões de teste e parar operações antes da limpeza. Excluir somente recursos explicitamente pertencentes ao run, na ordem das FKs: recibos/auditoria/convites, mensagens, conversas, vínculos, controles/empresas, evidências/contas/perfis e por fim usuários Auth pelo mecanismo administrativo suportado. Se houver referências fora do run ou contagem inesperada, parar sem apagar em cascata. A remoção Auth requer fluxo administrativo no servidor. [Auth Admin deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).

Não gerar `DROP SCHEMA ... CASCADE` nem restaurar o projeto inteiro para limpar fixture. Se a implantação falhar, confirmar o estado/histórico antes de repetir; uma migração transacional falhada não autoriza remover objetos preexistentes. Depois de aceitar escritas, preferir correção versionada e preservar evidência; rollback destrutivo exige plano e autorização próprios. Não tocar em Auth/Storage gerenciados ou em outro projeto.

Relatório final deve separar estrutura aplicada, testes realmente executados, falhas, limpeza e riscos pendentes. Nenhum resultado local é apresentado como teste online. Custo e configuração do projeto ficam sob coordenação, sem contratação ou alteração de plano nesta frente.
