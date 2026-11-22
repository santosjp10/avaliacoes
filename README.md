# Avaliações — Estúdio e Corretor

Aplicativo para **elaborar** avaliações no computador e **corrigi-las** pelo celular. Funciona no navegador, pode ser instalado como app (PWA), roda sem internet e não envia dados a nenhum servidor.

- **Estúdio (PC):** banco de questões, montagem de provas com várias versões embaralhadas, impressão da prova e da folha de respostas, resultados e análise das questões.
- **Corretor (celular):** lê o QR da folha, mostra as bolhas para marcar as respostas do aluno, calcula a nota na hora e envia os resultados ao PC.

## Como publicar (uma vez)

1. No GitHub, abra o repositório → **Settings → Pages**.
2. Em **Build and deployment → Source**, escolha **GitHub Actions**.
3. Faça um push para `main` (ou rode a ação *Publicar no GitHub Pages* em **Actions**).
4. O endereço fica em `https://<usuario>.github.io/<repositorio>/`.

O HTTPS do GitHub Pages é necessário para o celular liberar a câmera.

## Como usar

1. **Questões.** Cadastre questões em *Banco de questões* ou importe o `banco_questoes.json` do ProvaSystem antigo. São três tipos: múltipla escolha (2 a 5 alternativas), verdadeiro/falso e discursiva (com linhas e critério de correção).
2. **Avaliação.** Em *Avaliações → Nova avaliação*, preencha os dados, adicione as questões, ajuste o valor de cada uma e clique em **Publicar e gerar versões**. A avaliação publicada fica congelada; para mudar algo, use *Duplicar como rascunho*.
3. **Impressão.** *Prova + folha para N alunos* gera um único documento com as versões alternadas (A, B, C, A…). Também é possível imprimir o gabarito do professor.
4. **Pareamento (uma vez).** No PC, abra *Ajustes → Mostrar QR de pareamento*. No celular, abra o app e toque em *Parear com o Estúdio*.
5. **Correção.** No celular, toque em *Escanear folha*, aponte para o QR, digite o nome, toque nas bolhas e depois em *Corrigir e salvar*. *Próximo aluno* mantém a mesma versão.
6. **Resultados.** No celular, toque em *Enviar resultados ao PC* e mande o arquivo para o computador como preferir. No PC, use *Resultados → Importar do celular*. Importar duas vezes não duplica as notas.
7. **Backup.** Os dados ficam só no navegador. Em *Ajustes*, baixe o backup com frequência, de preferência protegido por senha.

## Segurança e privacidade

- O QR da folha leva o gabarito **cifrado** (AES-GCM) com a chave do professor. Um aluno que ler o QR não consegue ver as respostas.
- O pacote que o celular envia ao PC também é cifrado. O backup pode ser protegido por senha (PBKDF2 + AES-GCM).
- Nomes e notas de alunos são dados pessoais (LGPD). Trate os CSVs e backups exportados com o mesmo cuidado.

## Desenvolvimento

```bash
npm install
npm run dev        # servidor local (http://localhost:5173)
npm test           # testes do núcleo
npm run build      # gera dist/
```

Estrutura:

```
src/core/      regras puras, sem interface, com testes: modelo de dados, versões e gabarito,
               correção, estatística, criptografia, formatos de QR/pacote, importação do sistema antigo
src/data/      banco local (IndexedDB via Dexie) e backup
src/studio/    interface do PC
src/corretor/  interface do celular
src/ui/        componentes compartilhados (grade de bolhas, modal, avisos)
```

Decisões importantes:

- A versão não copia as questões. Ela guarda só a **ordem** das questões e das alternativas, e o gabarito é sempre derivado dessa ordem. Assim não há gabarito digitado nem desalinhado.
- Só alternativas de múltipla escolha são embaralhadas. V/F e discursivas mantêm a resposta.
- A análise das questões agrupa pela questão original, não pela posição (que muda de uma versão para outra).

## Próximas etapas

- Leitura automática das bolhas pela câmera (OMR). A folha já é impressa com marcadores nos cantos para isso.
- Folhas personalizadas por aluno, com nome e matrícula no QR.
- Rubricas para discursivas e anulação de questão com recálculo das notas.
- Sincronização opcional em nuvem.
