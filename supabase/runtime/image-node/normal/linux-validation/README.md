# Export offline do runtime fixado - preparo, nao executado no Linux

## Resultado posterior20/11: validacao real por copia seletiva concluida

O parser de archive abaixo e historico, nao um requisito pendente. O host original forneceu6 ELF/libs por copia seletiva de container PARADO; loader privado/manifest e PNG16x16 foram verificados sem root/rede e todos os temporarios removidos. Evidencia [staged-runtime-real-20261120.json](staged-runtime-real-20261120.json); extrator compativel [selected-runtime-v4.py](selected-runtime-v4.py). Fixture LoadCredential/peer anterior tambem passou, sem repeticao. Nenhuma instalacao/ativacao persistente ou SQL ocorreu. Restam revisao material de instalacao/escopos/Edge e gatesAPK/web/Git; nao refazer export/testes vencidos.


20/11/2026. Esta pasta nao altera o servico, config, proof ou auditoria OFF. Nao conecta ao VPS, Auth, Storage, Docker ou WSL.

## Resultado verificavel desta frente

- Os executaveis docker.exe/wsl.exe existem e o inventario passivo observou Docker Desktop/backend e vmmemWSL. Isso nao demonstra acesso autorizado ao daemon.
- O historico registra WSL E_ACCESSDENIED e acesso negado ao daemon Docker. Nenhum desses comandos foi repetido e nenhum servico foi iniciado.
- Nao foi encontrado docker-save/OCI archive do runtime fixado nas saidas do checkout nem nos caminhos locais conhecidos da ponte. A unica camada local de imagens e a base Debian: output/image052-official-artifacts/20261118T012151Z/base-layer.tar.gz, SHA25637fb86c2a767b88d500c6872195f88078f64765fe0d2f9cc375cc2efbd4c0a41. Ela NAO contem os dois binarios compilados e nao substitui a imagem.
- O pin completo existe em linux-image.lock.json. O runtime foi montado historicamente na VPS como sha256:27d6b28f9111c36fcf39cab1d8cc818daa2a5474f93fce305e1466010cdf695e; os registros locais citam $B/$OUT2 e hashes, mas nao contem um caminho absoluto comprovado de docker-save dessa imagem. Nao inventar esse caminho ou usar o archive de AUDIO.

## Ferramenta entregue

export-fixed-runtime.py e um parser/exportador offline do arquivo produzido por [docker image save](https://docs.docker.com/reference/cli/docker/image/save/). Nao chama Docker, Linux, subprocesso ou rede; nao executa membro de archive.

Antes de gravar, exige uma unica imagem, SHA256 do config igual ao imageId fixado, linux/amd64/65532:65532, diff_ids exatos de todas as layers e hashes fixados dos dois ELF. Aplica whiteouts em memoria, resolve links somente dentro da arvore e exporta apenas os dois binarios e bibliotecas diretas privadas. Recusa caminhos relativos ascendentes e archive excessivo; destino tem de ser novo. Gera RUNTIME-MANIFEST.json e EXPORT-RECEIPT.json; nao inclui senha/config do Connect ou snapshot de dados.

Um caso agrupado sintetico do parser passou em uma invocacao: configId/diff_ids/binaryPins/manifest, recusa antes de gravar e path traversal. Arquivos de entrada eram metadados/ELF sinteticos, nao binarios executaveis reais. Isso nao e codec-smoke nem validacao Linux.

Quando um archive autorizado estiver disponivel localmente, a partir do checkout (com diretorio output pai existente):

~~~powershell
python supabase/runtime/image-node/normal/linux-validation/export-fixed-runtime.py --archive CAMINHO_LOCAL_VERIFICADO_DO_DOCKER_SAVE --output output/image-normal-runtime-export-NOVO
~~~

Este comando nao cria archive nem busca a imagem. A origem precisa fornecer path/hash, sem credenciais; nao ha download/transferencia nesta frente. Arquivo OCI puro sem manifest.json falha fechado: nao converter o pin nem reconstruir binarios para faze-lo passar.

## Limites e proximo passo minimo

Runtime real ainda NAO exportado: falta o archive da imagem exata. Mesmo quando exportar, Windows nao pode validar ELF nem LoadCredential/systemd/SO_PEERCRED/cgroup. O novo preflight no decoder valida manifest e loader sem fallback de bibliotecas do host, mas precisa rodar num Linux autorizado separado com os bytes reais. O export local nao promove arquivos como root: owner/permissoes finais pertencem a futura instalacao revisada.

Nenhuma necessidade de criar credencial, abrir rede/grants ou instalar pacotes para obter os bytes: o menor efeito futuro e salvar a imagem ja existente para archive privado pelo coordenador autorizado, conferir config/imageId e SHA256 e transferir esse arquivo sem execucao/instalacao. Nao executado nesta rodada. Se o acesso Docker Desktop continuar negado, respeitar a negativa e usar somente um ambiente Linux que venha a ser explicitamente disponibilizado/autorizado; nao trocar de socket/WSL/daemon para contornar.
