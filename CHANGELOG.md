# O que mudou nesta refatoração — e por quê

Resumo para você explicar à equipe (ou só para consulta sua). Nada do que a
equipe faz no dia a dia muda: continuam acessando pelo navegador, com
e-mail e senha, vendo o mesmo visual e as mesmas funções.

## 1. Duas pessoas não sobrescrevem mais o trabalho uma da outra

**Antes:** o painel inteiro (todas as obrigações e conclusões de todo
mundo) ficava guardado como um único "pacote" de dados. Quando alguém
salvava algo, o pacote inteiro era regravado. Se duas pessoas mexessem no
painel ao mesmo tempo — por exemplo, uma marcando uma obrigação como
concluída e outra cadastrando uma nova —, a segunda gravação podia
sobrescrever a primeira sem nenhum aviso. Isso é chamado de conflito
"last-write-wins" e é um risco real em qualquer ferramenta usada por mais
de uma pessoa ao mesmo tempo.

**Agora:** cada obrigação e cada conclusão é guardada separadamente no
banco de dados. Marcar uma obrigação como concluída só grava aquela
conclusão específica — não toca em mais nada. Se, por azar, duas pessoas
clicarem "concluído" na mesma obrigação no mesmo segundo, o sistema
detecta a duplicidade e evita gravar duas vezes, sem perder o registro de
ninguém.

## 2. Nem todo mundo pode cadastrar ou excluir obrigações

**Antes:** qualquer pessoa com login conseguia cadastrar, editar ou
excluir qualquer obrigação do painel.

**Agora:** existem dois níveis de acesso:
- **Administrador** — pode cadastrar, editar e excluir obrigações e
  empresas, e alterar quem é administrador ou membro, além de tudo que um
  membro pode fazer.
- **Membro** — vê o painel inteiro e marca obrigações como concluídas (ou
  desfaz uma conclusão que ele mesmo registrou), mas não cadastra, edita
  nem exclui obrigações, empresas ou papéis de acesso.

Essa regra é garantida pelo próprio banco de dados, não só escondendo
botões na tela — então é uma proteção de verdade, não só uma questão de
aparência. Por padrão, todo mundo entra como "membro"; você decide quem
vira administrador (normalmente 1–2 pessoas da controladoria).

## 3. Administradores agora gerenciam tudo direto pelo painel

**Antes:** cadastrar/editar obrigações já era possível pela tela; mas
cadastrar empresas só acontecia de forma indireta (digitando um nome novo
no formulário de obrigação, sem opção de renomear ou excluir depois), e
promover alguém a administrador exigia entrar no SQL Editor do Supabase.

**Agora:** a aba "Gerenciar" ganhou três seções, visíveis só para
administradores:
- **Obrigações** — cadastrar, editar e excluir (como já era).
- **Empresas** — cadastrar, renomear e excluir, com contagem de quantas
  obrigações estão vinculadas a cada uma.
- **Equipe** — ver todas as contas e alternar o papel de acesso
  (admin ⇄ membro) de qualquer pessoa com um clique.

Criar a conta em si (e-mail/senha) continua sendo feito pelo painel do
Supabase — é a forma mais simples de manter isso sem custo e sem expor
credenciais sensíveis no navegador — mas agora, depois que a conta existe,
tudo o mais (inclusive promover a admin) é feito dentro do próprio painel,
sem precisar mexer em SQL no dia a dia.

## 4. Sem mais "OK" e "Cancelar" do navegador

**Antes:** ações como excluir uma obrigação ou desfazer uma conclusão
usavam as caixinhas cinzas padrão do navegador ("Tem certeza? OK/Cancelar"),
que têm cara de spam/propaganda para muita gente e não seguem o visual do
painel.

**Agora:** as confirmações e os avisos (ex.: "obrigação salva",
"não foi possível salvar, tente de novo") aparecem integrados ao visual do
painel — janelinhas de confirmação e notificações discretas no canto da
tela, sem interromper o fluxo.

