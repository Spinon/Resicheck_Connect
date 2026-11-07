# Android 0.1.3 — build7

Data: 2026-11-07. [Baixar APK](https://drive.google.com/file/d/13UTaZeKXxY-NNH4gXHdTscq1wt24RdaH/view?usp=drivesdk) · [Instruções](https://drive.google.com/file/d/17zXmlrgTQJ-qXchdGpgRixEyxzq8Z8Gi/view?usp=drivesdk) · [QA](https://drive.google.com/file/d/1Kx2k3I9bYhNTzZeoGOe_DYzinxJuYegq/view?usp=drivesdk) · [Manifesto](https://drive.google.com/file/d/1iLarM_UA9PZfHCQVVD-irGUMgO0BJV1K/view?usp=drivesdk).

Rodapé permanente substituído por opções da demonstração em modal; rascunho preservado ao fechar, controles acessíveis e lista acompanha mudança de estado. Ajuste Android para padding corrige o caminho reproduzido de compositor fora após usar IME e reduzir janela. Subtítulo paciente mais curto libera área sem reduzir fonte.

APK: resicheck-connect-demo-0.1.3-build7-arm64-x86_64.apk, 42089864 bytes, SHA-256 528fa066c449080e13104ef2812685ba9fd05566b0ccbe2a7acf23bce5220ee9. Pacote com.resicheck.connect.demo, 0.1.3/code7, minSdk24/target36, ARM64+x86_64. Assinatura v2 válida, certificado Android Debug fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c, igual à entrega anterior. Sem INTERNET/microfone/acesso amplo a arquivos. Notas MIT/UnicodeV3 incluídas.

Metadados do Drive relidos: nome, tamanho, pasta APK e estado privado somente proprietário. Checksum remoto não exposto pelo conector; SHA é dos bytes locais enviados. Nenhuma versão anterior foi substituída.

TypeScript, 13 checks web,37 regressões e24 checks agrupados do modal passaram na fonte final. Android final recebeu teste dirigido em320dp/fonte2, IME/redimensionamento, modal Close/BACK, falha e retry do mesmo ID com teclado aberto, além do fluxo padrão; evidência integral no QA. A matriz B precedente teve28 capturas. [Investigação e limites](../testing/ERGONOMIA-E-TECLADO-0.1.3.md).

Continua demonstração sintética em memória, sem Auth/chat remoto, anexos/áudio/push reais. Não inserir dados reais. Seleção de texto pode se desfazer após resize; texto permanece e pode ser selecionado novamente. Observado também no controle height, causa interna aberta. TalkBack, aparelhos físicos/antigos e iOS pendentes. APP-060/SQLUnicode/Auth positivo permanecem separados. Sem publicação Git ou mudança remota de banco.

Lote local: output/entregas/0.1.3-demo-build7.
