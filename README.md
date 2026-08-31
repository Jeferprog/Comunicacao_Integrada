# Comunicação Integrada — Sistema de Comunicação da Equipe (Cresol Sicooper)

Aplicação web em **Google Apps Script** onde cada área da cooperativa cadastra
comunicados, um **supervisor da área** revisa (aprova / reprova / solicita correção)
e os aprovados são publicados no **Google Chat** — em um resumo diário automático ou
na hora, para urgências.

> **Nota de contexto (handoff):** este arquivo foi gerado a partir de uma sessão de
> desenvolvimento assistido. Ele documenta o projeto **e** serve de contexto para
> continuar a evolução (ex.: em uma nova sessão do Claude Code). As seções
> "Armadilhas conhecidas" e "Próximos passos" são especialmente úteis para quem for
> dar manutenção.

---

## 1. Arquivos do projeto

| Arquivo        | Papel |
|----------------|-------|
| `Code.gs`      | Back-end (Apps Script). Toda a lógica: config, fluxo de revisão, envio ao Chat, e-mails, anexos, gatilho diário. |
| `Index.html`   | Front-end (interface web servida pelo Apps Script). Três abas: Comunicados, Revisão e Config. O ícone da Cresol está embutido em base64. |
| `README.md`    | Este documento. |

O projeto é um **Apps Script vinculado a uma Planilha Google** (criado por
**Extensões → Apps Script** dentro da planilha "Comunicados da Equipe"). Não há
servidor externo, banco de dados externo nem custo de infraestrutura.

---

## 2. Como funciona (fluxo)

1. **Cadastrar** — qualquer colaborador registra um comunicado (área, data, título,
   mensagem, prioridade e um anexo opcional). Status inicial: `Aguardando`.
2. **Revisar** — o(s) **supervisor(es) da área** veem o comunicado na aba *Revisão* e
   escolhem: **Aprovar**, **Aprovar e enviar agora**, **Solicitar correção** ou
   **Reprovar**. A trava é feita **no servidor**: um supervisor só age sobre a própria área.
3. **Corrigir** (quando solicitado) — o comunicado volta ao autor com status
   `Correção`. Em *Meus comunicados*, o autor vê o ajuste pedido, corrige e reenvia
   (volta para `Aguardando`).
4. **Enviar** — aprovados entram no **resumo diário** (no horário configurado) ou vão
   **na hora** (opção "Aprovar e enviar agora"). Depois de enviados, ficam `Enviado`.
5. **Dias sem comunicados** — no mesmo horário, o sistema posta um **recado
   configurável** no Chat (se a opção estiver ligada).

Cada passo relevante dispara **e-mail automático** (ver seção 6).

---

## 3. Tecnologias / serviços Google usados

- **Apps Script** (web app via `HtmlService`, funções chamadas por `google.script.run`).
- **Planilha Google** — banco de dados (aba `Comunicados`).
- **Google Chat** — via **webhook** de um espaço (cards `cardsV2`).
- **Gmail/MailApp** — notificações por e-mail.
- **Google Drive** — armazenamento dos anexos (pasta "Anexos - Comunicação da Equipe").
- **Gatilho por tempo** (`ClockTrigger`) — dispara o resumo diário.

Escopos de autorização envolvidos: Planilhas, `UrlFetch` (webhook), `MailApp`,
`DriveApp`, `ScriptApp` (gatilhos) e leitura do e-mail do usuário (`userinfo.email`).

---

## 4. Modelo de dados (aba `Comunicados`)

Colunas (criadas automaticamente na 1ª execução):

| # | Coluna | Conteúdo |
|---|--------|----------|
| A | ID | UUID |
| B | Carimbo | data/hora do cadastro (texto) |
| C | DataPublicacao | data alvo `yyyy-MM-dd` (texto) |
| D | Area | área do comunicado |
| E | Titulo | título |
| F | Mensagem | corpo |
| G | Autor | nome digitado |
| H | Prioridade | `Normal` \| `Urgente` |
| I | Status | `Aguardando` \| `Aprovado` \| `Reprovado` \| `Correção` \| `Enviado` |
| J | EmailAutor | e-mail Google de quem cadastrou (automático) |
| K | RevisadoPor | e-mail do supervisor que revisou |
| L | Observacao | motivo da reprovação / ajuste pedido |
| M | AnexoURL | link do anexo no Drive |
| N | AnexoNome | nome do arquivo anexado |

