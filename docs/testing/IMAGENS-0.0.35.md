# Hotfix 0.0.35: APP269 e APP270

Escopo exclusivo: recuperar confirmacao de imagem na mesma tentativa e converter PNG Compactada em JPEG real. APP266/268 ficam fora. Nenhuma mudanca de backend, Auth, limites, privilegios, CORS/CSP ou infraestrutura.

Compactada usa q90/max3508 e extensao.jpg/MIME image/jpeg; transparencia recebe fundo branco com aviso antes do envio. Original conserva bytes/alfa; JPEG maior ou falho exige escolha explicita de Original.

## Evidencia de desenvolvimento reutilizada

Uma rodada API36/debug com app normal/backend reais: PNG2064714B -> JPEG1691826B (-18,06%),1664x1239. Um upload/um send/um balao em ambas UIs; destinatario abriu o JPEG com MIME/cabecalho/dimensoes/hash/bytes iguais. Status503 transitorio real recuperado na mesma tentativa; duas sessoes proprias encerradas normalmente. Nao e reproducao do caso original nem prova fisica/iOS.

Casos locais anteriores cobrem cancelamento,timeout,ACK perdido e Original; codecs Web/Android exercitados com PNG detalhada,transparente/texto e pequena. Fixtures nao comprovam backend. Nenhum leitor de QR foi testado.

## Gates do artefato final

15 testes focais e typecheck passaram nesta rodada. Snapshot Android/Web35 comum e locks verificados. Ainda executar assinatura/manifesto/ABI/Expo/modulo nativo,upgrade34->35 em AVD proprio,picker/revisao JPEG e Original,cancelar sem enviar,retomar e navegar. Web:smoke local na CSP atual,preservar rollback,publicar apenasConnect e verificar HTTPS/versao/assets/CSP. Reusar a prova conectada sem novo envio quando nao houver mudanca relevante. Manifesto final registra resultados reais;sem repetir infra/piloto de audio.


### Candidato final e publicacao - 22/11/2026

APK unico0.0.35/build35 assinado e upgrade34->35 passaram noAPI36. Seletor real: primeira selecao nao abriu revisao; sem alterar o APK, confirmou-se Downloads naUI e a selecao seguinte passou, sem alegar causa da primeira falha. PreviewJPEG1653KiB,OriginalPNG2017KiB,voltar/reabrir/descartar e About35 passaram;original do provedor preservado e recursos proprios removidos. Logout normal naUI observado,sem evidenciaHTTP no release.

Web35 publicada somenteConnect,HTTPS/index/JS/assets/CSP exatos;index/assets34 conservados para rollback. Chrome local desktop/390px e smoke hospedado de picker/previewJPEGreal1691826B1664x1239/hashigual aoAndroid,Original/voltar/reabrir/descartar passaram,zero uploads/sends novos e zero errosCSP/page. A navegacao de conta do roteiro usou rotuloAndroid em vez de Minha conta daWeb e falhou; o browser efemero foi fechado sem confirmar logout dessa nova sessaoQA. Essa pendencia permanece registrada,sem acessar sessao anterior,token ou revogacao administrativa;expiracao nao verificada. Nao apresentar o teardown como passado nem repetirAuth para compensar. Nenhum defeito de produto nessa navegacao foi demonstrado.

Fontes:264arquivos byte-exatos em clone limpo,locks restaurados offline,typecheck/project:check passaram. Commit de fonte8da5e4995c767eabf418207db4eba9cfb60bde2d publicado e ref verificada;notas finais nao alteram bytes compilados. Manifesto em delivery/RELEASE-0.0.35.json discrimina gates/limites. Nao houve novo teste de infraestrutura/audio ou mudanca de backend/permissoes/CORS/CSP.
