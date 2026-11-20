# Guard normal, historico e acesso - candidato OFF20/11/2026

Guia de aplicacao/reversao: [INSTALL-NORMAL.md](../../../runtime/image-node/normal/INSTALL-NORMAL.md). Nenhum SQL remoto executado nesta rodada.

- compile.mjs:12definicoes pinadas/8corpos alterados, duas tabelas RLS/FORCE RLS novas, helper INVOKER privado. Historico v3 depende apenas da sessao/autoridade de conversa/tombstones, nao do flag de imagens; bytes/imagem continuam pelo autorizador fechado por empresa.
- prepare-managed.mjs: SET/CREATE temporarios na mesma transacao oficial, restaura schemaACL e dois grantors/opcoes antes de commit. Nao concede autoridade de manutencao ao worker. Hashes atuais em managed-metadata.PREPARED.json; hashes em relatos anteriores sao historicos.
- normal-access.mjs:23EXECUTEs authenticated, quatro politicas Storage pinadas, empresa e inspetor exclusivo por30dias. DefaultOFF; nao usa pares/sessao de prova, nao amplia memberships.
- close.NORMAL:21revogacoes de imagem,2RPCs de historico mantidos para nao quebrar texto/audio no cliente33, quatro politicas restauradas, empresa/inspector/scopes OFF. Idempotente. Nao chamar de restauracao integral da ACL anterior.
- restore.BASELINE-ACL: so apos rollback de clientes para v2 compativel e SETLOCAL explicito; revoga os2RPCs. Entao rollback.MANAGED restaura corpos originais sem apagar tabelas/linhas.

Novas evidencias: history-off-validation.json (PostgreSQL real, Auth/vinculos/envelopes fixture); normal-access-validation.json (PostgreSQL real,23funcoes inertes/settings/politicas fixture). Falha injetada reverte DCL/settings; close repetido passa. Nao provam capacidade do provedor hospedado, codec, UI ou Android. Provas hospedadas/Linux anteriores nao repetidas.
