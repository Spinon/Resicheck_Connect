# Hotfix 0.0.35: APP269 e APP270

Escopo exclusivo: recuperar confirmacao de imagem na mesma tentativa e converter PNG Compactada em JPEG real. APP266/268 ficam fora. Nenhuma mudanca de backend, Auth, limites, privilegios, CORS/CSP ou infraestrutura.

Compactada usa q90/max3508 e extensao.jpg/MIME image/jpeg; transparencia recebe fundo branco com aviso antes do envio. Original conserva bytes/alfa; JPEG maior ou falho exige escolha explicita de Original.

## Evidencia de desenvolvimento reutilizada

Uma rodada API36/debug com app normal/backend reais: PNG2064714B -> JPEG1691826B (-18,06%),1664x1239. Um upload/um send/um balao em ambas UIs; destinatario abriu o JPEG com MIME/cabecalho/dimensoes/hash/bytes iguais. Status503 transitorio real recuperado na mesma tentativa; duas sessoes proprias encerradas normalmente. Nao e reproducao do caso original nem prova fisica/iOS.

Casos locais anteriores cobrem cancelamento,timeout,ACK perdido e Original; codecs Web/Android exercitados com PNG detalhada,transparente/texto e pequena. Fixtures nao comprovam backend. Nenhum leitor de QR foi testado.

## Gates do artefato final

15 testes focais e typecheck passaram nesta rodada. Snapshot Android/Web35 comum e locks verificados. Ainda executar assinatura/manifesto/ABI/Expo/modulo nativo,upgrade34->35 em AVD proprio,picker/revisao JPEG e Original,cancelar sem enviar,retomar e navegar. Web:smoke local na CSP atual,preservar rollback,publicar apenasConnect e verificar HTTPS/versao/assets/CSP. Reusar a prova conectada sem novo envio quando nao houver mudanca relevante. Manifesto final registra resultados reais;sem repetir infra/piloto de audio.
