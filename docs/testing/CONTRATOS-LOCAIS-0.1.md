# Contratos locais de identidade, vínculo e acesso — 0.1

06/11/2026. Trabalho posterior ao APK demonstrativo 0.1.0 build 1. O APK entregue e seu hash foram preservados; esta biblioteca não está conectada ao aplicativo nem publicada no GitHub.

## Escopo observado

TypeScript estrito passou. A suíte local tem 18 testes passando, incluindo um adaptador HTTP temporário em loopback com sessões sintéticas controladas pelo servidor. A primeira execução passou 17 testes e falhou no teste HTTP por `connect EACCES` do sandbox; a execução autorizada fora dessa restrição passou os 18. Não houve mudança de permissões, credenciais, serviços ou segurança do computador.

| Área | Cobertura local |
| --- | --- |
| Papéis e empresa | Matriz de 12 atores em cinco combinações de canal/ação: API leitura/escrita, realtime, storage e push; 60 verificações de permissão, incluindo dois funcionários aprovados da mesma empresa |
| Titularidade | Paciente só próprio chat; troca de empresa e ID; cadeia mensagem/anexo → conversa → empresa, inclusive referência inconsistente |
| Estado atual | Conta suspensa, principal ausente/expirado/inválido, empresa suspensa, funcionário pendente/revogado; principal antigo não restaura vínculo |
| Gestão e ADM | Gestor gerencia somente sua empresa; sem chat automático. ADM requer grant específico de metadados/auditoria; sem conteúdo, diagnóstico bruto ou segredos |
| Projeção e erros | Dados públicos por allowlist; perfil somente titular; listagem e detalhe coerentes; recurso inexistente e proibido têm mesma resposta genérica, sem stack ou sentinelas privadas |
| Vínculos | Convite direto; pedido pendente e aprovação somente gestor da empresa; paciente imediato em várias empresas; repetições sem duplicar |
| Convite e exclusividade | Expiração, revogação, destinatário, emissor sem autoridade, convite ausente; duas ordens serializadas de aceites e convite versus aprovação não ativam funcionário em duas empresas |
| Revogação | Convite consumido não ressuscita vínculo revogado; novo convite também não reativa silenciosamente, até política/comando específico |
| HTTP direto de teste | Alterar role/subject/company em query/cabeçalhos não muda principal; token de fixture desconhecido nega; tentativas por ID retornam resposta genérica e `Cache-Control: no-store` |
| Separação de identidade | Formato/cadastro/contato/identidade distintos; cadastro compatível não concede papel ou conversas |

Os cinco pares de canal/ação da matriz são API leitura e escrita, realtime assinatura, storage download e push destinatário. Exportação permanece negada até política própria; não há entrega real nesses canais.

## O que ainda precisa de integração real

Autenticação/recuperação, sessão revogada, unicidade de CPF/CNPJ e disputa, identidade e representação, proteção de convite bearer, concorrência/transação/rollback de banco, auditoria durável, idempotência persistente, controle no banco e filtros de consulta, storage/URLs, realtime, push, logs restritos e testes Android com backend. Nenhum requisito de segurança de produção foi encerrado com esta suíte.

O principal proposto completo inclui sessão/instantes/contexto; a referência usa só subject/expiração/grants para exercer autorização. O teste HTTP não implementa login e não deve ser exposto. O armazenamento do modelo contém apenas IDs e dados fictícios, sem CPFs/CNPJs, documentos, mensagens de pacientes ou segredos.

## Reproduzir

`npm run access:typecheck` e `npm run access:test` na raiz. Código em `packages/access`; relatório TAP pode ser salvo em `output/access-contracts/`. O servidor de teste escuta somente `127.0.0.1` em porta efêmera e encerra ao fim.
