# ResiCheck Connect 0.0.36 (build 36)

- A miniatura de uma foto recebida aparece automaticamente na conversa. Quando o serviço está ocupado, o app tenta a leitura mais duas vezes dentro do prazo da operação.
- Ao voltar à conversa, o app pode reutilizar uma imagem recebida do cache após verificar o acesso atual. A remoção da mensagem invalida a mídia correspondente.
- Uma foto cujo envio foi interrompido pode ser retomada pela seta sobre a miniatura. O app verifica a tentativa existente antes de decidir se os bytes precisam ser enviados.

O teste conectado em dois emuladores Android confirmou uma única mensagem recebida. No Chromium, o destinatário abriu a mesma foto em uma prévia autenticada com o JavaScript e o CSS do release.

| Artefato | SHA-256 |
| --- | --- |
| APK Phone | `656059fecd2f7d52ba2b6100aa3f0b6d97483b234deccb8e482ae26a12208e62` |
| ZIP web | `7b7aaa5bd2571d38a239a6c1b1c5c0d92f39288dec9f44f203bd5a62a4ab0f72` |
