# Entrega Android demonstrativa 0.1.1 / build2

06/11/2026. Correção do balão de áudio e suporte local a emojis, com os APKs anteriores preservados. Nenhum código novo foi publicado no GitHub.

- [APK0.1.1](https://drive.google.com/file/d/1r3RnuCEdTyaL9rE2-TvB37oFw91EXl14/view?usp=drivesdk)
- [Instruções](https://drive.google.com/file/d/19WRDWyCGm9-OMb7qTNuJsVYQ4JD9Ai-m/view?usp=drivesdk)
- [Manifesto](https://drive.google.com/file/d/1fijlIVxajMiano6ePNExJlavSkyxCaoz/view?usp=drivesdk)
- [SHA-256](https://drive.google.com/file/d/1VCZ2C5mZk5fAZP8Slk0NIXNcwnGSLEKa/view?usp=drivesdk)
- [QA Android consolidada e limites](https://drive.google.com/file/d/1v9csPMrCMNnvUk6FqdaBKePbBY_nJOyN/view?usp=drivesdk)
- Comparação nativa própria: [antes0.1.0](https://drive.google.com/file/d/1vX2sDyBuwi2BelpszSTbWNYNvVzeC2vz/view?usp=drivesdk), [depois0.1.1](https://drive.google.com/file/d/1koCGQN1o8SuJg29qpuV0DESQWBn924A9/view?usp=drivesdk).

Arquivo `resicheck-connect-demo-0.1.1-build2-arm64-x86_64.apk`, **42.068.996 bytes**, SHA-256 **3eb80a054208dc970314611b63b4b6d4232b3b2b0e910e8a40bab1c9e093e948**. Nome/pasta/tamanho/MIME e estado privado confirmados por leitura do Drive; permissões retornaram somente proprietário. Checksum remoto não foi exposto pelo conector: hash é o dos bytes locais enviados, não uma alegação de comparação criptográfica remota.

Pacote `com.resicheck.connect.demo`, instalado como Connect Demo, versionName **0.1.1**, versionCode **2**. Assinatura v2 válida; certificado SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, igual ao anterior. Assinatura Android Debug de teste, não de loja. minSdk24/target36, ARM64/x86_64; sem INTERNET/microfone/acesso amplo a arquivos. Pode tentar atualização normal sobre o lote2, sem remover automaticamente versões se houver erro.

## O que foi verificado

Autor/título/descrição/horário do áudio passaram a ocupar blocos separados, com largura responsiva e fonte mantida. Informações auxiliares rolam com a conversa para liberar área em fonte grande/teclado aberto; placeholder curto mantém o campo legível. O rótulo e hint de áudio fictício continuam acessíveis.

Passaram26 testes do app,8 de texto com766 casos oficiais Unicode17,26 de chat e37 verificações web de regressão. A matriz web final confirmou32 combinações/64 balões. Android cobriu larguras393/360/320dp e fontes1/1,3/1,6/2 com teclado aberto/fechado; medições integrais e acessos por rolagem são separados. O artefato final recebeu retestes dirigidos e suplemento para os quatro casos fonte2, com0 pendências de acesso após suplemento, sem apagar execuções anteriores inconclusivas. Referências altas4096px não foram apresentadas como viewport real2048px. Relatório detalhado: `docs/testing/AUDIO-LAYOUT-0.1.1.md`.

## Limites mantidos

É demonstração sintética em memória: sem gravação/reprodução, arquivos reais, push, login ou chat remoto. Não usar dados de pacientes. Emojis mantêm texto original e contam graphemes; novo limite ainda não foi alinhado ao SQL online e não representa persistência Supabase validada.

TalkBack, aparelhos antigos/físicos e iOS permanecem pendentes. Bolhas altas podem exigir rolagem; não foram prometidas inteiras em uma tela pequena com teclado. A divergência de uma rajada artificial de2.000 teclas ainda está em investigação separada APP-060. A captura original do usuário não materializou no Windows; o defeito e as imagens de comparação foram reproduzidos no emulador próprio. Configurações do emulador restauradas e AVD encerrado.

Lote final local: `output/entregas/0.1.1-demo-build2-final`. Lotes anteriores e todos os candidatos de evidência mantêm seus hashes.
