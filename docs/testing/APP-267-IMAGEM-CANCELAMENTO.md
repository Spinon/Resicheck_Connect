# APP267 - hotfix de envio de imagem

O codigo anterior esgotava seis consultas e permanecia waiting;na revisao,as saidas ficavam desabilitadas. Defeito reproduzido em fixture. O relato original de Lucas nao foi reproduzido fisicamente;plataforma/formato/tamanho nao determinados.

Candidato compartilhadoWeb/Android:limite de espera,cancelar antes do despacho definitivo,confirmacao honesta depois dele,reconciliacao dos mesmosIDs sem reenviar,rascunho preservado e acoes fora da area rolavel. Cancelar impede send tardio;nao promete apagar objeto privado ou abortar fisicamente todo transporte.

Provas21/11 reaproveitadas:10contratos focais,10casos deUIWeb desktop/tela pequena com transporte sintetico,2casosAndroid sinteticos,DocumentPicker real offline e1PNG16x16/84bytes no Android conectado. No caso conectado:1upload,inspecao ready,1mensagem accepted,leitura/abertura/ampliacao pelo outro papel com mensagem/SHA/bytes conferidos;2logouts locais204 apenas das sessoes novas. Sem consulta a sessoes antigas. Evidencias privadas foraGit.

Gate34:mesma fonte nas duas plataformas;validar APK assinado e export,instalacao/upgrade,cancelamento e confirmacao atrasada sem duplicar distinguindo fixture de backend real. Nao repetir infra/audio. Sem prova fisica;PNG pequena nao cobre formatos/tamanhos gerais. Release e seus limites ficam em delivery/RELEASE-0.0.34.json quando verificados.


## Gate final do hotfix 0.0.34 - 21/11/2026

Candidato assinado, nao liberado: fonte 772957977ac796e20bb325cb97e7504771407d53, APK SHA-256 6005a1626314d6046218f12667b0865a7f7cc35db78651cd37eeef335a87c2e1 (46.933.504 bytes), versao 0.0.34/build34. Assinatura, inspecao de pacote, upgrade 33 para 34 e login normal passaram no emulador API36. O gate de imagem FALHOU no proprio APK: selecao direta da PNG sintetica voltou ao chat, sem revisao nem erro visivel, inclusive com observacao limitada posterior. Nao houve clique em Enviar imagem, reenfileiramento ou alteracao do backend. Rascunho sintetico permaneceu ate ser descartado explicitamente no encerramento do teste.

Uma unica comparacao dirigida, sem recompilar, reutilizou o APK de diagnostico offline ja existente no MESMO AVD novo: DocumentPicker real, leitura, copia privada, cabecalho, dimensoes e revisao passaram com a mesma PNG de84 bytes. Auth/chat eram fixtures; sem permissao INTERNET. Isso distingue o candidato final da prova offline, mas NAO demonstra a causa nem resolve a falha do final. Logs de erro JavaScript do processo final nao mostraram excecao pertinente. Nao atribuir a falha a credencial, arquivo, timeout120s ou lifecycle sem prova.

Web34 exportou e passou smoke Chrome desktop/tela pequena com a CSP publicada atual; isso nao comprova envio hospedado ou Android. O clone limpo local manteve262 fontes byte-exatas; lockfiles offline, project:check e typecheck mobile passaram. Regressao funcional final, Drive34, deploy e push permanecem pendentes. A Web33 e o APK anterior permanecem como entrega vigente; nao substituir pelo candidato bloqueado. APP266 nao foi incluido.

Sessao propria de QA saiu pelo fluxo normal para a tela de login (HTTP nao observado neste APK sem diagnostico). Pacote, PNG, processos e AVD novos de teste foram removidos; serial e PID ausentes. Emulador original e servicos preservados. Nenhuma prova em aparelho fisico. Proximo passo: diagnostico focal da divergencia entre o retorno do picker no candidato final e a composicao de depuracao, preservando guardas; congelar eventual correcao antes de novo candidato, sem repetir infra/audio.


## APP267 - causa e candidato corrigido,21/11/2026

A auditoria do seletor no APK intacto reproduziu o retorno sem revisao em36s,sem exceder120s e sem envio. Uma variante local de diagnostico preservou1436 entradas nativas do APK e registrou apenas fases/metadados sanitizados:resultado nao cancelado,1content URI do provedor Android Downloads,84bytes lidos/copias privadas,preparacao pronta;depois a conversa era encerrada. O segundo recorte demonstrou o timer de acesso acordando7,1s atrasado e tentando iniciar uma prova cujo prazo de5s ja havia vencido2,1s antes. Nao era prova de recusa do servidor nem falha do PNG. A hipotese de limite512bytes nao se confirmou e esse limite NAO foi alterado.