> Colunas B e C são formatadas como **texto** para a Planilha não converter datas
> sozinha (ver "Armadilhas conhecidas").

---

## 5. Configurações (aba Config — guardadas em Script Properties)

| Chave | O que é |
|-------|---------|
| `WEBHOOK_CHAT` | URL do webhook do espaço no Google Chat |
| `HORA_ENVIO` / `MINUTO_ENVIO` | horário do resumo diário (a UI usa um seletor `HH:MM`) |
| `AREAS` | lista de áreas (JSON) |
| `TITULO_CARD` | título do card no Chat |
| `ENVIAR_SE_VAZIO` | postar recado nos dias sem comunicados |
| `MENSAGEM_VAZIO` | texto do recado dos dias vazios |
| `NOTIFICAR_EMAIL` | liga/desliga todos os e-mails |
| `CARD_COLAPSAVEL` | mostrar só o título no Chat (mensagem abre ao clicar) |
| `SUPERVISORES` | lista de `{ email, area }` (JSON) |
| `ANEXOS_FOLDER_ID` | (interno) id da pasta de anexos no Drive |

**Administradores da Config**: constante `ADMINS` no topo de `Code.gs`. Vazio `[]`
libera a edição a todos; preencher com e-mails restringe quem abre/salva a aba Config.

**Supervisores**: cada supervisor cobre **uma** área; pode haver **vários por área**;
a mesma pessoa pode cobrir mais de uma área (basta cadastrá-la em cada uma). O e-mail
cadastrado precisa ser **idêntico** ao e-mail Google real da pessoa.

---

## 6. Notificações por e-mail

- **Novo comunicado** → e-mail para os supervisores da área (com link do app e do anexo).
- **Aprovado / Reprovado** → e-mail para o autor (reprovação inclui o motivo).
- **Correção solicitada** → e-mail para o autor com o ajuste pedido e link para corrigir.

Tudo controlado pela chave `NOTIFICAR_EMAIL`. Os e-mails saem da conta do dono do
web app.

---

## 7. Google Chat (card)

- Card `cardsV2` com o resumo, **agrupado por área**; urgentes com 🔴 e no topo.
- Modo `CARD_COLAPSAVEL`: uma **seção recolhível** por comunicado (título visível,
  mensagem abre no "Ver mais").
- Anexos aparecem como botão **"📎 Abrir anexo"** (`buttonList` → `openLink`).

---

## 8. Instalação e publicação (passo a passo)

1. Crie/abra a **Planilha Google** "Comunicados da Equipe".
2. **Extensões → Apps Script** (cria um script **vinculado** à planilha).
3. Cole `Code.gs` no arquivo de código e crie um arquivo HTML chamado **`Index`**
   com o conteúdo de `Index.html`. Salve.
4. **Webhook do Chat**: no espaço do Google Chat → *Apps e integrações → Webhooks →
   Adicionar*. Copie a URL.
5. Publique: **Implantar → Nova implantação → App da Web**
   - **Executar como: Eu** (essencial — o app acessa a planilha em nome do dono para todos)
   - **Quem pode acessar: Qualquer pessoa na Cresol Sicooper**
6. **Autorize** todas as permissões quando solicitado (Planilhas, Chat, Gmail, Drive, Gatilhos).
7. Abra o app → aba **Config** → preencha webhook, horário, áreas, supervisores,
   recado etc. → **Salvar** (isso também cria/ajusta o gatilho diário).
8. Teste: cadastre um comunicado, aprove como supervisor, confira o card no Chat e os e-mails.

> **Ao atualizar o código depois:** é preciso publicar **Nova versão** em
> *Gerenciar implantações* — senão o `/exec` continua servindo a versão antiga.
> Para testar o código mais recente sem publicar, use o link **`/dev`** de
> *Testar implantações*.

---

