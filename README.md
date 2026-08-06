# Painel de Obrigações Acessórias — README técnico

Este documento é para quem vai mexer no código. Para o passo a passo de
publicação em linguagem simples, veja `SETUP.md`.

## Visão geral da arquitetura

```
painel-obrigacoes/
├── index.html              shell HTML (login + <div id="app">)
├── manifest.json            manifesto PWA (instalar no celular/desktop)
├── sw.js                     service worker mínimo (só para instalabilidade — não cacheia nada)
├── icons/                    ícones do PWA (192px e 512px)
├── package.json              dependências só do script de alertas por e-mail (o painel em si não usa)
├── css/
│   └── styles.css          identidade visual (preservada do painel original)
├── js/
│   ├── config.js            ← único arquivo que você edita para publicar
│   ├── supabaseClient.js    cria o cliente Supabase a partir do config.js
│   ├── constants.js         categorias, prioridades, rótulos de frequência, nomes de mês
│   ├── dateUtils.js         cálculo de ocorrências, prazos, status, ajuste de dia útil (puro, sem DOM)
│   ├── state.js             estado em memória da sessão atual
│   ├── data.js               ações de negócio (marcar concluído, salvar, excluir…)
│   ├── csv.js                 leitura, validação e modelo do CSV de importação em massa
│   ├── render.js             monta a tela e distribui os cliques (delegação de eventos)
│   ├── app.js                 ponto de entrada: autenticação, boot, registro do service worker
│   ├── api/
│   │   ├── auth.js           login/logout/perfil
│   │   ├── obligations.js    CRUD de obrigações (inclui inserção em massa)
│   │   ├── completions.js    marcar/desfazer conclusões, anexar comprovante
│   │   ├── companies.js      empresas
│   │   ├── profiles.js       equipe (listar contas, alterar papel de acesso)
│   │   ├── comments.js       comentários por obrigação
│   │   ├── checklist.js      itens de checklist por obrigação
│   │   ├── auditLog.js       trilha de auditoria (somente leitura)
│   │   ├── holidays.js       feriados (cadastro manual + importação via BrasilAPI)
│   │   ├── obligationRules.js  CRUD do catálogo de regras/modelos de mercado
│   │   └── storage.js        upload e link assinado dos comprovantes (Supabase Storage)
│   └── ui/
│       ├── login.js           tela de login
│       ├── toolbar.js         abas + filtros
│       ├── board.js           painel (cartões agrupados por status; também usado pela aba "Minhas obrigações")
│       ├── manage.js          aba "Gerenciar": orquestra as 7 sub-abas abaixo
│       ├── manageObligations.js  sub-aba Obrigações (lista administrativa)
│       ├── manageCompanies.js    sub-aba Empresas (cadastrar/renomear/excluir)
│       ├── manageTeam.js         sub-aba Equipe (alternar papel admin/membro)
│       ├── manageImport.js       sub-aba Importar CSV (cadastro em massa)
│       ├── manageRules.js        sub-aba Regras (catálogo de obrigações de mercado)
│       ├── manageHolidays.js     sub-aba Feriados
│       ├── manageAudit.js        sub-aba Histórico (trilha de auditoria)
│       ├── reports.js            aba Relatórios (taxa de cumprimento no prazo)
│       ├── modal.js           formulário de nova/editar obrigação + comentários + checklist
│       ├── ruleModal.js       formulário de nova/editar regra do catálogo de mercado
│       ├── completeDialog.js  diálogo de conclusão: checklist + comprovante obrigatórios
│       ├── toast.js           notificações não-bloqueantes (substitui alert())
│       └── confirmDialog.js   diálogo de confirmação (substitui confirm())
├── scripts/
│   └── enviar-alertas.mjs    script Node — alertas diários por e-mail (roda via GitHub Actions)
├── .github/workflows/
│   └── alertas-diarios.yml   agenda o script acima (grátis, GitHub Actions)
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

Visível só para quem tem perfil `admin`. Tem oito sub-abas:

- **Obrigações** — cadastrar, editar, excluir (o CRUD original).
- **Empresas** — cadastrar, renomear, excluir; mostra o regime tributário
  de cada empresa e o botão para trazer as obrigações desse regime
  automaticamente (ver seção "Regimes tributários" abaixo). Ao excluir uma
  empresa que tenha obrigações vinculadas, o vínculo simplesmente vira
  nulo nessas obrigações (`on delete set null` no schema) — a obrigação
  não é apagada.
- **Equipe** — cria contas novas e lista todas as contas (`profiles`),
  permitindo alternar o papel de acesso (`admin` ⇄ `membro`) com um clique
  (ver seção "Criação de contas de usuário" abaixo).
- **Importar CSV** — cadastro em massa (ver seção própria abaixo).
- **Regras** — catálogo de obrigações-padrão praticadas no mercado (ver seção própria abaixo).
- **Regimes tributários** — catálogo de regimes (Simples, Presumido, Real, MEI) e o vínculo deles com as regras e com as empresas (ver seção própria abaixo).

Um administrador pode, inclusive, remover o próprio acesso de admin — a
interface pede confirmação extra nesse caso (`data.js → doChangeRole`),
mas não bloqueia, para não deixar o sistema sem ninguém com esse poder em
caso de erro deliberado. Se isso acontecer sem querer, outro admin resolve
pela tela, ou, na ausência de qualquer admin, pelo SQL Editor do Supabase
(`update profiles set role='admin' where email='...'`).

## Criação de contas de usuário

Em Gerenciar → Equipe, um admin preenche nome, e-mail, senha temporária (ou clica em "Gerar" para uma sugestão) e papel de acesso, e clica em "+ Criar conta".

- **Como funciona sem `service_role key`:** o app não tem — e não deveria ter, num projeto 100% client-side — a chave administrativa do Supabase. A criação usa `auth.signUp()` normal (a mesma chamada que um cadastro público usaria), só que numa **instância temporária e separada** do cliente Supabase (`js/api/adminUsers.js`, `persistSession: false`), para não trocar a sessão de quem está logado (o admin) pela da conta recém-criada.
- **O perfil nasce sozinho:** o gatilho `handle_new_user` (já existente no schema, seção 1) cria a linha em `profiles` automaticamente assim que a conta é criada, com papel `membro` por padrão — o app só ajusta nome de exibição e papel logo em seguida, do mesmo jeito que já fazia para contas existentes.
- **Anote a senha na hora:** ela é mostrada uma única vez, numa caixa verde destacada, com um botão para copiar. Nada fica salvo no painel depois disso — se perder, é preciso gerar uma nova conta ou pedir para a pessoa usar "esqueci minha senha" na tela de login (se o projeto tiver isso configurado).
- **Limitação conhecida — confirmação de e-mail:** se o projeto Supabase tiver a opção "Confirm email" ligada (padrão em projetos novos), a pessoa só consegue entrar depois de clicar no link de confirmação enviado por e-mail — ou um admin confirmar manualmente em Authentication → Users no painel do Supabase. Isso é uma configuração do projeto, fora do alcance do que dá para controlar a partir do navegador.

## Responsável vinculado a uma conta (`responsible_id`)

Cada obrigação tem dois campos relacionados: `responsible` (texto livre,
sempre exibido nos cartões e na lista) e `responsible_id` (referência
opcional para `profiles.id`). No formulário, o campo "Responsável" agora é
um seletor com as contas da equipe, mais uma opção "Outro" que revela um
campo de texto livre — para casos em que o responsável não é usuário do
sistema (ex.: contador terceirizado). Quando alguém da equipe é escolhido,
os dois campos ficam sempre sincronizados (`responsible` reflete o
`display_name` do perfil escolhido); quando é "Outro", só o texto livre é
gravado e `responsible_id` fica nulo.

Esse vínculo é o que permite a aba **"Minhas obrigações"** filtrar de forma
confiável (`ob.responsible_id === STATE.session.id`), em vez de depender de
comparação de texto — que quebraria com qualquer diferença de acentuação,
maiúsculas ou apelido. Obrigações cadastradas antes dessa mudança (ou
importadas com um nome que não bate com nenhuma conta) continuam
funcionando normalmente no restante do painel, só não aparecem em "Minhas
obrigações" até alguém editar e vincular o responsável certo.

## Importação em massa (CSV)

Em Gerenciar → Importar CSV. Fluxo em duas etapas, pensado para nunca
gravar dado inválido no banco:

1. **Escolher arquivo** → `js/csv.js` lê o CSV (via PapaParse, carregado
   por CDN em `index.html`) e valida cada linha localmente, no navegador,
   sem tocar no banco ainda. O resultado (`STATE.importPreview`) mostra
   quantas linhas estão prontas e quais têm erro, com o motivo específico
   por linha (ex.: `"categoria inválida"`, `"dia inválido (1-31)"`).
2. **Confirmar importação** → só as linhas válidas são enviadas. Para cada
   uma: a empresa é criada se ainda não existir (`ensureCompany`, mesmo
   mecanismo do formulário manual); o nome do responsável é comparado
   (sem diferenciar maiúsculas/minúsculas) com `STATE.profiles` — se bater,
   vincula por `responsible_id`; senão, fica como texto livre. Todas as
   linhas são gravadas numa única chamada (`createObligationsBulk`), que é
   tudo-ou-nada no banco — não existe risco de metade importar e metade
   não por causa de uma falha de rede no meio do caminho.

Colunas esperadas no CSV (cabeçalho em português, minúsculo — veja
`CSV_COLUMNS` em `js/csv.js`): `nome, categoria, empresa, responsavel,
frequencia, dia, mes, meses, data, observacoes`. `categoria` e
`frequencia` usam as mesmas chaves internas do sistema (`federal`,
`estadual`, `municipal`, `trabalhista`, `societaria` / `mensal`,
`trimestral`, `anual`, `pontual`) — o botão "Baixar modelo CSV" na própria
tela gera um arquivo de exemplo já no formato certo.

## Regras de obrigações (catálogo de mercado)

Gerenciar → Regras é um catálogo de obrigações-padrão (`obligation_rules`), mantido pela **gerência** (perfil `admin`, que já é quem representa a gestão no modelo de acesso do painel — não existe um papel separado de "gerência"): criar, editar e excluir uma regra de mercado (DCTFWeb, ICMS-ST, ECD etc.), com categoria, frequência, dia de vencimento (fixo ou Nº-ésimo dia útil), ajuste de dia útil e observações.

Uma regra é só um **modelo de referência** — nunca uma obrigação de verdade de nenhuma empresa:
- **Usar como modelo:** no formulário de "Nova obrigação", um seletor opcional "Usar modelo de mercado" pré-preenche nome/categoria/frequência/dia/mês(es)/ajuste de dia útil/observações a partir de uma regra escolhida. Só existe ao **criar** (não ao editar uma obrigação já existente).
- **Sem vínculo permanente:** escolher uma regra só copia os valores para o formulário naquele momento. Depois de salva, a obrigação é independente — editar ou excluir a regra original mais tarde não muda nada nas obrigações já cadastradas a partir dela.
- **Frequências suportadas:** só `mensal`, `trimestral`, `anual` — uma regra reutilizável não faz sentido para `pontual` (data única), que por definição não se repete.

O schema já vem com um **seed** de obrigações comuns no mercado brasileiro (DCTFWeb, EFD Contribuições, FGTS, DAS do Simples Nacional, ICMS-ST, ISS, ECD, ECF), inserido com `on conflict (name) do nothing` — roda de novo sem duplicar nem sobrescrever o que a gerência já tiver customizado. **Atenção:** essas datas são referências de mercado amplamente praticadas, não aconselhamento tributário — confira sempre contra a legislação/calendário oficial vigente antes de usar como modelo (prazos mudam por lei, prorrogação ou particularidade de UF/município).

**Aplicar um modelo a várias empresas de uma vez:** em Gerenciar → Regras, cada regra tem um botão "🏢 Aplicar a empresas" que abre um diálogo com checkbox por empresa cadastrada (mais "marcar todas"/"desmarcar todas"). Ao confirmar, cria uma obrigação nova em cada empresa marcada, copiando os campos da regra (`js/data.js`, `doApplyRuleToCompanies`) — uma chamada só em `createObligationsBulk`. Empresas que **já** têm uma obrigação com o mesmo nome são puladas automaticamente (comparação simples por nome, já que não existe um vínculo formal entre regra e obrigação); o toast final informa quantas foram criadas e quantas foram puladas. Assim como o uso individual, isso continua sendo só uma cópia inicial dos valores — depois de criadas, as obrigações são independentes da regra.

## Regimes tributários e obrigações automáticas por empresa

Em Gerenciar → Regimes tributários, a gerência mantém um catálogo de regimes (`tax_regimes`: Simples Nacional, Lucro Presumido, Lucro Real, MEI) e liga cada um a duas coisas, tudo na mesma tela:

- **🔗 Vincular obrigações:** um diálogo de checkboxes com todo o catálogo de regras (Gerenciar → Regras) — marca quais obrigações valem para aquele regime (tabela M:N `tax_regime_rules`, já que uma obrigação como FGTS costuma valer para vários regimes ao mesmo tempo).
- **🏢 Vincular empresas:** um diálogo parecido, mas com as empresas cadastradas. Cada empresa só tem **um** regime por vez (`companies.tax_regime_id`) — marcar uma empresa que já estava em outro regime move ela para o novo, e o diálogo avisa isso antes de salvar.

Com os dois vínculos feitos, **Gerenciar → Empresas** mostra o regime de cada empresa e um botão **"📋 Trazer obrigações do regime"**: cria de uma vez só uma obrigação para cada regra vinculada ao regime da empresa (pulando as que ela já tem, comparando por nome), já com o **checklist-padrão** de cada regra copiado (`obligation_rules.checklist_template`, um passo por linha, editável no modal de regra) — ver próxima seção sobre como esse checklist funciona depois de criado.

**Não é aconselhamento tributário nem integração com uma base de dados oficial do Governo:** não existe hoje uma API pública estruturada e gratuita com a relação "regime → obrigação" pronta para consumir — o schema já vem com um vínculo inicial curado manualmente a partir de prática de mercado (seção 16 do `sql/schema.sql`), do mesmo jeito e com a mesma ressalva do catálogo de regras. Confira sempre o enquadramento fiscal real de cada empresa (atividade, faturamento, UF, município) antes de usar como modelo.

## Ajuste de data de uma ocorrência (exceção pontual)

Além de editar a regra de recorrência inteira, a gerência pode prorrogar ou antecipar a data de vencimento de **uma única ocorrência**, sem mexer na recorrência das próximas. Em Gerenciar → Obrigações, o botão "🗓 Ajustar data" (visível quando há uma próxima ocorrência calculada) abre um diálogo para escolher a nova data e, opcionalmente, um motivo (ex.: "prorrogação divulgada pela Receita").

- **Onde fica salvo:** tabela nova `obligation_date_overrides` (`obligation_id`, `original_date`, `override_date`, `reason`), com uma chave única em `(obligation_id, original_date)` — ou seja, um ajuste por ocorrência. `original_date` é a data bruta calculada pela regra (a mesma usada como identidade da ocorrência para fins de conclusão/histórico); `override_date` é a data efetiva mostrada na tela.
- **O que muda visualmente:** o cartão no Painel, a lista de Gerenciar → Obrigações, a Lista de risco e o score preditivo da Visão Executiva passam a considerar a data ajustada (`displayDate`) para status/ordenação/cor, e mostram um aviso "📌 data ajustada manualmente" com a data padrão original entre parênteses.
- **O que não muda:** a conclusão da ocorrência continua vinculada à `original_date` — o ajuste é só uma camada de exibição por cima do cálculo normal (`js/state.js`, `activeOccurrences()`), não altera `getActiveOccurrence`/`occurrencesInRange` nem o script de alertas por e-mail (`scripts/enviar-alertas.mjs`), que continuam enxergando a data bruta da regra. Isso é uma limitação conhecida: os e-mails de alerta ainda não avisam com base na data ajustada, só o painel.
- **Remover um ajuste:** reabrir o mesmo diálogo mostra um botão "Remover ajuste" que apaga a exceção e volta a usar o vencimento padrão da regra.

## Prioridade, checklist, comentários e histórico

- **Prioridade** (`obligations.priority`): `baixa | media | alta | critica`, validada só na interface (dropdown fechado). Obrigações `alta`/`critica` ganham um selo vermelho no cartão, independente do status de prazo.
- **Checklist** (`checklist_items`): lista de passos cadastrada pelo admin em cada obrigação (aparece dentro do modal de edição), opcionalmente pré-populada a partir do checklist-padrão de uma regra/regime (ver seções acima). Cada item guarda seu **próprio estado marcado/desmarcado** (`completed`, `completed_by`, `completed_at`) — qualquer pessoa autenticada pode marcar um passo direto no cartão do Painel (ou na lista de Gerenciar → Obrigações) ao longo do período, sem precisar abrir o diálogo de conclusão, e o percentual do ciclo atual ("Checklist: 2/5 — 40%") aparece ao vivo nos dois lugares. Marcar/desmarcar passa por uma função do banco (`set_checklist_item_done`, `security definer`) em vez de um update direto — assim não é preciso ser admin para concluir um passo (só para criar/editar/excluir os passos em si, que continuam sendo o "modelo" definido pela gerência). O diálogo de conclusão (`ui/completeDialog.js`) continua exigindo tudo marcado antes de liberar o botão "Concluir", mas agora abre com os itens já marcados que a pessoa foi resolvendo durante o período — e ainda dá para marcar o que faltar ali mesmo. Depois de uma conclusão bem-sucedida, o checklist é reiniciado (`reset_checklist_items`) para o próximo ciclo (mês/trimestre/ano seguinte) começar do zero, sem perder o que já ficou registrado na conclusão anterior (`completions.checklist_total`/`checklist_checked`, usado para mostrar "3/3 itens" no histórico de conclusões).
- **Comentários** (`obligation_comments`): qualquer pessoa autenticada comenta; só o autor ou um admin exclui. Aparecem dentro do modal de edição da obrigação (só quando editando, não ao criar — precisa existir um `obligation_id`).
- **Trilha de auditoria** (`audit_log`): populada automaticamente por gatilhos (`log_obligation_change()`) em todo INSERT/UPDATE/DELETE de `obligations`. Não existe política de escrita para o papel `authenticated` nessa tabela — só o gatilho grava (via `security definer`), e só admins conseguem consultar (aba Gerenciar → Histórico).
- **Quem concluiu e quando**: sempre foi gravado (`completions.done_by_name`, `completions.done_at`), mas numa versão anterior não estava visível na tela. Agora aparece direto no cartão do painel (`.card-last-completion`) e na lista de Gerenciar → Obrigações.

## Feriados e dia útil fiscal

Cada obrigação tem dois campos independentes relacionados a dia útil, que resolvem problemas diferentes:

- **`day_type = 'util_do_mes'`** — muda o *significado* de `day_of_month`: em vez de "todo dia 10", passa a ser **"o Nº-ésimo dia útil do mês"** (ex.: 10 = 10º dia útil), contando a partir do dia 1 e pulando fins de semana e os feriados cadastrados em `holidays`. Implementado em `dateUtils.js → nthBusinessDayOfMonth()`. Isso cobre o caso de uso fiscal real (EFD Contribuições, por exemplo, costuma vencer no "10º dia útil").
- **`adjust_business_day`** — depois de calculada a data (fixa ou por dia útil), empurra para a frente se ainda assim cair num fim de semana/feriado (`shiftToBusinessDay()`). É um ajuste de segurança adicional, independente do `day_type`.

Os dois podem ser usados juntos ou separados. Nenhum dos dois tenta adivinhar regras específicas de tributo/UF/município além de "pular fim de semana e feriado cadastrado" — para uma obrigação com regra de vencimento mais peculiar que isso, ajuste manualmente com base no calendário oficial do tributo.

Feriados podem ser cadastrados manualmente (Gerenciar → Feriados) ou importados automaticamente de **BrasilAPI** (`https://brasilapi.com.br/api/feriados/v1/{ano}`), um serviço público e gratuito mantido pela comunidade — não é do Supabase nem da Anthropic. Se ele ficar fora do ar, a importação automática falha mas o cadastro manual continua funcionando. **Importante:** BrasilAPI só cobre feriados **nacionais** — feriados estaduais e municipais (que afetam bastante obrigação municipal/ISS) precisam ser cadastrados manualmente.

