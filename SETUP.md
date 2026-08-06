# Como publicar o Painel de Obrigações — passo a passo

Este guia parte da pasta `painel-obrigacoes` (não é mais um único arquivo
HTML — veja o aviso mais abaixo sobre o que mudou). Leva uns 25-30 minutos
na primeira vez; depois disso, publicar uma alteração leva menos de um
minuto.

> **O que mudou desde a última versão:** antes era um arquivo HTML único
> que você editava e arrastava para o Netlify Drop toda vez. Agora o
> painel é uma pastinha de arquivos, guardada no GitHub, e a publicação é
> automática a cada alteração — você não precisa mais arrastar nada
> manualmente. Isso também corrige um problema do modelo antigo: antes,
> se duas pessoas mexessem no painel ao mesmo tempo, uma podia sobrescrever
> sem querer o que a outra tinha acabado de fazer. Agora isso não acontece
> mais.

---

## 1. Criar o projeto no Supabase (gratuito)

1. Acesse **https://supabase.com** e crie uma conta (dá para usar o e-mail
   do Google).
2. Clique em **New Project**.
3. Dê um nome (ex.: `painel-gra`), crie uma senha de banco de dados forte
   (guarde essa senha — não é a mesma senha que a equipe vai usar para
   logar), escolha a região mais próxima (South America, se disponível) e
   clique em **Create new project**. Leva 1–2 minutos para provisionar.

## 2. Criar as tabelas do painel

1. No menu lateral do seu projeto, clique em **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo `sql/schema.sql` (está dentro da pasta do projeto), copie
   o conteúdo inteiro e cole no SQL Editor.
4. Clique em **Run**. Deve aparecer "Success. No rows returned".

Isso cria quatro tabelas — obrigações, conclusões, empresas e perfis de
acesso — cada uma protegida por regras de segurança (RLS) que garantem que
**só usuários autenticados** conseguem ler ou gravar, e que só
administradores podem cadastrar/editar/excluir obrigações (qualquer pessoa
da equipe pode marcar conclusões).

> **Se precisar rodar este script de novo no mesmo projeto** (por exemplo,
> para atualizar para uma versão mais nova do painel), pode colar e rodar
> o arquivo inteiro de novo sem problema — o script foi escrito para ser
> seguro nesse caso (não trava com erros de "já existe").

## 3. Desligar o cadastro público

Por padrão, qualquer pessoa poderia criar uma conta sozinha. Como você quer
controlar quem entra:

1. Vá em **Authentication → Sign In / Providers** (ou **Auth Settings**,
   dependendo da versão do painel).
2. Desative **"Allow new users to sign up"** (ou equivalente).

Assim, só existem contas que você criar manualmente — o que é o certo para
uma ferramenta interna de equipe.

## 4. Criar as contas da equipe

1. Vá em **Authentication → Users**.
2. Clique em **Add user → Create new user**.
3. Preencha e-mail e senha para cada pessoa do time.
4. **Marque a opção "Auto Confirm User"** (ou "Email confirmed") — sem isso,
   a pessoa não consegue logar até confirmar o e-mail, e como o cadastro
   público está desligado, ela ficaria travada.
5. Repita para cada integrante da equipe.

Assim que a conta é criada, o painel gera automaticamente um "perfil" para
essa pessoa com o papel **membro** (pode ver tudo e marcar conclusões, mas
não pode cadastrar/editar/excluir obrigações). O passo seguinte mostra como
promover alguém a administrador.

> Se alguém esquecer a senha, você (como administrador) pode redefinir pelo
> mesmo painel: **Authentication → Users → (usuário) → Reset password**.

## 5. Promover você mesmo (primeiro administrador)

Por segurança, o **primeiro** administrador do projeto precisa ser
promovido pelo SQL Editor do Supabase — depois disso, promover ou
rebaixar qualquer outra pessoa já pode ser feito direto na tela do painel
(aba **Gerenciar → Equipe**), sem precisar mais mexer em SQL.

1. Volte no **SQL Editor → New query**.
2. Cole (trocando pelo e-mail da pessoa):

```sql
update profiles set role = 'admin' where email = 'seu-email@empresa.com.br';
```

3. Clique em **Run**.

Para conferir quem é admin hoje, rode:

```sql
select email, role from profiles order by role, email;
```

A partir daqui, para promover mais alguém a administrador (ou rebaixar
alguém de volta a membro), basta logar no painel como administrador, ir em
**Gerenciar → Equipe** e clicar em "Tornar admin" / "Tornar membro" ao
lado do nome da pessoa. Não precisa mais voltar ao SQL Editor para isso.

## 6. Conectar o projeto ao seu Supabase

1. No Supabase, vá em **Project Settings → API**.
2. Copie o valor de **Project URL**.
3. Copie o valor de **anon public** (também chamada de "publishable key").
4. Abra o arquivo `js/config.js` (dentro da pasta do projeto) num editor de
   texto (Bloco de Notas, VS Code, ou até o Notepad do Windows serve).
5. Você vai ver estas duas linhas:

```js
export const SUPABASE_URL = 'COLE_AQUI_A_URL_DO_SEU_PROJETO_SUPABASE';
export const SUPABASE_ANON_KEY = 'COLE_AQUI_A_CHAVE_PUBLICA_ANON';
```

6. Substitua pelos valores copiados, mantendo as aspas. Fica assim
   (exemplo):

```js
export const SUPABASE_URL = 'https://abcdxyz.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
```

7. Salve o arquivo. **Esse é o único arquivo que você precisa editar** —
   todo o resto da pasta pode ficar como está.

