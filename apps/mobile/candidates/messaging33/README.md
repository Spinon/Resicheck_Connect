# Candidato conjunto33 - adapters locais

Os builders historicos23/32 nao foram alterados. Versao/ABIs/permissoes/certificado vem de release-plan.PREPARED.json; template oficial Expo tem pin em TEMPLATE.lock.json. prepare-source.mjs fixa o mesmo conjunto/lock/config-publica para Android e web. Marker de clone proprio e obrigatorio; nao prepara no checkout principal.

1. Clone descartavel curto, deps oficiais dos locks instaladas sem scripts de pacotes; sem copiar node_modules/custodia.
2. Entrada publica aprovada connect-public-config.INPUT.json (somente projeto/URL/sb_publishable), foraGit. Nenhum JWT/senha/admin key.
3. prepare-android.mjs --root CLONE --prepare-only: freeze fonte, inputs/impressaoExpo33 e config stage de prebuild; nao gera APK.
4. Expo prebuild Android --no-install com template local SHA/integridade verificados e dependencias travadas. Namespace legado demo mantido para Privacy; applicationId Phone33 vem do init isolado. app.config.js gerado apenas no clone, App.tsx e app.json de fonte preservados.
5. prepare-android.mjs --root CLONE --apply-native: confere geracao e instala apenas inputs/init isolados no projeto derivado; nao compila.
6. prepare-web.mjs --root CLONE --prepare-only: troca so default export, preserva factory; copia config publica para saida, nao executa exporter/deploy. restore-only exige hashes exatos.
7. Comparar sourceFingerprint/planSha256/publicConfigSha256 dos dois receipts; backend permanece OFF. Testes de configuracao nao sao prova Android/browser.

Novo build-messaging33-android.ps1 -CandidateRoot CLONE -PrepareOnly usa esse contrato. BuildUnsigned exige gate conjunto explicito com a mesma fonte e disponibilidade de imagens, sem guardar chave ou gerar assinatura. Nao usar debug.keystore da geracao como assinatura de release. O inspector33 verifica plano/permissoes/Privacy/ABI/Expo/fingerprint/bundle e certificado esperado sem ler keystore; nao substitui regressao funcional.

Geracao nativa/deps sao locais descartaveis. Nenhum backend, grant, Auth, VPS, audio/Palworld ou frontend principal muda. Assinatura/publicacao so depois do candidato conjunto e seus gates; nunca commitar app.config.js gerado, INPUT, android derivado, tar ou chaves.
