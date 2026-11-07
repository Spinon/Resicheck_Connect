# Padrão de login e sessão do Connect

Referência revisada em06/11/2026 e nota pública atualizada em07/11/2026. O projeto existente foi examinado somente em leitura, sem executar scripts, consultar pacientes ou copiar credenciais. Esta nota registra requisitos do Connect; detalhes internos do outro produto não fazem parte da documentação pública.

## Abordagem

Separar cliente público de autenticação, serviço Auth injetável, controlador de sessão e telas. URL e chave pública pertencem exclusivamente ao Connect. Chaves secret/service_role nunca entram no APK, bundle ou variável pública. Cadastro autentica uma conta; não concede papel nem comprova CPF, identidade, vínculo ou representação empresarial.

React Native requer ciclo AppState e armazenamento de sessão próprio da plataforma. Um listener deve controlar renovação em primeiro plano; recuperação/confirmação por deep link exige destino validado. Armazenamento genérico não implica criptografia. Avaliar limites de payload, backup e reinstalação antes de selecionar o mecanismo nativo.

## Requisitos de adaptação e testes

- Geração de sessão/contexto deve invalidar callbacks e caches em logout, troca de usuário/empresa e novo login da mesma pessoa. Um SIGNED_OUT não pode ser ignorado por haver atualização de perfil em andamento.
- Timeout não cancela a operação subjacente; sua resposta tardia não pode restaurar sessão/dados. Saída visual imediata não equivale a revogação remota confirmada.
- Perfil ausente, vínculo pendente/revogado ou erro deixam o app em estado restrito recuperável. Não inventar cargo local nem usar metadata editável de signup como autoridade.
- UI apresenta mensagens seguras; diagnóstico detalhado pertence a canal restrito. Erros desconhecidos não são exibidos diretamente.
- Perfil e vínculos atuais são resolvidos no servidor. Paciente seleciona empresa; funcionário tem uma empresa ativa inicialmente. Convite válido do gestor entra diretamente; solicitação por busca aguarda aceite.

## Testes positivos ainda pendentes

O login operacional não está integrado ao APK. O canal administrativo seguro para provisionar fixtures Auth no Connect ainda não está disponível. Testes negativos já documentados não demonstram login positivo nem isolamento completo entre contas reais.

Quando o canal for autorizado e estiver disponível: criar somente contas fictícias via Auth Admin, sem e-mail/SMS; manter credenciais fora de código/chat/logs; preparar vínculos da aplicação com IDs retornados; autenticar como cada usuário comum e testar API/RLS, revogação e troca de empresa. Nunca inserir diretamente em tabelas gerenciadas de Auth nem fabricar JWT. Chave administrativa serve apenas ao preparo/cleanup autorizado, não à prova de acesso do usuário.

Testar Android foreground/background, expiração, reconexão, reinício e logout separadamente. Ao final revogar sessões e remover somente fixtures próprias. Nenhuma credencial ou dado do outro projeto pode ser reutilizado.

## Referências oficiais

- [Supabase Auth no React Native](https://supabase.com/docs/guides/auth/quickstarts/react-native).
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/), sujeito à versão compatível com o Expo instalado.
- [Auth Admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

A análise interna original permanece preservada fora da área versionável. Esta nota pública não contém apontamentos de segurança ou caminhos internos de outro produto.