## 5. Avisos claros quando a internet cai

**Antes:** se a conexão com o banco de dados falhasse, o erro só aparecia
no "console" do navegador — um lugar técnico que ninguém da equipe olha.
Na prática, parecia que o painel simplesmente não fazia nada.

**Agora:** falhas de conexão aparecem como um aviso vermelho no topo do
painel, explicando o que houve e com um botão para tentar de novo.

## 6. Publicação deixou de ser manual

**Antes:** publicar uma alteração era: editar o arquivo HTML no
computador → arrastar de novo para o Netlify Drop. Fácil, mas manual, sem
histórico de versões, e fácil de esquecer um passo.

**Agora:** o projeto fica guardado no GitHub (gratuito, com histórico
completo de tudo que mudou) e a publicação é automática — assim que um
arquivo é atualizado no GitHub, o site é republicado sozinho em menos de
um minuto. Reduz o risco de erro manual e dá para voltar a uma versão
anterior se algo sair errado.

## 7. Código mais fácil de manter no futuro

Por trás da tela, o código foi reorganizado (mais moderno, dividido em
arquivos menores por responsabilidade, com comentários explicando as
partes mais importantes). Isso não muda nada para quem usa o painel, mas
significa que futuras alterações ou correções são mais rápidas e com menos
risco de quebrar algo sem querer.

## 8. Um bug de exibição corrigido

Durante a refatoração, identificamos e corrigimos um problema técnico
sutil na tela de cadastro/edição de obrigações que, dependendo do
navegador, podia deixar uma camada invisível cobrindo a tela e
ocasionalmente atrapalhando cliques. Não era visível a olho nu, mas foi
corrigido — mais uma vantagem de ter revisado o código a fundo.

## 9. "Minhas obrigações" e cadastro em massa por CSV

**Antes:** para saber "o que é meu", cada pessoa tinha que usar o filtro
"Todos os responsáveis" toda vez que abria o painel. E cadastrar uma leva
de obrigações novas (por exemplo, ao adicionar uma empresa nova) era
clicar em "+ Nova obrigação" uma vez para cada item, manualmente.

**Agora:**
- Uma aba nova, **"Minhas obrigações"**, mostra de cara só o que está
  vinculado à sua conta — sem precisar mexer em filtro nenhum.
- O campo "Responsável", no cadastro de obrigação, passou a oferecer a
  lista de contas da equipe (além da opção "Outro", para quem não usa o
  sistema, como um contador terceirizado) — isso é o que torna "Minhas
  obrigações" confiável, em vez de depender de bater um texto digitado.
- Uma tela nova em Gerenciar → **Importar CSV** permite cadastrar várias
  obrigações de uma vez, enviando uma planilha. O painel confere cada
  linha antes de gravar qualquer coisa, mostra o que está pronto para
  importar e o que tem erro (com o motivo), cria empresas novas
  automaticamente e tenta vincular o responsável a alguém já cadastrado.
  Só depois de você conferir e confirmar é que os dados entram no banco.

## 10. Oito melhorias de gestão, de uma vez

> **Sobre os dados que já estão cadastrados:** nenhuma obrigação, conclusão,
> empresa ou conta foi apagada ou alterada por essas mudanças. Todas as
> novidades usam tabelas e colunas novas, adicionadas ao banco sem tocar
> no que já existia — isso foi testado explicitamente antes da entrega.

Essa leva de mudanças foi pensada para o painel deixar de ser só um
"quadro de status" e virar uma ferramenta que ajuda a equipe a não deixar
nada passar.

**Prioridade nas obrigações.** Dá para marcar uma obrigação como Baixa,
Média, Alta ou Crítica. As de prioridade Alta/Crítica ganham um selo
vermelho no cartão, para chamar atenção mesmo que o prazo ainda esteja
longe.