> **A chave "anon public" pode ficar exposta no código** — isso é
> proposital e seguro por design do Supabase: quem protege os dados de
> verdade é a regra de segurança que você criou no passo 2 (só usuário
> logado lê/grava, e só admin cadastra/edita), não o sigilo dessa chave.
> Nunca cole a "service_role key" (essa sim é secreta) em nenhum arquivo
> deste projeto.

## 7. Guardar o projeto no GitHub (gratuito)

Diferente da versão anterior (um arquivo solto), agora vale a pena guardar
a pasta inteira num repositório do GitHub — é o que permite a publicação
automática do passo 8, e também guarda um histórico de tudo que foi
alterado (então dá pra sempre voltar atrás se algo der errado).

Se você nunca usou Git/GitHub, o caminho mais simples é:

1. Crie uma conta gratuita em **https://github.com**, se ainda não tiver.
2. Clique em **New repository**, dê um nome (ex.: `painel-obrigacoes`),
   deixe como **privado** (Private) — é um sistema interno da empresa — e
   clique em **Create repository**.
3. Na página do repositório recém-criado, use o botão **"uploading an
   existing file"** (ou "Add file → Upload files") e arraste a pasta
   inteira do projeto (todos os arquivos e subpastas: `index.html`, `css/`,
   `js/`, `sql/`, os `.md`). O GitHub aceita arrastar pastas direto pelo
   navegador, sem precisar instalar nada.
4. Clique em **Commit changes** para confirmar o envio.

(Se alguém da equipe já usa Git pelo terminal, pode preferir `git init`,
`git add .`, `git commit`, `git push` — o resultado final é o mesmo, só
mais rápido para quem já tem o hábito.)

## 8. Publicar com deploy automático (Netlify ou Vercel, gratuito)

Com o projeto no GitHub, a publicação passa a ser automática: toda vez que
você atualizar um arquivo no GitHub (ex.: subir uma nova versão do
`index.html`), o site é republicado sozinho, sem precisar arrastar nada de
novo.

Usando o **Netlify** como exemplo (o Vercel e o Cloudflare Pages têm um
fluxo praticamente idêntico):

1. Acesse **https://app.netlify.com** e crie uma conta (pode ser com o
   mesmo login do GitHub).
2. Clique em **Add new site → Import an existing project**.
3. Escolha **GitHub** e autorize o acesso ao repositório que você criou no
   passo 7.
4. Selecione o repositório `painel-obrigacoes`.
5. Nas configurações de build, você pode deixar tudo em branco/padrão —
   este projeto não tem build, é HTML/CSS/JS puro. Se o Netlify pedir um
   "Publish directory", deixe `.` (a raiz do projeto).
6. Clique em **Deploy site**. Em menos de um minuto o Netlify gera um link
   `https://algum-nome.netlify.app` — esse é o endereço definitivo para
   compartilhar com a equipe.

Da próxima vez que precisar mudar alguma coisa (ex.: trocar a paleta de
cores, ajustar um texto), basta atualizar o arquivo no GitHub — o Netlify
percebe a mudança e republica sozinho em menos de um minuto.

Opcional: você pode renomear o site (Site settings → Change site name)
para algo como `painel-gra.netlify.app`, ou conectar um domínio próprio da
empresa depois, se quiser.

## 9. Testar

Depois do deploy, abra o link gerado pelo Netlify no navegador e tente
logar com um dos usuários criados no passo 4. Se aparecer o painel com o
calendário de obrigações, está tudo certo.

> **Diferente de antes, não dá mais para testar dando duplo clique no
> arquivo.** Este projeto usa "módulos" de JavaScript, um recurso moderno
> que só funciona quando os arquivos são servidos por um endereço
> `http://` ou `https://` (como o link do Netlify) — dando duplo clique
> direto no arquivo, o navegador bloqueia o carregamento por segurança.
> Isso não é um problema no dia a dia: como a publicação agora é
> automática (passo 8), o fluxo normal já é sempre testar pelo link
> publicado.

## 10. Segurança — o que isso garante e o que ainda depende de você

O que você ganha com essa estrutura: ninguém acessa nem edita o painel sem
e-mail e senha válidos; a senha nunca fica visível em lugar nenhum (o
Supabase cuida da criptografia); só administradores conseguem
cadastrar/editar/excluir obrigações e empresas, e só administradores
podem promover ou rebaixar outras contas (garantido pelo próprio banco de
dados, não só pela tela); e você controla exatamente quem tem conta e quem
é administrador — tudo isso direto pela aba Gerenciar → Equipe, depois do
primeiro admin criado no passo 5.

O que continua sendo sua responsabilidade: escolher senhas fortes para a
equipe, desativar o acesso de quem sair do time (**Authentication → Users
→ excluir/desativar**), não compartilhar a senha do banco de dados
(diferente da senha de login da equipe) com ninguém, e manter o
repositório do GitHub como **privado**.

## 11. Backup dos dados (recomendado, gratuito)

De vez em quando (por exemplo, uma vez por mês), vale exportar uma cópia
dos dados, por segurança:

1. No Supabase, vá em **Table Editor**.
2. Para cada tabela (`obligations`, `completions`, `companies`,
   `profiles`), clique nos três pontinhos → **Export data → Export to
   CSV**, e guarde os arquivos baixados numa pasta seguro (ex.: Google
   Drive da empresa).

Isso não custa nada e não depende de nenhuma ferramenta paga — é só um
hábito recomendado para não depender só do que está online.

## Onde pedir ajuda

Se algo neste guia não bater com o que você está vendo na tela do
Supabase, Netlify ou GitHub, é provável que a interface deles tenha mudado
de layout desde que este guia foi escrito — a lógica (criar tabela,
promover admin, conectar GitHub) continua a mesma, só os botões podem
estar em lugares um pouco diferentes.