## 9. Identidade visual Cresol (design system)

Extraído do **Manual da Marca Cresol v.1 / 2021**. Reutilizar em qualquer ferramenta Cresol.

**Cores primárias**
- Laranja Cresol `#F58220` (Pantone 1585 C) — cor principal (botões, cabeçalho)
- Verde Cresol `#005C46` (Pantone 343 C) — base/detalhe (é um verde **escuro**)

**Secundárias**: cinza `#727176`, cinza claro `#D0D0CE`, preto `#000000`, branco `#FFFFFF`.
**Apoio/urgência**: vermelho `#A72B0F` (da paleta oficial).

**Tipografia**: primária **Bw Modelica** (não é fonte web pública); alternativa de
sistema/Office **Verdana** (usada no app como fallback).

**Tom de voz**: clientes são "cooperados"; comunicação no "nós", leve, simples,
transparente e didática. Pilares: Parceria, Acessibilidade, Empatia.
Assinatura: *"Estamos juntos com você, venha ser Cresol."*

**Logos**: o **ícone** oficial (anel laranja + entrelaço verde) está embutido em
base64 no cabeçalho do `Index.html`. Os originais em alta (`Icone-original.png` e
`Logo-vertical-original.png`) ficam no brand kit do Jeferson.

---

## 10. Armadilhas conhecidas (importante para manutenção)

- **Datas travam a comunicação com a tela.** A Planilha converte textos de data em
  objetos `Date`. Retornar um `Date` por `google.script.run` faz a chamada **travar
  silenciosamente** (nem sucesso nem erro → tela eterna em "Carregando…"). **Solução
  aplicada:** converter toda data para texto antes de retornar, com os helpers
  `dataISO_()` (para `yyyy-MM-dd`) e `dataTexto_()` (para exibição). Sempre usar esses
  helpers ao ler datas da planilha.
- **Publicação "Executar como".** Deve ser **"Eu"**, não "Usuário com acesso". Com
  "Usuário com acesso", a leitura da planilha exige autorização por usuário e trava.
- **Publicar Nova versão.** Editar o código não atualiza o `/exec` até publicar uma
  nova versão. Use `/dev` para testar o código atual.
- **Identidade do usuário.** `Session.getActiveUser().getEmail()` só retorna o e-mail
  de forma confiável com o app publicado como **"Qualquer pessoa na Cresol"** (mesmo
  domínio). O app mostra "Conectado como: …" no cabeçalho para diagnóstico.
- **Gatilho de tempo** roda em **janela de ~15 min** em torno do horário — o minuto é
  aproximado (limitação do Apps Script), não exato.
- **Tratamento de erro.** As chamadas `google.script.run` do front usam
  `.withFailureHandler(...)` para nunca travar em silêncio.
- **E-mails que não chegam** quase sempre são e-mail de supervisor divergente do
  e-mail Google real.

---

## 11. Estado atual

Funcionando e testado no ambiente Cresol:
- Cadastro, fila de revisão por área, aprovação, reprovação, envio ao Chat e webhook.
- Identificação do usuário e reconhecimento de supervisor.

Implementado nesta última rodada (validar em produção após publicar nova versão):
- **Solicitar correção** + fluxo de reenvio pelo autor.
- **Horário com minutos** (seletor `HH:MM`).
- **Card recolhível** no Chat (opção na Config).
- **Anexo** de documento (Drive) — requer autorizar o novo escopo do Drive.

---

## 12. Próximos passos / ideias

- E-mails em **HTML com a identidade Cresol** (hoje são texto simples).
- **Favicon** a partir do ícone oficial.
- Histórico/relatório de comunicados enviados (filtro por área/período).
- Painel simples de métricas (quantos por área, tempo médio de aprovação).
- Opção de **múltiplos anexos** por comunicado.
- Apresentação de aprovação já existe como `Apresentacao_Comunicacao_Cresol.pptx`
  (deck institucional com a identidade Cresol).

---

## 13. Repositório

Destino: <https://github.com/Jeferprog/Comunicacao_Integrada>

Sugestão de estrutura do repo:

```
/
├── Code.gs
├── Index.html
└── README.md
```
