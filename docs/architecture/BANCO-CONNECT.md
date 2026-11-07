# Fundação de banco Connect

Implementação local inicial, não aprovação de produção. [Resultado e limites dos testes](../testing/BANCO-LOCAL-0.1.md). Fonte SQL versionada em `supabase/migrations/`; [portabilidade](MIGRACAO-E-PORTABILIDADE.md). Não aplicar esta migração ao ResiCheck: os nomes em public pertencem ao projeto Connect isolado.

Fundação do ambiente online aplicada após autorização específica, versão20261106200713. [Resultados e limites dos testes online](../testing/IMPLANTACAO-SUPABASE-ONLINE.md); login positivo segue bloqueado por falta de canal Auth Admin. Projeto Micro adicional: **US$ 10/mês indicados**, sujeitos a consumo e tributos, separado da cobrança dos demais projetos. [Registro de custo e limites](../project/CUSTOS.md).

## Separação dos dados

| Local | Conteúdo e acesso |
| --- | --- |
| Auth | IDs e sessões do autenticador. No fallback são fixtures; em Supabase serão objetos do serviço Auth |
| public.profiles | Nome de exibição do próprio usuário; sem CPF, contato privado ou flags de autorização |
| public.companies | Somente ID, nome, endereço e telefone gerais; empresa ativa é consultável por conta ativa |
| public.memberships | Papel e estado por conta/empresa; titular vê seus vínculos, gestor autorizado vê os da empresa; sem escrita direta |
| public.conversations/messages | Conteúdo isolado por empresa e titular. Funcionários ativos da empresa acessam todas; gestor/ADM não herdam acesso |
| private | Estado de conta/empresa, evidências independentes de identidade/representação, CNPJ restrito, convites hash, recibos, grants ADM e auditoria. Sem SELECT cliente e fora dos schemas expostos |

Conta/representação e grants não são criados por parâmetro de cadastro nem metadata do usuário. A ativação inicial ocorre apenas em fixture administrativa nesta fatia. Cadastro e verificação reais exigem o adaptador/política apropriados; não existe endpoint público de promoção de privilégio.

## Escritas e integridade

RLS permite leitura autorizada, mas não há INSERT/UPDATE/DELETE direto para anon/authenticated. Comandos expostos são wrappers **SECURITY INVOKER**; suas implementações privilegiadas ficam em private, com `search_path=''`, nomes qualificados e autorização explícita. Não conceder chamadas internas de lock ao cliente.

- `link_patient(p_company)` vincula o próprio paciente imediatamente e cria/reutiliza a conversa, com unicidade empresa/paciente.
- `request_staff(p_company)` cria somente pedido pendente. `approve_staff`/`revoke_staff` exigem gestor ativo da mesma empresa.
- `accept_staff_invite(p_invite,p_token)` ativa diretamente o destinatário após checar hash, validade, revogação e autoridade do emissor. Limite de uso/destinatário fixo nesta referência precisa de política final; não cria segunda aprovação.
- Índice parcial único impede funcionário ativo em duas empresas. Locks de conta e convite serializam comandos concorrentes; papéis de gestor e paciente têm cardinalidades distintas.
- `send_text(p_company,p_conversation,p_client_id,p_body)` verifica acesso antes de deduplicar, fixa remetente/papel/instante e serializa a sequência por conversa. Mensagem, recibo e evento de auditoria gravam na mesma transação. Não significa entregue/lido.
- `set_message_important` atribui booleano idempotente só pela equipe da empresa. Renotificação permanece decisão aberta.

O adaptador de aplicativo converterá `body` para o contrato de texto, `accepted_at` para instante explícito e `bigint sequence` sem perda de precisão; não aceitar autor/papel/data/empresa real do cliente como autoridade. Os contratos TypeScript atuais continuam independentes do APK até integração testada.

Os checks de acesso usam conta/vínculo/empresa e sessão Auth atuais; não autorizam por user_metadata ou claims antigos de papel. A expiração da claim e existência/validade da sessão também são exigidas. Operações administrativas futuras precisam respeitar os mesmos locks e testar concorrência de revogação; isso não foi demonstrado para todos os futuros caminhos.

## Operação e validação pendentes

Não há API de diagnóstico bruto ou leitura irrestrita ADM. Grants de metadados/auditoria são modelados, sem painel ou exportação. Novas tabelas/funções precisam de grants/RLS explícitos e checks de catálogo. Chave service_role nunca pertence ao cliente; nenhuma chave real foi obtida ou criada aqui.

Supabase completo, advisors e REST/Auth não foram executados devido ao Docker. A migração passou em PostgreSQL 17.9 real com fixture Auth e papéis não privilegiados; testar novamente no Postgres/imagens do stack escolhido. Sem Storage, Realtime, push, arquivos ou áudio nesta migração.

Fontes oficiais verificadas: [RLS e funções privadas](https://supabase.com/docs/guides/database/postgres/row-level-security), [funções de banco](https://supabase.com/docs/guides/database/functions), [testes de banco](https://supabase.com/docs/guides/database/testing) e [configuração local](https://supabase.com/docs/guides/local-development/cli/config).
