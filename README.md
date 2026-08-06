# Painel de Obrigações Acessórias — README técnico

Este documento é para quem vai mexer no código. Para o passo a passo de
publicação em linguagem simples, veja `SETUP.md`.

## Visão geral da arquitetura

```
painel-obrigacoes/
├── index.html              shell HTML (login + <div id="app">)
├── css/
│   └── styles.css          identidade visual (preservada do painel original)
├── js/
│   ├── config.js            ← único arquivo que você edita para publicar
│   ├── supabaseClient.js    cria o cliente Supabase a partir do config.js
│   ├── constants.js         categorias, rótulos de frequência, nomes de mês
│   ├── dateUtils.js         cálculo de ocorrências, prazos, status (puro, sem DOM)
│   ├── state.js             estado em memória da sessão atual
│   ├── data.js               ações de negócio (marcar concluído, salvar, excluir…)
│   ├── render.js             monta a tela e distribui os cliques (delegação de eventos)
│   ├── app.js                 ponto de entrada: autenticação e boot
│   ├── api/
│   │   ├── auth.js           login/logout/perfil
│   │   ├── obligations.js    CRUD de obrigações
│   │   ├── completions.js    marcar/desfazer conclusões
│   │   └── companies.js      empresas
│   └── ui/
│       ├── login.js           tela de login
│       ├── toolbar.js         abas + filtros
│       ├── board.js           painel (cartões agrupados por status)
│       ├── manage.js          aba "Gerenciar": orquestra as 3 sub-abas abaixo
│       ├── manageObligations.js  sub-aba Obrigações (lista administrativa)
│       ├── manageCompanies.js    sub-aba Empresas (cadastrar/renomear/excluir)
│       ├── manageTeam.js         sub-aba Equipe (alternar papel admin/membro)
│       ├── modal.js           formulário de nova/editar obrigação
│       ├── toast.js           notificações não-bloqueantes (substitui alert())
│       └── confirmDialog.js   diálogo de confirmação (substitui confirm())
└── sql/
    └── schema.sql            tabelas, papéis (RLS) — rode isto no Supabase
```

**Sem build, sem bundler.** Tudo é JavaScript nativo com módulos ES6
(`<script type="module">` em `index.html`, `import`/`export` nos arquivos).
Isso significa hospedagem 100% estática funciona (Netlify, Vercel,
Cloudflare Pages, GitHub Pages) — basta subir a pasta inteira.

> **Atenção ao testar localmente:** módulos ES6 só carregam via `http://`,
> não via `file://` (o navegador bloqueia por CORS quando você dá duplo
> clique no `index.html`). Para testar antes de publicar, rode um servidor
> local simples, por exemplo `npx serve` ou `python3 -m http.server` na
> pasta do projeto, e abra `http://localhost:...` no navegador. Isso é
> diferente do painel antigo (arquivo único), que abria com duplo clique —
> veja o SETUP.md para o fluxo de teste recomendado (deploy de teste no
> Netlify a cada push, que já resolve isso automaticamente).

## Por que tabelas relacionais em vez do blob JSON antigo

O painel antigo salvava tudo — todas as obrigações e todas as conclusões —
em **uma única linha** (`board_state`, coluna `data jsonb`). Qualquer
gravação (inclusive "marcar concluído") reescrevia o documento inteiro.
Se duas pessoas salvassem ao mesmo tempo, a segunda gravação simplesmente
sobrescrevia a primeira sem aviso ("last write wins") — dados podiam
desaparecer silenciosamente.

Agora:
- `obligations` — uma linha por obrigação.
- `completions` — uma linha por ocorrência concluída (`obligation_id` +
  `occurrence_date`), com uma restrição `unique` no banco. Se duas pessoas
  clicarem "concluído" na mesma obrigação ao mesmo tempo, a segunda
  gravação falha com um erro de duplicidade — tratado no front-end (ver
  `data.js`, função `doMarkDone`) recarregando os dados em vez de
  corromper nada.
- `companies` — uma linha por empresa.
- `profiles` — uma linha por pessoa, com o papel de acesso (`admin` |
  `membro`).

Cada gravação afeta só a linha correspondente. Não existe mais "documento
inteiro" para conflitar.

## Telas de administração (aba "Gerenciar")

Visível só para quem tem perfil `admin`. Tem três sub-abas:

- **Obrigações** — cadastrar, editar, excluir (o CRUD original).
- **Empresas** — cadastrar, renomear, excluir. Ao excluir uma empresa que
  tenha obrigações vinculadas, o vínculo simplesmente vira nulo nessas
  obrigações (`on delete set null` no schema) — a obrigação não é apagada.
- **Equipe** — lista todas as contas (`profiles`) e permite alternar o
  papel de acesso (`admin` ⇄ `membro`) com um clique. **Criar** uma conta
  nova continua sendo feito pelo painel do Supabase (Authentication →
  Users) — não existe (de propósito) um endpoint no front-end para criar
  usuários, porque isso exigiria a `service_role key`, que não deve nunca
  ficar exposta no navegador. A tela de Equipe só lê/atualiza a tabela
  `profiles`, que já é criada automaticamente pelo gatilho do banco quando
  a conta é criada.

Um administrador pode, inclusive, remover o próprio acesso de admin — a
interface pede confirmação extra nesse caso (`data.js → doChangeRole`),
mas não bloqueia, para não deixar o sistema sem ninguém com esse poder em
caso de erro deliberado. Se isso acontecer sem querer, outro admin resolve
pela tela, ou, na ausência de qualquer admin, pelo SQL Editor do Supabase
(`update profiles set role='admin' where email='...'`).

