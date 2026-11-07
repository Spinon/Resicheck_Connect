# Revisão do candidato de fundação

06/11/2026. Artefato originalmente preparado, agora arquivado em `supabase/deployment/approved/20261106185009_connect_foundation.sql`, SHA-256 `445da1ce346266e485ae3e8103f2888337d626c5a280f90bb3f80b71d763b0f3`. Este é o registro da revisão anterior à implantação, não uma autorização independente. [Execução posterior autorizada e mapeamento da versão canônica](IMPLANTACAO-SUPABASE-ONLINE.md). Dados reais continuam fora do escopo.

## Evidência e leitura do candidato

- Migração transacional, sem seed, criação de usuários Auth ou alteração de schemas gerenciados. Grants/revogações nomeiam somente objetos Connect. Preflight remoto observou public/private sem objetos de aplicação e histórico vazio; revalidar se houver mudanças antes da aplicação.
- RLS e ausência de escrita direta nos objetos expostos; estado/identidade/CNPJ, convites, recibos e auditoria em private. Wrappers expostos são invoker; implementações definer têm search_path vazio e nomes qualificados. Cliente não recebe tabelas privadas ou função interna de lock.
- Conta, empresa, vínculo e sessão atuais participam da autorização. Metadata editável não concede papel. Gestor/ADM não herdam acesso a chat. Paciente fica restrito ao próprio contexto; funcionários ativos acessam as conversas da empresa.
- Convite ativa diretamente; busca cria pendente; aprovação/revogação exigem gestor da empresa. Índice parcial e locks preservam uma empresa ativa por funcionário. Emissão de convite e comprovação de identidade não foram implementadas ou presumidas.
- FK composta preserva empresa/conversa, recibo é escopado a remetente/empresa/conversa e autoria é atribuída no comando. Mensagem, recibo, ordem e auditoria são transacionais. Tokens/corpo da mensagem não são copiados para auditoria.
- O candidato passou 113 assertions SQL/RLS, checks de catálogo e três cenários reais de concorrência/rollback em PostgreSQL17.9 com fixture Auth. Destino remoto observado usa PostgreSQL17.11 e apresenta funções/colunas Auth requeridas; isso não substitui a integração real.

## Limites que continuam abertos

Após aplicação autorizada, repetir grants/RLS e testes funcionais via Auth/Data API reais, com usuários comuns, antes de conectar o Android. Advisors atuais foram executados no banco vazio, não sobre as futuras tabelas. Fixture local não comprova JWT, login, sessão real, transporte, erros do cliente, proteção de URL/arquivo ou privacidade de push.

Provisionamento/verificação de identidade e representação, emissão/recuperação/prazo/destinatário dos convites, reativação e acúmulo de papéis precisam de comandos/políticas próprios. Nomes/perfis de participantes não devem ser obtidos ampliando indiscriminadamente a leitura de profiles; projetar DTO autorizado da conversa. Os futuros caminhos administrativos devem seguir a mesma disciplina de locks e testar corridas de revogação.

O requisito novo de [emojis/graphemes](../product/EMOJIS-E-UNICODE.md) ainda não está implementado: char_length e os limites atuais dos clientes não cumprem integralmente essa regra. Resolver de forma coordenada e versionada, sem alterar silenciosamente o hash do candidato após aprovação. Anexos, áudio, Storage, Realtime e push reais continuam pendentes.

Conclusão desta revisão: candidato de **fundação para teste sintético**, com preflight de leitura concluído e limitações documentadas. Próximo gate é autorização específica da coordenação para este hash/ref; depois aplicação única, histórico/advisors pós-schema e testes online. Nenhuma migração foi executada nesta revisão. [Plano de execução](../delivery/PLANO-SUPABASE-ONLINE.md).
