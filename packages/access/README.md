# Referência local de acesso e vínculos

Biblioteca TypeScript sem dependência de backend, sem serviço público e sem conexão com o APK entregue. Testa invariantes com dados exclusivamente sintéticos. Não é autenticação, banco ou autorização de produção.

`src/contracts.ts` distingue evidências de identidade, conta, principal interno, empresa, vínculo e recursos. `policy.ts` nega por padrão e verifica conta/sessão, empresa, vínculo e cadeia de titularidade. `membership.ts` é uma máquina de estados imutável; `boundary.ts` demonstra projeção de metadados autorizados. O adaptador HTTP existe **somente no teste**, em loopback e com sessões fixas de fixture.

Na raiz do projeto:

```powershell
npm run access:typecheck
npm run access:test
```

O compilador já instalado em `apps/mobile/node_modules` é reutilizado. Nenhuma instalação adicional necessária. O teste HTTP usa porta efêmera em `127.0.0.1`, encerrada ao fim; o sandbox desta sessão exigiu execução autorizada para loopback.

## Limites deliberados

- Principal e snapshot são **entradas internas confiáveis**. JSON do cliente precisa de parser/esquema e autenticador real antes desta fronteira. Tipos TypeScript não validam entrada externa. `subject`, permissões e vínculos nunca são copiados do cliente.
- `Account.state = active` é fixture autoritativa; não define quais evidências habilitam cadastro. CPF/CNPJ, recuperação, contato e representação reais não foram implementados. Consulta cadastral não concede papel.
- Convite modela registro interno já resolvido. Não existe emissor de link, token bearer, assinatura, hash, envio ou validação criptográfica. Destinatário fixo/uso único são parâmetros **de referência para teste**, não decisão final de produto. O convite válido ativa diretamente; não exige aprovação adicional.
- Exclusividade de funcionário é demonstrada em transições **serializadas em memória**, nas duas ordens. Não comprova corrida de banco. Persistência deve validar e gravar convite, vínculo, idempotência e auditoria na mesma transação, com restrição de unicidade. Nada aqui persiste ou registra auditoria durável.
- Não há reativação/transferência silenciosa. Vínculo revogado é negado até existir comando/política explícitos. Pedidos pendentes não reservam exclusividade neste modelo; decisão de produto permanece aberta.
- O código não concede acesso ao gestor sem papel operacional, nem conteúdo ao ADM. Diagnóstico bruto, segredos e material de desenvolvimento são sempre negados por esta fronteira. Painéis ADM futuros precisam de projeções, sanitização, finalidade e auditoria; um grant não libera tabela/linha bruta.
- `authorize` decide permissão; não valida campos de uma escrita, emite push ou transmite arquivos/eventos. `write` não autoriza alterar proprietário, papel, autor ou empresa: adaptadores usarão comandos específicos com valores do servidor. Exportações e escrita genérica de perfil ficam negadas até política/comandos próprios.
- Push testa apenas decisão de destinatário. Payload real, preferências, lockscreen e remoção de assinaturas/caches não estão implementados. Storage testa referência de objeto; URL assinada, conteúdo e revogação distribuída continuam pendentes.
- Listagem em memória projeta apenas metadados permitidos. No banco, filtros precisam existir na própria consulta e no mecanismo de proteção do provedor; não transferir dados globais ao cliente para ocultá-los depois.

Ver [contratos de identidade](../../docs/architecture/CONTRATOS-DE-IDENTIDADE.md) e [relatório de testes](../../docs/testing/CONTRATOS-LOCAIS-0.1.md). Backend/provedor e políticas em aberto permanecem propostas.