## Comprovante obrigatório (Supabase Storage)

Bucket `comprovantes` (privado), criado pelo próprio `schema.sql` via `insert into storage.buckets`. **O comprovante é obrigatório desde esta versão** — marcar uma obrigação como concluída abre `ui/completeDialog.js`, que exige todos os itens do checklist marcados (se houver) **e** um arquivo anexado antes de habilitar o botão "Concluir". Cancelar o diálogo não grava nada — a conclusão só é criada depois que o upload do comprovante já deu certo, com `attachment_path` preenchido no mesmo INSERT (não é mais um passo separado como numa versão anterior).

Essa obrigatoriedade é aplicada em **duas camadas**, não só na tela:
1. A interface não deixa concluir sem os dois requisitos.
2. O banco tem uma constraint (`completions_attachment_required`, `check (attachment_path is not null)`) que rejeita qualquer INSERT sem comprovante — mesmo que alguém tente burlar a interface chamando a API diretamente.

A constraint foi adicionada com `NOT VALID` de propósito: isso faz a regra valer só para gravações **novas**, sem invalidar retroativamente conclusões antigas (registradas antes dessa mudança, sem comprovante) — elas continuam existindo normalmente no histórico.

Como o bucket é privado, a visualização usa um link assinado (`createSignedUrl`, válido por 1 hora), gerado sob demanda a partir do cartão no painel ou de Gerenciar → Obrigações.