## Papéis de acesso (RLS)

Implementado inteiramente com recursos gratuitos do Supabase (Postgres RLS
+ uma tabela `profiles` + uma função `security definer` para evitar
recursão nas políticas). Ver `sql/schema.sql` para o detalhe de cada
política. Resumo:

| Ação                                   | admin | membro |
|-----------------------------------------|:-----:|:------:|
| Ver obrigações e conclusões             |  ✅   |   ✅   |
| Marcar obrigação como concluída         |  ✅   |   ✅   |
| Desfazer **própria** conclusão          |  ✅   |   ✅   |
| Desfazer conclusão de **outra pessoa**  |  ✅   |   ❌   |
| Criar/editar/excluir obrigações         |  ✅   |   ❌   |
| Criar/editar/excluir empresas           |  ✅   |   ❌   |
| Alterar papel de acesso de alguém       |  ✅   |   ❌   |

Importante: essas regras são aplicadas **no banco de dados** (RLS), não só
escondendo botões na tela. Esconder o botão "Editar" para quem é membro é
só uma conveniência de interface — mesmo que alguém tente chamar a API
diretamente, o Postgres recusa a gravação se a pessoa não for admin. Isso é
o que torna esse controle de acesso confiável de verdade, e não só
cosmético.

O **primeiro** administrador do projeto precisa ser promovido manualmente
rodando um `UPDATE` no SQL Editor (passo a passo no SETUP.md), já que
ainda não existe nenhum admin para usar a tela de Equipe. Depois desse
primeiro passo, promover ou rebaixar qualquer outra pessoa já pode ser
feito direto pela aba Gerenciar → Equipe, sem precisar mais de SQL.

## Segurança contra XSS

Todo texto vindo de dados do usuário (nome da obrigação, observações, nome
de responsável, e-mail etc.) passa pela função `escapeHtml()`
(`js/dateUtils.js`) antes de entrar no HTML gerado. Isso vale para todos os
pontos onde o código monta HTML por concatenação de string (`board.js`,
`manage.js`, `modal.js`, `toolbar.js`, `toast.js`, `render.js`,
`confirmDialog.js`) — nenhum campo de texto livre é inserido sem escapar.

A chave pública do Supabase (`anon key`) em `config.js` fica exposta no
código-fonte por design — isso é seguro porque quem protege os dados de
verdade são as políticas de RLS no banco, não o sigilo dessa chave. Nunca
coloque a `service_role key` (essa sim é secreta) em nenhum arquivo deste
projeto.

## Feedback visual (sem `alert()`/`confirm()`)

- `js/ui/toast.js` — notificações não-bloqueantes no canto da tela
  (sucesso, erro, informação), com fechamento automático ou manual.
- `js/ui/confirmDialog.js` — diálogo de confirmação estilizado, usado antes
  de excluir uma obrigação ou desfazer uma conclusão. Retorna uma
  `Promise<boolean>`, então o código que chama (`data.js`) só continua se a
  pessoa confirmar.
- Erros de conexão com o Supabase (queda de internet, etc.) aparecem como
  um banner vermelho no topo do painel com botão "Tentar de novo"
  (`render.js`, função `renderConnBanner`), em vez de um erro silencioso só
  no console como no painel antigo.

## Fluxo de dados

1. `app.js` faz login, busca o perfil (`api/auth.js → fetchMyProfile`) e
   chama `data.js → loadAll()`, que busca `obligations`, `completions` e
   `companies` em paralelo.
2. `render.js → render()` monta a tela inteira a partir de `STATE`
   (`state.js`) e usa **delegação de eventos**: um único listener de clique
   no `#app` decide o que fazer com base no atributo `data-action` do
   elemento clicado. Isso evita ter que religar listeners a cada
   re-renderização.
3. Ações do usuário (marcar concluído, salvar, excluir) chamam funções de
   `data.js`, que conversam com `api/*.js`, atualizam `STATE` localmente e
   chamam `render()` de novo — sem recarregar a página inteira do
   Supabase a cada clique.

## Rodando localmente para desenvolvimento

```bash
# na pasta do projeto
npx serve .
# ou
python3 -m http.server 8080
```

Abra `http://localhost:.../index.html`, preencha `js/config.js` com as
credenciais de um projeto Supabase de teste (ou de desenvolvimento) e rode
`sql/schema.sql` nesse projeto antes de testar.

## Limitações conhecidas / próximos passos possíveis

- O gerenciamento de contas (criar/desativar usuário) continua sendo feito
  pelo painel do Supabase (Authentication → Users), não pela interface do
  painel — é a forma mais simples de manter isso sem custo e sem expor a
  `service_role key` no front-end. Promover/rebaixar quem **já tem
  conta**, porém, já é feito direto pela aba Gerenciar → Equipe.
- O **primeiro** administrador de um projeto novo ainda exige rodar um
  `UPDATE` manual no SQL Editor (documentado no SETUP.md), porque até esse
  ponto não existe nenhum admin para usar a tela de Equipe.
- Não há testes automatizados no repositório (a suíte de testes usada
  durante o desenvolvimento foi manual, com um mock do Supabase, e não faz
  parte da entrega). Se o projeto crescer, vale considerar algo simples
  como Playwright.
