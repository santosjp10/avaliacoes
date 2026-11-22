# Banco Aberto de Questões — como contribuir

O Banco Aberto reúne questões elaboradas e revisadas por professores, livres para uso em avaliações e como material de estudo. Todo o conteúdo está sob a licença **[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.pt_BR)**: qualquer pessoa pode usar e adaptar as questões, desde que dê crédito ao(à) autor(a). O app já faz isso automaticamente no rodapé da prova impressa.

> **Banco aberto significa gabarito aberto.** Estudantes também podem consultar as questões com as respostas. Para uma prova, misture questões do banco com questões inéditas suas e use as versões embaralhadas.

## Para professores: enviar uma questão

1. No app (**Estúdio → Banco de questões**), crie ou revise a questão.
2. Clique em **Contribuir** no cartão da questão, informe seu nome, sua instituição e a fonte (se a questão for adaptada).
3. O GitHub abre um formulário **já preenchido**. É preciso ter uma conta gratuita no GitHub.
4. Se a questão tiver figura, arraste o arquivo da imagem para o campo **Imagens**.
5. Marque a declaração de autoria e licença e clique em **Submit new issue**.

A curadoria revisa a questão. Se ela for aprovada, é publicada automaticamente e aparece para todos em **Estúdio → Banco compartilhado**. Você é avisado no próprio GitHub.

**Encontrou um erro numa questão publicada?** No Banco compartilhado, clique em **Relatar erro** na questão.

### O que pode ser enviado

- Questões de sua autoria.
- Questões **adaptadas** de provas, concursos ou livros: reescritas com suas palavras e com a **fonte citada** no campo *Fonte*. Não envie cópia literal de material de terceiros.
- Nada de dados pessoais de estudantes nas questões.

## Para a curadoria: revisar e aprovar

Cada contribuição chega como uma *issue*. Antes de aprovar, confira:

- [ ] O enunciado está claro e sem ambiguidade.
- [ ] O gabarito está correto (✅ na versão para leitura) e as demais alternativas estão de fato erradas.
- [ ] Disciplina, assunto e nível estão adequados.
- [ ] A fonte está citada, se a questão for adaptada, e não é cópia literal.
- [ ] As imagens, se houver, estão legíveis e têm direito de uso.

**Para aprovar**, aplique o rótulo **`aprovada`** à issue. A automação então:

- valida os dados;
- baixa as imagens;
- publica a questão (`public/banco/questoes/<id>.json`);
- atualiza o índice;
- comenta, fecha a issue e republica o app.

Se faltar algo, ela comenta o motivo e retira o rótulo.

**Para pedir ajustes**, comente na issue. O autor corrige no app e envia de novo.

**Para corrigir ou retirar uma questão publicada**, edite ou apague o arquivo em `public/banco/questoes/` e faça um commit. O índice é refeito a cada publicação.

### Primeira configuração (uma vez, por quem administra o repositório)

1. Em **Issues → Labels**, crie os rótulos `questão`, `aprovada` e `erro`.
2. Em **Settings → Actions → General → Workflow permissions**, marque **Read and write permissions**.
3. Para dividir a curadoria, convide colegas como colaboradores com permissão **Triage** (podem aplicar rótulos) ou **Write**.