## Conferência automática de competência do comprovante (OCR no navegador)

Ao anexar o comprovante em `ui/completeDialog.js`, o arquivo passa por leitura de texto **direto no navegador** (`js/ocr.js` — sem serviço externo pago, sem backend próprio, sem enviar o arquivo para lugar nenhum além do Supabase Storage). O texto lido é vasculhado por padrões de competência (`"competência 07/2026"`, `"período de apuração 07/2026"`, `"Julho de 2026"`, etc.) e comparado com o mês/ano da ocorrência sendo concluída — aceitando também o mês anterior, porque várias obrigações vencem num mês apurando a competência do mês passado.

Dois formatos são suportados, cada um do seu jeito:
- **Imagem** (foto/print do comprovante): OCR completo via [Tesseract.js](https://github.com/naptha/tesseract.js) (CDN em `index.html`).
- **PDF**: primeiro tenta ler o texto já embutido no arquivo via [pdf.js](https://mozilla.github.io/pdf.js/) (rápido e exato — cobre a maioria das guias geradas digitalmente, ex.: DARF/GPS emitidos por sistema). Se o PDF não tiver texto (documento escaneado ou foto salva como PDF), a primeira página é renderizada num `<canvas>` e passa pelo mesmo OCR das imagens.

**Isso é heurístico, de propósito nunca bloqueia sozinho:**
- Outros formatos (nem imagem, nem PDF) ficam marcados como "não verificado" (`ocr_status = 'not_checked'`), não como erro.
- Se não achar nenhuma data de competência reconhecível no texto lido (de nenhuma das duas fontes acima), também fica como "não verificado" — não impede a conclusão.
- Se achar uma competência que **não bate** com a ocorrência (nem o mês, nem o mês anterior), a pessoa vê um aviso na hora (`ui/completeDialog.js`) e precisa marcar "Confirmo que revisei e está correto mesmo assim" para o botão "Concluir" liberar — a conclusão é sempre gravada, só fica sinalizada (`completions.ocr_status = 'mismatch'`, `completions.ocr_extracted_period` com o texto encontrado).
- Divergências sinalizadas aparecem para o gestor em dois lugares: na Visão Executiva (seção "Divergências de comprovante") e no e-mail diário de resumo geral para administradores (`scripts/enviar-alertas.mjs`, últimas 24h).

**Limitação honesta:** leitura de OCR de documento fiscal real (guias escaneadas, fotos de celular, diferentes órgãos com layouts diferentes) é bem menos confiável do que ler texto embutido de um PDF nativo — espere alguns segundos de análise por arquivo (mais em PDF escaneado, que passa pelas duas etapas), e trate isso como um alerta a mais para o analista revisar, não como uma auditoria automática confiável. Só lê as duas primeiras páginas do PDF. Não foi testado contra uma variedade real de guias (DARF, GPS, boletos etc.), só com texto sintético nos testes automatizados.

## Relatórios (taxa de cumprimento)

Aba "Relatórios" (admin), calculada inteiramente no front-end a partir de `STATE.completions` — sem tabela nova. "No prazo" = a data de `done_at` é igual ou anterior à `occurrence_date` da conclusão. Mostra a taxa geral e quebrada por empresa e por responsável, considerando só os últimos 6 meses. Ficou restrito a admins de propósito: são dados de desempenho de pessoas específicas, e achamos mais apropriado isso não ficar visível para qualquer membro da equipe.

## Alertas diários por e-mail

Roda **fora do navegador**, via `scripts/enviar-alertas.mjs` (Node) agendado pelo GitHub Actions (`.github/workflows/alertas-diarios.yml`, gratuito). O script:

1. Conecta no Supabase com a `service_role key` (que nunca aparece no front-end).
2. Reaproveita as mesmas funções puras do painel (`getActiveOccurrence`, `statusOf` de `js/dateUtils.js`) para calcular o que está atrasado ou vencendo nos próximos N dias (padrão 5).
3. Agrupa por `responsible_id` e manda um e-mail por pessoa via **Resend** (grátis até 3.000 e-mails/mês), mais um resumo geral para os admins.

**Design deliberadamente simples**: é um lembrete diário — a mesma pendência aparece de novo todo dia até ser concluída, sem tabela de "já avisei isso" para deduplicar. Mais fácil de entender e depurar do que um sistema de dedup, e o custo de receber o mesmo lembrete de novo é baixo. Configuração completa (criar conta na Resend, configurar os Secrets no GitHub) no `SETUP.md`.

> **Limitação honesta:** este script foi testado com a lógica de seleção de pendências e o envio de e-mail totalmente mockados (sem rede real) — ele roda corretamente e produz os e-mails esperados nesse ambiente controlado. Não foi possível testar contra uma conta real da Resend nem contra o seu projeto Supabase de produção, porque isso exigiria credenciais que não temos. Antes de confiar 100% nele, rode manualmente pela aba **Actions** do GitHub (`workflow_dispatch`) depois de configurar os Secrets, e confira se o e-mail chega.

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
| Comentar numa obrigação                 |  ✅   |   ✅   |
| Excluir comentário de **outra pessoa**  |  ✅   |   ❌   |
| Cadastrar/excluir itens de checklist    |  ✅   |   ❌   |
| Ver trilha de auditoria                 |  ✅   |   ❌   |
| Cadastrar/excluir feriados              |  ✅   |   ❌   |
| Anexar comprovante a uma conclusão      |  ✅   |   ✅   |
| Ver relatórios de cumprimento           |  ✅   |   ❌   |
| Ver catálogo de regras de mercado       |  ✅   |   ✅   |
| Criar/editar/excluir regras de mercado  |  ✅   |   ❌   |

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

- **Criar** conta agora é feito pela própria interface (Gerenciar →
  Equipe), mas **desativar/excluir** uma conta ainda depende do painel do
  Supabase (Authentication → Users) — não existe hoje um fluxo de
  desativação no front-end. Promover/rebaixar quem **já tem conta** é
  feito direto pela aba Gerenciar → Equipe. Dependendo da configuração de
  confirmação de e-mail do projeto, a pessoa recém-criada pode precisar
  confirmar o e-mail (ou um admin confirmar manualmente pelo painel do
  Supabase) antes do primeiro login — ver seção "Criação de contas de
  usuário" acima.
- O **primeiro** administrador de um projeto novo ainda exige rodar um
  `UPDATE` manual no SQL Editor (documentado no SETUP.md), porque até esse
  ponto não existe nenhum admin para usar a tela de Equipe.
- O ajuste de "dia útil" combina duas regras: contar o Nº-ésimo dia útil
  do mês (`day_type = 'util_do_mes'`) e empurrar para longe de fins de
  semana/feriados cadastrados (`adjust_business_day`) — ver seção própria
  acima. Nenhuma das duas cobre regras de vencimento mais específicas por
  tributo/UF/município além disso.
- O vínculo "regime tributário → obrigação" (Gerenciar → Regimes
  tributários) é um ponto de partida curado manualmente, não uma
  integração com nenhuma base de dados oficial do Governo — não existe
  hoje uma API pública estruturada e gratuita para isso. Confira sempre o
  enquadramento fiscal real de cada empresa antes de usar como modelo.
- Conclusões registradas **antes** da mudança que tornou o comprovante
  obrigatório continuam existindo sem anexo — a regra nova não é
  retroativa (ver a constraint `NOT VALID` na seção de comprovantes).
- Os alertas por e-mail rodam fora do navegador e não foram testados
  contra uma conta real de e-mail nem contra um projeto Supabase de
  produção — só com rede mockada. Teste manualmente (`workflow_dispatch`
  no GitHub Actions) antes de confiar neles no dia a dia.
- Não há testes automatizados no repositório (a suíte de testes usada
  durante o desenvolvimento foi manual, com um mock do Supabase, e não faz
  parte da entrega). Se o projeto crescer, vale considerar algo simples
  como Playwright.