**Comentários por obrigação.** Dentro do cadastro de cada obrigação, agora
dá para deixar recados para o time — "confirmado com o contador",
"prazo mudou, aguardando confirmação" — sem precisar de e-mail ou grupo de
WhatsApp paralelo.

**Histórico de quem mexeu em quê.** Toda criação, edição e exclusão de
obrigação fica registrada (quem fez, quando, o que mudou), visível para
administradores em Gerenciar → Histórico. Útil para auditoria e para
entender "por que isso mudou" sem precisar perguntar.

**Ajuste automático para dia útil.** Uma obrigação pode ser marcada para
"empurrar o vencimento se cair num fim de semana ou feriado". Feriados
nacionais podem ser importados com um clique; feriados estaduais/municipais
específicos da sua região, cadastrados manualmente.

**Comprovante anexado.** Ao marcar uma obrigação como concluída, aparece
um convite (opcional) para já anexar o comprovante — a guia paga, o
protocolo de envio, o que for. Fica salvo junto com aquela conclusão
específica, disponível para consulta depois.

**Relatório de cumprimento no prazo.** Uma aba nova (administradores)
mostra que porcentagem das obrigações dos últimos 6 meses foi cumprida no
prazo — geral, por empresa e por responsável. Dá para enxergar padrões
("essa empresa está sempre atrasando", "esse tipo de obrigação é
recorrente atrasar") sem precisar contar na mão.

**Alertas por e-mail.** Todo dia útil de manhã, quem tem obrigação
atrasada ou vencendo em breve recebe um e-mail automático — sem precisar
abrir o painel para descobrir. Administradores recebem também um resumo
geral da equipe inteira. (Esse item precisa de uma configuração extra,
opcional — ver SETUP.md.)

**Instalar como aplicativo.** O painel agora pode ser "instalado" no
celular ou no computador (como um aplicativo de verdade, com ícone
próprio), direto pelo navegador — sem passar por loja de aplicativo nenhuma.

## 11. Dia útil fiscal, checklist obrigatório e comprovante obrigatório

> **Sobre os dados que já estão cadastrados:** de novo, nada foi apagado —
> conferido explicitamente antes desta entrega, populando dados de teste e
> reaplicando o script por cima.

**Dia útil fiscal de verdade.** A versão anterior só evitava que um
vencimento caísse num fim de semana ou feriado. Agora dá para marcar uma
obrigação como "Nº-ésimo dia útil do mês" (ex.: 10º dia útil), que é como
várias obrigações fiscais brasileiras realmente funcionam — o painel conta
os dias úteis certinho, pulando fins de semana e os feriados cadastrados.

**Checklist por obrigação.** Cada obrigação pode ter uma lista de passos
cadastrada (ex.: "conferir base de cálculo", "gerar guia", "enviar
comprovante ao contador"). Na hora de concluir, todo item precisa estar
marcado — o botão "Concluir" só libera depois.

**Comprovante agora é obrigatório.** Antes era um convite opcional depois
de concluir; agora, concluir sem anexar o comprovante não é mais possível
— nem pela tela, nem "por fora" direto no banco (adicionamos uma trava lá
também, por segurança). Isso vale só para conclusões novas — nada do que
já foi concluído sem comprovante antes dessa mudança foi afetado.

**"Quem concluiu e quando" ficou visível.** Essa informação sempre existiu
no banco, mas antes só aparecia escondida. Agora está direto no cartão de
cada obrigação no painel, e também na lista de Gerenciar.

## O que continua exatamente igual

- Visual do painel (cores, tipografia, layout dos cartões).
- Login por e-mail e senha, sem precisar instalar nada.
- Categorias, frequências (mensal/trimestral/anual/pontual), grupos por
  status (atrasada / vence em breve / no prazo / sem pendência).
- Uso 100% pelo navegador — nada muda na rotina de quem só usa o painel.
- Nenhum custo recorrente novo: continua tudo nos planos gratuitos do
  Supabase, GitHub e Netlify/Vercel.
