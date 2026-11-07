# Entrega Android demonstrativa — lote 2, sessão e contexto

06/11/2026. Novo arquivo enviado à pasta APK autorizada, sem substituir a primeira entrega e sem publicar código no GitHub.

- [APK](https://drive.google.com/file/d/1puxKMBHC9898u4j1taAsV8jIymZcsezr/view?usp=drivesdk)
- [Instruções](https://drive.google.com/file/d/1b6bmeXfsZ9dLkhBht5V2ms3Em75EIT3e/view?usp=drivesdk)
- [Manifesto](https://drive.google.com/file/d/1fGJM3XKUa7a-kIsXIh5-CjtUXlZVcN-V/view?usp=drivesdk)
- [SHA-256](https://drive.google.com/file/d/17MUaZ5kk7-2WYjMKk-RqGyMvP8MRcwCx/view?usp=drivesdk)
- [Resultado Android](https://drive.google.com/file/d/19JU5IE9vu5YZ9DQy0QBupF_1hcbS-teg/view?usp=drivesdk)

`resicheck-connect-demo-0.1.0-lote2-sessao.apk`, **42.054.338 bytes**, SHA-256 **69918a0c67a1919aaefbfc054431cf00af6c7545e09e5453ea4c1a589db3c378**. Tamanho, nomes, MIME, pasta e estado privado confirmados por leitura do Drive: permissões retornaram somente proprietário, shared=false. O conector não expôs checksum remoto; o hash é do artefato local enviado, sem alegar comparação criptográfica remota.

Pacote `com.resicheck.connect.demo`, nome instalado Connect Demo, versionName **0.1.0**, versionCode **1**. **Lote 2 é identificação de entrega, não um versionCode 2.** Assinatura v2 Android Debug validada novamente antes do envio; certificado SHA-256 `fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`, igual ao da primeira entrega. Pode tentar atualização sobre a demonstração anterior, sem recomendar remoção automática se houver erro do instalador.

Inclui confirmação ao sair, retorno do perfil, busca sem acento e integração de sessão/contexto/política de acesso na interface simulada. Passaram 24 testes do app, 10 de sessão, 18 de acesso, 27 verificações web e 11 jornadas Android sem avisos. Relatório: `docs/testing/SESSAO-E-ACESSO-NA-INTERFACE.md`.

Sem autenticação, mensagens remotas, push, upload ou som real. Apenas fixtures sintéticas em memória; sair reinicia os dados. minSdk24/target36 declarados, ARM64/x86_64; validado somente no emulador Android16/API36. Aparelho físico, Android antigo, iOS e TalkBack não validados. Manifesto sem INTERNET, microfone ou acesso amplo a arquivos.

**O desenvolvimento novo de emojis APP-057 não está neste lote.** O candidato desse recurso tem validação separada em andamento e não foi incluído silenciosamente no APK já testado. Arquivos desta entrega em `output/entregas/0.1.0-demo-lote2`; primeiro APK e candidatos locais anteriores mantêm seus hashes.
