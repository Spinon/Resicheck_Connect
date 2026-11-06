# Entregas de teste e Drive

Área privada criada pela coordenação no chat principal; links fornecidos em 06/11/2026. Esta tarefa local não fez upload nem modificou compartilhamentos.

- [Projeto — App de Consultas e Chat](https://drive.google.com/drive/folders/1a1rQzv361Ql4fEtXeJ7CMdxygXi-KCmC).
- [APKs](https://drive.google.com/drive/folders/1e839A_ZtJxwJP_YrBiWK9-V6HoPRBYcK).
- [Assets visuais](https://drive.google.com/drive/folders/1vZxqtqVQ0Zz8jrC5gP4BHE-Ai2mLkysA).
- [Documentação](https://drive.google.com/drive/folders/1lvk8aU5FfQHMBmWG2sLWApd7S7DP8xhc).

## Lote local antes de upload

```text
output/entregas/<versao>-<build>-<data>/
  android/app-<versao>-<build>-teste.apk
  assets-visuais/<tela>-android-<dimensoes>.png
  evidencias/resultado-testes.md
  manifest.json
  LEIA-ME.md
```

Usar `delivery/manifest.template.json` como modelo. Preencher hash SHA-256 do APK real (`Get-FileHash -Algorithm SHA256 -LiteralPath <arquivo>`), versão, build, ambiente e revisão. Não inserir hashes inventados nem marcar teste como concluído sem execução.

O LEIA-ME explica em poucas linhas como instalar, que fluxo mudou, qual conta exclusivamente sintética usar, limitações conhecidas e onde registrar um problema. Evitar credenciais pessoais. APK de teste aponta apenas ao ambiente sintético; nenhuma entrega inicial pode se conectar silenciosamente a dados reais.

## Fluxo

1. Compilar o APK após implementar a fatia e instalar no emulador autorizado.
2. Executar as jornadas pertinentes e registrar resultado/limitações. Não distribuir build com falha crítica de autorização ou perda de dados.
3. Montar o lote e revisar para excluir segredos e dados reais. Assets são sintéticos.
4. Quando autorizado, enviar arquivos às pastas existentes usando a integração Drive. Ler metadados e confirmar o destino antes de escrever, preservar acesso privado e verificar os arquivos retornados após o upload.
5. Registrar os links observados e o hash do APK no manifesto e no board. Não adivinhar URLs nem criar links públicos automaticamente.

Não há APK, imagem de tela, manifesto preenchido nem upload desta estrutura. A existência das pastas não significa entrega do app.