Correcao local:pausa da checagem somente na fronteira nativa coberta de selecao externa,retorno exigindo nova prova de acesso limitada antes da prontidao/levantamento da cortina. Timer atrasado durante exibicao continua fail-closed. Cancelamento local do head-read nao imita negativa de autorizacao;falha real,projecao de outro escopo e timeout permanecem fechando o dono capturado. Contas,conversa,leases,RLS,Storage,MIME,bytes de midia e backend nao foram ampliados. A permissao de audio segue o caminho anterior.6casos de lifecycle e2de cancelamento do head passaram;um caso novo falhou antes do ajuste e passou depois. Typecheck aprovado. Sem prova fisica.

Fonte congelada dea3d6fef96b297b9532411faf6aa76e724bf1b5;mesmo bump0.0.34/build34(ultima entrega33). Candidatos34 anteriores nao distribuidos foram preservados,sem sobrescrever historico. MetroAndroid34 limitado a2workers;apos OOM na tentativa paralela,builds sequenciais. O build49s,assinatura e inspecao estatica passaram no novo APK e35e66f47f816c0a2f67524ac201534d78a00527b34e88d53a2f3b9d64825358. O teste funcional do artefato corrigido ainda e o gate,nao substituido pelos testes locais. Nenhum diagnosticoQA entrou no bundle final.

A tentativa de iniciar publicacaoWeb foi negada pela revisao automatica ANTES do despacho,por exigir autorizacao explicita enquanto o gateAndroid estava falho. Historico conferido;nao houve nova evidencia de aprovacao de entrega incompleta e nao houve retry nem canal alternativo. AWeb33 permaneceu servida,sem upload/login/deploy dessa tentativa. Reavaliar somente com fato material novo(gate corrigido aprovado)ou confirmacao realmente necessaria. APP266 e APP268 permanecem fora do hotfix.


## Hotfix 0.0.34: artefatos verificados - 21/11/2026

Fonte compilada `dea3d6fef96b297b9532411faf6aa76e724bf1b5`, fingerprint `c57a799ac3fba9f7980b49e48e9a3e8ad5d3b76f0c3de990d1e7ae805c6dd6aa`. APK final `e35e66f47f816c0a2f67524ac201534d78a00527b34e88d53a2f3b9d64825358`, 46.933.504 bytes, assinatura e instalacao nova no emulador API36 conferidas; nao confundir o rotulo antigo do roteiro com upgrade final. O seletor real voltou a revisao apos17s no sistema; retorno/reabertura/descarte preservaram rascunho e arquivo. Um unico comando de envio, recuperado pelos mesmos IDs apos espera, produziu uma mensagem visivel e aberta/ampliada pelo outro papel. Dois logouts UI; HTTP nativo nao observado. Recursos proprios do emulador foram encerrados/removidos. Sem teste fisico.

Web0.0.34 esta servida no dominio Connect com export `d0fe898460040b8f0033093e8a488d95f4a45f64d6daa664c0dcdecd84994198`, HTTPS, JS/index conferidos e CSP atual inalterada. Um upload e um send aceito; conferiu a mesma tentativa apos resposta transitoria, sem reenvio. A imagem existente abriu no destinatario com descritor/hash/84bytes e16x16 verificados; inbox utilizavel, zero erros CSP/JS. Cinco sessoes proprias desta rodada Web encerradas com logout local204. Rollback real paraWeb33 foi exercitado nas falhas do roteiro, antes da verificacao final positiva; anteriores preservados. O publicador foi corrigido para raiz ja escopada ao Connect e aguarda visibilidade do arquivo sem reupload. Residuou apenas uma copia inerte do JS em subpasta redundante,sem index novo nessa pasta;nenhum dado removido.

Nao houve mudanca no backend/VPS/Supabase/CORS/CSP, audio ou projeto principal. APP266/APP268 ficam separados. Provas locais antigas de cancelamento/confirmacao tardia foram reaproveitadas;nao houve bateria de infra. Ver [manifesto34](../../delivery/RELEASE-0.0.34.json). Git curado ainda aguarda push/ref/SHA;nao declarar lote totalmente fechado antes desse readback.
