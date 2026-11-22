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
3. **Impressão.** Há duas opções:
   - **Folhas personalizadas:** em *Folhas personalizadas por aluno*, cole a lista da turma (nome e matrícula, copiados da planilha). Cada aluno recebe prova e folha com o nome impresso, e o QR identifica o aluno na correção.
   - **Folhas sem nome:** *Prova + folha para N alunos* gera um único documento com as versões alternadas (A, B, C, A…).

   Também é possível imprimir o gabarito do professor.
4. **Pareamento (uma vez).** No PC, abra *Ajustes → Mostrar QR de pareamento*. No celular, abra o app e toque em *Parear com o Estúdio*.
5. **Correção.** No celular, toque em *Escanear folha* e enquadre a **folha inteira**, de cima, com os 4 quadrados pretos dos cantos visíveis. O app lê o QR e as bolhas sozinho e mostra as respostas pré-marcadas.
   - Marcações duvidosas aparecem destacadas em amarelo: dupla marcação, rasura, um "X" em vez de pintar ou marca fraca.
   - Confira, digite o nome do aluno e toque em *Corrigir e salvar*.
   - *Ver foto com a leitura* mostra o que foi reconhecido.
   - Se a câmera não achar os cantos, use *Usar foto* (foto tirada pela câmera do celular, em resolução máxima) ou *Marcar respostas manualmente*.
   - **Modo rápido** (opção na tela inicial do Corretor): em folhas personalizadas sem nenhuma dúvida na leitura, a correção é salva direto, e é só passar para a próxima folha. Ler de novo um aluno já corrigido abre a conferência, com a opção de substituir a correção anterior.
   - *Enviar resultado ao aluno* manda nota e questões a revisar por WhatsApp (ou outro app).
6. **Resultados.**
   - **No celular:** em *Enviar resultados*, toque em *Enviar ao PC*. Isso gera um arquivo cifrado, que você manda por WhatsApp ou e-mail para você mesmo.
   - **No PC:** use *Resultados → Importar do celular*. Importar duas vezes não duplica as notas.
   - **Lista de notas:** também pode ser enviada direto do celular, por WhatsApp, e-mail ou como planilha.
7. **Anulação e troca de gabarito.** Em *Resultados → Análise das questões*, use *Anular* ou *Trocar gabarito* em cada questão.
   - As notas de todos os alunos são recalculadas na hora.
   - A questão anulada pode valer ponto para todos (padrão) ou sair da nota.
   - Tudo fica registrado no histórico e aparece no gabarito do professor.
8. **Backup.** Os dados ficam só no navegador. Em *Ajustes*, baixe o backup com frequência, de preferência protegido por senha.

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
- A posição de cada bolha é definida em milímetros em `src/core/folha.ts`. A impressão e a leitura óptica (`src/core/omr.ts`) usam a mesma geometria.
- Leitura óptica, em quatro passos:
  - localiza os 4 marcadores com binarização adaptativa, que tolera sombra;
  - usa o QR para saber a orientação da folha (pode estar girada ou de cabeça para baixo);
  - calcula a homografia, que corrige a perspectiva;
  - mede o preenchimento de cada bolha em relação ao papel ao redor.
- O QR da folha carrega só o código da prova, a versão e o gabarito compacto, cifrado (cerca de 115 caracteres). Por isso ele continua legível com a folha inteira no enquadramento.

## Próximas etapas

- Rubricas para discursivas.
- Sincronização opcional em nuvem.
