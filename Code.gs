/*************************************************************
 *  SISTEMA DE COMUNICAÇÃO DA EQUIPE  —  Cresol Sicooper
 *
 *  Fluxo: qualquer pessoa cadastra -> "Aguardando" ->
 *  supervisor da área Aprova / Reprova / Solicita correção.
 *  Correção volta ao autor, que edita e reenvia.
 *  Aprovados vão ao Google Chat (resumo diário ou na hora).
 *  Recursos: anexo (Drive), avisos por e-mail, recado nos
 *  dias vazios, card recolhível, horário com minutos.
 *************************************************************/

// ===========================================================
//  1) FIXOS
// ===========================================================
const NOME_ABA = 'Comunicados';
const FUSO     = 'America/Sao_Paulo';
const ADMINS   = [];   // vazio = todos podem editar Config

const COL = {
  ID:1, CARIMBO:2, DATA:3, AREA:4, TITULO:5, MSG:6, AUTOR:7, PRIOR:8,
  STATUS:9, EMAIL:10, REVISOR:11, OBS:12, ANEXO:13, ANEXONOME:14
};
const CABECALHO = ['ID','Carimbo','DataPublicacao','Area','Titulo','Mensagem','Autor',
                   'Prioridade','Status','EmailAutor','RevisadoPor','Observacao','AnexoURL','AnexoNome'];
// Status: 'Aguardando' | 'Aprovado' | 'Reprovado' | 'Correção' | 'Enviado'

const CONFIG_PADRAO = {
  WEBHOOK_CHAT:    '',
  HORA_ENVIO:      8,
  MINUTO_ENVIO:    0,
  AREAS:           ['Crédito', 'Cobrança', 'Atendimento', 'Administrativo', 'RH', 'TI', 'Marketing', 'Diretoria'],
  TITULO_CARD:     '📢 Comunicados do Dia',
  ENVIAR_SE_VAZIO: true,
  MENSAGEM_VAZIO:  'Bom dia! Hoje não há comunicados para a equipe. 🌱',
  NOTIFICAR_EMAIL: true,
  CARD_COLAPSAVEL: false,   // true = mostra só o título; abre a mensagem ao clicar
  SUPERVISORES:    []       // [{ email, area }]
};

// ===========================================================
//  2) CONFIGURAÇÕES
// ===========================================================
function lerConfig_() {
  const p = PropertiesService.getScriptProperties();
  return {
    WEBHOOK_CHAT:    p.getProperty('WEBHOOK_CHAT')    || CONFIG_PADRAO.WEBHOOK_CHAT,
    HORA_ENVIO:      p.getProperty('HORA_ENVIO')      !== null ? Number(p.getProperty('HORA_ENVIO'))   : CONFIG_PADRAO.HORA_ENVIO,
    MINUTO_ENVIO:    p.getProperty('MINUTO_ENVIO')    !== null ? Number(p.getProperty('MINUTO_ENVIO')) : CONFIG_PADRAO.MINUTO_ENVIO,
    AREAS:           p.getProperty('AREAS')           ? JSON.parse(p.getProperty('AREAS'))          : CONFIG_PADRAO.AREAS,
    TITULO_CARD:     p.getProperty('TITULO_CARD')     || CONFIG_PADRAO.TITULO_CARD,
    ENVIAR_SE_VAZIO: p.getProperty('ENVIAR_SE_VAZIO') !== 'false',
    MENSAGEM_VAZIO:  p.getProperty('MENSAGEM_VAZIO')  || CONFIG_PADRAO.MENSAGEM_VAZIO,
    NOTIFICAR_EMAIL: p.getProperty('NOTIFICAR_EMAIL') !== 'false',
    CARD_COLAPSAVEL: p.getProperty('CARD_COLAPSAVEL') === 'true',
    SUPERVISORES:    p.getProperty('SUPERVISORES')    ? JSON.parse(p.getProperty('SUPERVISORES'))   : CONFIG_PADRAO.SUPERVISORES
  };
}

function usuarioAtual_() { return (Session.getActiveUser().getEmail() || '').toLowerCase(); }

function podeEditar_() {
  if (ADMINS.length === 0) return true;
  return ADMINS.map(function (e) { return e.toLowerCase(); }).indexOf(usuarioAtual_()) !== -1;
}

function areasDoSupervisor_(email, cfg) {
  email = String(email).toLowerCase();
  return (cfg.SUPERVISORES || [])
    .filter(function (s) { return String(s.email).toLowerCase() === email; })
    .map(function (s) { return s.area; });
}
function supervisaArea_(email, area, cfg) { return areasDoSupervisor_(email, cfg).indexOf(area) !== -1; }

function getPapelUsuario() {
  const cfg = lerConfig_();
  const email = usuarioAtual_();
  return { email: email, areasSupervisionadas: areasDoSupervisor_(email, cfg), admin: podeEditar_() };
}

function getConfigCliente() { return { areas: lerConfig_().AREAS, hoje: hojeStr_() }; }

function getConfigAdmin() {
  if (!podeEditar_()) return { ok: false, motivo: 'Você não tem permissão para editar as configurações.' };
  return { ok: true, config: lerConfig_() };
}

function salvarConfig(dados) {
  if (!podeEditar_()) throw new Error('Sem permissão para salvar as configurações.');

  const hora = Number(dados.HORA_ENVIO);
  if (isNaN(hora) || hora < 0 || hora > 23) throw new Error('A hora deve estar entre 0 e 23.');
  const minuto = Number(dados.MINUTO_ENVIO);
  if (isNaN(minuto) || minuto < 0 || minuto > 59) throw new Error('O minuto deve estar entre 0 e 59.');

  const areas = (dados.AREAS || []).map(function (a) { return String(a).trim(); })
                                   .filter(function (a) { return a.length > 0; });
  if (areas.length === 0) throw new Error('Cadastre pelo menos uma área.');

  const sups = (dados.SUPERVISORES || [])
    .map(function (s) { return { email: String(s.email || '').trim().toLowerCase(), area: String(s.area || '').trim() }; })
    .filter(function (s) { return s.email && s.area; });
  for (let i = 0; i < sups.length; i++) {
    if (areas.indexOf(sups[i].area) === -1) throw new Error('O supervisor ' + sups[i].email + ' está numa área que não existe mais (' + sups[i].area + ').');
  }

  const p = PropertiesService.getScriptProperties();
  p.setProperty('WEBHOOK_CHAT',    String(dados.WEBHOOK_CHAT || '').trim());
  p.setProperty('HORA_ENVIO',      String(hora));
  p.setProperty('MINUTO_ENVIO',    String(minuto));
  p.setProperty('AREAS',           JSON.stringify(areas));
  p.setProperty('TITULO_CARD',     String(dados.TITULO_CARD || CONFIG_PADRAO.TITULO_CARD).trim());
  p.setProperty('ENVIAR_SE_VAZIO', dados.ENVIAR_SE_VAZIO ? 'true' : 'false');
  p.setProperty('MENSAGEM_VAZIO',  String(dados.MENSAGEM_VAZIO || CONFIG_PADRAO.MENSAGEM_VAZIO).trim());
  p.setProperty('NOTIFICAR_EMAIL', dados.NOTIFICAR_EMAIL ? 'true' : 'false');
  p.setProperty('CARD_COLAPSAVEL', dados.CARD_COLAPSAVEL ? 'true' : 'false');
  p.setProperty('SUPERVISORES',    JSON.stringify(sups));

  criarGatilhoDiario();
  return { ok: true };
}

// ===========================================================
//  3) PÁGINA WEB
// ===========================================================
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Comunicação da Equipe')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// ===========================================================
//  4) CADASTRO / EDIÇÃO (autor)
// ===========================================================
function salvarComunicado(dados) {
  const cfg = lerConfig_();
  const aba = getAba_();
  const id = Utilities.getUuid();
  const carimbo = Utilities.formatDate(new Date(), FUSO, 'dd/MM/yyyy HH:mm');

  let anexoUrl = '', anexoNome = '';
  if (dados.anexoBase64) { const a = salvarAnexo_(dados.anexoBase64, dados.anexoNome, dados.anexoTipo); anexoUrl = a.url; anexoNome = a.nome; }

  aba.appendRow([
    id, carimbo, dados.data, dados.area, dados.titulo, dados.mensagem, dados.autor,
    dados.prioridade, 'Aguardando', usuarioAtual_(), '', '', anexoUrl, anexoNome
  ]);

  notificarSupervisores_(dados.area, dados.titulo, dados.autor, anexoUrl, cfg);
  return { ok: true, id: id };
}

// Autor edita um comunicado que voltou para correção (ou ainda aguardando) e reenvia
function atualizarComunicado(id, dados) {
  const cfg = lerConfig_();
  const email = usuarioAtual_();
  const aba = getAba_();
  const achou = acharLinha_(aba, id);
  if (!achou) throw new Error('Comunicado não encontrado.');
  if (String(achou.dados[COL.EMAIL - 1]).toLowerCase() !== email) throw new Error('Você só pode editar seus próprios comunicados.');
  const st = achou.dados[COL.STATUS - 1];
  if (st !== 'Correção' && st !== 'Aguardando') throw new Error('Este comunicado já foi revisado e não pode ser editado.');

  const L = achou.linha;
  aba.getRange(L, COL.DATA).setValue(dados.data);
  aba.getRange(L, COL.AREA).setValue(dados.area);
  aba.getRange(L, COL.TITULO).setValue(dados.titulo);
  aba.getRange(L, COL.MSG).setValue(dados.mensagem);
  aba.getRange(L, COL.AUTOR).setValue(dados.autor);
  aba.getRange(L, COL.PRIOR).setValue(dados.prioridade);
  aba.getRange(L, COL.STATUS).setValue('Aguardando');
  aba.getRange(L, COL.OBS).setValue('');
  aba.getRange(L, COL.REVISOR).setValue('');
  if (dados.anexoBase64) {
    const a = salvarAnexo_(dados.anexoBase64, dados.anexoNome, dados.anexoTipo);
    aba.getRange(L, COL.ANEXO).setValue(a.url);
    aba.getRange(L, COL.ANEXONOME).setValue(a.nome);
  }
  notificarSupervisores_(dados.area, dados.titulo, dados.autor, aba.getRange(L, COL.ANEXO).getValue(), cfg);
  return { ok: true };
}

function listarMeusComunicados() {
  const email = usuarioAtual_();
  const aba = getAba_();
  const v = aba.getDataRange().getValues();
  const lista = [];
  for (let i = 1; i < v.length; i++) {
    if (String(v[i][COL.EMAIL - 1]).toLowerCase() === email) {
      lista.push({
        id: v[i][COL.ID - 1], data: dataISO_(v[i][COL.DATA - 1]), area: v[i][COL.AREA - 1],
        titulo: v[i][COL.TITULO - 1], mensagem: v[i][COL.MSG - 1], autor: v[i][COL.AUTOR - 1],
        prioridade: v[i][COL.PRIOR - 1], status: v[i][COL.STATUS - 1], observacao: v[i][COL.OBS - 1],
        anexoUrl: v[i][COL.ANEXO - 1] || '', anexoNome: v[i][COL.ANEXONOME - 1] || ''
      });
    }
  }
  return lista.reverse();
}

function excluirComunicado(id) {
  const email = usuarioAtual_();
  const aba = getAba_();
  const v = aba.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) {
    if (v[i][COL.ID - 1] === id) {
      if (String(v[i][COL.EMAIL - 1]).toLowerCase() !== email) throw new Error('Você só pode excluir seus próprios comunicados.');
      if (['Aprovado', 'Enviado'].indexOf(v[i][COL.STATUS - 1]) !== -1) throw new Error('Este comunicado já foi aprovado/enviado e não pode ser excluído.');
      aba.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false };
}

// ===========================================================
//  5) REVISÃO (supervisor da área)
// ===========================================================
function listarParaRevisao() {
  const cfg = lerConfig_();
  const email = usuarioAtual_();
  const areas = areasDoSupervisor_(email, cfg);
  if (areas.length === 0) return { ok: false, motivo: 'Você não é supervisor de nenhuma área.', itens: [] };

  const aba = getAba_();
  const v = aba.getDataRange().getValues();
  const itens = [];
  for (let i = 1; i < v.length; i++) {
    if (v[i][COL.STATUS - 1] === 'Aguardando' && areas.indexOf(v[i][COL.AREA - 1]) !== -1) {
      itens.push({
        id: v[i][COL.ID - 1], carimbo: dataTexto_(v[i][COL.CARIMBO - 1]), data: dataISO_(v[i][COL.DATA - 1]),
        area: v[i][COL.AREA - 1], titulo: v[i][COL.TITULO - 1], mensagem: v[i][COL.MSG - 1],
        autor: v[i][COL.AUTOR - 1], prioridade: v[i][COL.PRIOR - 1],
        anexoUrl: v[i][COL.ANEXO - 1] || '', anexoNome: v[i][COL.ANEXONOME - 1] || ''
      });
    }
  }
  itens.sort(function (a, b) { return (b.prioridade === 'Urgente') - (a.prioridade === 'Urgente'); });
  return { ok: true, areas: areas, itens: itens };
}

function acharLinha_(aba, id) {
  const v = aba.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][COL.ID - 1] === id) return { linha: i + 1, dados: v[i] };
  return null;
}

function aprovarComunicado(id, enviarAgora) {
  const cfg = lerConfig_();
  const email = usuarioAtual_();
  const aba = getAba_();
  const achou = acharLinha_(aba, id);
  if (!achou) throw new Error('Comunicado não encontrado.');
  const area = achou.dados[COL.AREA - 1];
  if (!supervisaArea_(email, area, cfg)) throw new Error('Você não é supervisor da área "' + area + '".');
  if (achou.dados[COL.STATUS - 1] !== 'Aguardando') throw new Error('Este comunicado já foi revisado.');

  if (enviarAgora) {
    const quando = Utilities.formatDate(new Date(), FUSO, "dd/MM/yyyy 'às' HH:mm");
    const item = {
      area: area, titulo: achou.dados[COL.TITULO - 1], mensagem: achou.dados[COL.MSG - 1],
      autor: achou.dados[COL.AUTOR - 1], prioridade: achou.dados[COL.PRIOR - 1], anexoUrl: achou.dados[COL.ANEXO - 1] || ''
    };
    postarNoChat_(montarCard_([item], quando, cfg, '⚡ Comunicado Imediato'), cfg);
    aba.getRange(achou.linha, COL.STATUS).setValue('Enviado');
  } else {
    aba.getRange(achou.linha, COL.STATUS).setValue('Aprovado');
  }
  aba.getRange(achou.linha, COL.REVISOR).setValue(email);
  notificarAutor_(achou.dados[COL.EMAIL - 1], achou.dados[COL.TITULO - 1], true, '', cfg);
  return { ok: true };
}

function reprovarComunicado(id, motivo) {
  const cfg = lerConfig_();
  const email = usuarioAtual_();
  const aba = getAba_();
  const achou = acharLinha_(aba, id);
  if (!achou) throw new Error('Comunicado não encontrado.');
  const area = achou.dados[COL.AREA - 1];
  if (!supervisaArea_(email, area, cfg)) throw new Error('Você não é supervisor da área "' + area + '".');
  if (achou.dados[COL.STATUS - 1] !== 'Aguardando') throw new Error('Este comunicado já foi revisado.');

  aba.getRange(achou.linha, COL.STATUS).setValue('Reprovado');
  aba.getRange(achou.linha, COL.REVISOR).setValue(email);
  aba.getRange(achou.linha, COL.OBS).setValue(String(motivo || '').trim());
  notificarAutor_(achou.dados[COL.EMAIL - 1], achou.dados[COL.TITULO - 1], false, motivo, cfg);
  return { ok: true };
}

// Supervisor devolve para o autor ajustar
function solicitarCorrecao(id, motivo) {
  const cfg = lerConfig_();
  const email = usuarioAtual_();
  const aba = getAba_();
  const achou = acharLinha_(aba, id);
  if (!achou) throw new Error('Comunicado não encontrado.');
  const area = achou.dados[COL.AREA - 1];
  if (!supervisaArea_(email, area, cfg)) throw new Error('Você não é supervisor da área "' + area + '".');
  if (achou.dados[COL.STATUS - 1] !== 'Aguardando') throw new Error('Este comunicado já foi revisado.');

  aba.getRange(achou.linha, COL.STATUS).setValue('Correção');
  aba.getRange(achou.linha, COL.REVISOR).setValue(email);
  aba.getRange(achou.linha, COL.OBS).setValue(String(motivo || '').trim());
  notificarAutorCorrecao_(achou.dados[COL.EMAIL - 1], achou.dados[COL.TITULO - 1], motivo, cfg);
  return { ok: true };
}

// ===========================================================
//  6) ANEXOS (Google Drive)
// ===========================================================
function getPastaAnexos_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('ANEXOS_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* recria abaixo */ } }
  const pasta = DriveApp.createFolder('Anexos - Comunicação da Equipe');
  p.setProperty('ANEXOS_FOLDER_ID', pasta.getId());
  return pasta;
}

function salvarAnexo_(base64, nome, tipo) {
  const pasta = getPastaAnexos_();
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), tipo || 'application/octet-stream', nome || 'anexo');
  const arq = pasta.createFile(blob);
  try { arq.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { Logger.log('Compartilhar anexo: ' + e); }
  return { url: arq.getUrl(), nome: arq.getName() };
}

// ===========================================================
//  7) NOTIFICAÇÕES POR E-MAIL
// ===========================================================
function urlDoApp_() { try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; } }

function notificarSupervisores_(area, titulo, autor, anexoUrl, cfg) {
  if (!cfg.NOTIFICAR_EMAIL) return;
  const emails = (cfg.SUPERVISORES || []).filter(function (s) { return s.area === area; }).map(function (s) { return s.email; });
  if (emails.length === 0) return;
  const url = urlDoApp_();
  const corpo =
    'Um novo comunicado da área "' + area + '" aguarda sua revisão.\n\n' +
    'Título: ' + titulo + '\nAutor: ' + (autor || '—') +
    (anexoUrl ? ('\nAnexo: ' + anexoUrl) : '') +
    (url ? ('\n\nRevise aqui: ' + url) : '') +
    '\n\n— Sistema de Comunicação da Equipe';
  emails.forEach(function (e) { try { MailApp.sendEmail(e, '📝 Novo comunicado para revisão — ' + area, corpo); } catch (err) { Logger.log('E-mail supervisor ' + e + ': ' + err); } });
}

function notificarAutor_(email, titulo, aprovado, motivo, cfg) {
  if (!cfg.NOTIFICAR_EMAIL || !email) return;
  let assunto, corpo;
  if (aprovado) {
    assunto = '✅ Seu comunicado foi aprovado';
    corpo = 'Boa notícia! Seu comunicado foi aprovado e será enviado à equipe.\n\nTítulo: ' + titulo + '\n\n— Sistema de Comunicação da Equipe';
  } else {
    assunto = '❌ Seu comunicado foi reprovado';
    corpo = 'Seu comunicado não foi aprovado desta vez.\n\nTítulo: ' + titulo + (motivo ? ('\nMotivo: ' + motivo) : '') + '\n\n— Sistema de Comunicação da Equipe';
  }
  try { MailApp.sendEmail(email, assunto, corpo); } catch (err) { Logger.log('E-mail autor ' + email + ': ' + err); }
}

function notificarAutorCorrecao_(email, titulo, motivo, cfg) {
  if (!cfg.NOTIFICAR_EMAIL || !email) return;
  const url = urlDoApp_();
  const corpo =
    'O supervisor pediu um ajuste no seu comunicado antes de enviá-lo à equipe.\n\n' +
    'Título: ' + titulo + (motivo ? ('\nO que ajustar: ' + motivo) : '') +
    (url ? ('\n\nAbra o sistema, corrija em "Meus comunicados" e reenvie: ' + url) : '') +
    '\n\n— Sistema de Comunicação da Equipe';
  try { MailApp.sendEmail(email, '✏️ Ajuste solicitado no seu comunicado', corpo); } catch (err) { Logger.log('E-mail correção ' + email + ': ' + err); }
}

// ===========================================================
//  8) ENVIO DIÁRIO + CARD
// ===========================================================
function enviarResumoDiario() {
  const cfg = lerConfig_();
  const aba = getAba_();
  const v = aba.getDataRange().getValues();
  const hoje = hojeStr_();

  const paraEnviar = [];
  for (let i = 1; i < v.length; i++) {
    if (v[i][COL.STATUS - 1] === 'Aprovado' && dataISO_(v[i][COL.DATA - 1]) <= hoje) {
      paraEnviar.push({
        linha: i + 1, area: v[i][COL.AREA - 1], titulo: v[i][COL.TITULO - 1], mensagem: v[i][COL.MSG - 1],
        autor: v[i][COL.AUTOR - 1], prioridade: v[i][COL.PRIOR - 1], anexoUrl: v[i][COL.ANEXO - 1] || ''
      });
    }
  }

  const dataFormatada = Utilities.formatDate(new Date(), FUSO, "EEEE, dd/MM/yyyy");
  if (paraEnviar.length === 0) {
    if (cfg.ENVIAR_SE_VAZIO) postarNoChat_(cardMensagemSimples_(cfg.TITULO_CARD, dataFormatada, cfg.MENSAGEM_VAZIO), cfg);
    return;
  }
  postarNoChat_(montarCard_(paraEnviar, dataFormatada, cfg), cfg);
  paraEnviar.forEach(function (c) { aba.getRange(c.linha, COL.STATUS).setValue('Enviado'); });
}

// Botão de anexo (widget do card)
function botaoAnexo_(url) {
  return { buttonList: { buttons: [{ text: '📎 Abrir anexo', onClick: { openLink: { url: url } } }] } };
}

function montarCard_(comunicados, dataFormatada, cfg, tituloOverride) {
  const header = { title: tituloOverride || cfg.TITULO_CARD, subtitle: dataFormatada };

  // MODO RECOLHÍVEL: uma seção por comunicado; título visível, mensagem abre ao clicar
  if (cfg.CARD_COLAPSAVEL) {
    const ordem = comunicados.slice().sort(function (a, b) {
      const ia = cfg.AREAS.indexOf(a.area), ib = cfg.AREAS.indexOf(b.area);
      if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return (b.prioridade === 'Urgente') - (a.prioridade === 'Urgente');
    });
    const secoes = ordem.map(function (c) {
      const marca = (c.prioridade === 'Urgente') ? '🔴 ' : '';
      const widgets = [
        { textParagraph: { text: marca + '<b>' + escapar_(c.titulo) + '</b>  <font color="#888888">· ' + escapar_(c.area) + '</font>' } },
        { textParagraph: { text: escapar_(c.mensagem) + (c.autor ? ('<br><font color="#888888"><i>— ' + escapar_(c.autor) + '</i></font>') : '') } }
      ];
      if (c.anexoUrl) widgets.push(botaoAnexo_(c.anexoUrl));
      return { collapsible: true, uncollapsibleWidgetsCount: 1, widgets: widgets };
    });
    return { cardsV2: [{ cardId: 'comunicados', card: { header: header, sections: secoes } }] };
  }

  // MODO COMPLETO: agrupado por área
  const secoes = [];
  cfg.AREAS.forEach(function (area) {
    const doArea = comunicados.filter(function (c) { return c.area === area; });
    if (doArea.length === 0) return;
    doArea.sort(function (a, b) { return (b.prioridade === 'Urgente') - (a.prioridade === 'Urgente'); });
    const widgets = [];
    doArea.forEach(function (c) {
      const marca = (c.prioridade === 'Urgente') ? '🔴 ' : '';
      const autor = c.autor ? ('<br><font color="#888888"><i>— ' + escapar_(c.autor) + '</i></font>') : '';
      widgets.push({ textParagraph: { text: marca + '<b>' + escapar_(c.titulo) + '</b><br>' + escapar_(c.mensagem) + autor } });
      if (c.anexoUrl) widgets.push(botaoAnexo_(c.anexoUrl));
    });
    secoes.push({ header: '🔹 ' + area.toUpperCase(), widgets: widgets });
  });
  const outros = comunicados.filter(function (c) { return cfg.AREAS.indexOf(c.area) === -1; });
  if (outros.length > 0) {
    const w = [];
    outros.forEach(function (c) {
      w.push({ textParagraph: { text: '<b>' + escapar_(c.titulo) + '</b><br>' + escapar_(c.mensagem) } });
      if (c.anexoUrl) w.push(botaoAnexo_(c.anexoUrl));
    });
    secoes.push({ header: '🔹 OUTROS', widgets: w });
  }
  return { cardsV2: [{ cardId: 'comunicados', card: { header: header, sections: secoes } }] };
}

function cardMensagemSimples_(titulo, subtitulo, texto) {
  return { cardsV2: [{ cardId: 'recado', card: {
    header: { title: titulo, subtitle: subtitulo },
    sections: [{ widgets: [{ textParagraph: { text: escapar_(texto).replace(/\n/g, '<br>') } }] }]
  } }] };
}

function postarNoChat_(payload, cfg) {
  cfg = cfg || lerConfig_();
  if (!cfg.WEBHOOK_CHAT) throw new Error('O webhook do Google Chat ainda não foi configurado na aba Configurações.');
  const r = UrlFetchApp.fetch(cfg.WEBHOOK_CHAT, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
  Logger.log('Resposta do Chat: ' + r.getResponseCode() + ' ' + r.getContentText());
}

// ===========================================================
//  9) GATILHO / APOIO
// ===========================================================
function criarGatilhoDiario() {
  const cfg = lerConfig_();
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'enviarResumoDiario') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('enviarResumoDiario')
    .timeBased().everyDays(1).atHour(cfg.HORA_ENVIO).nearMinute(cfg.MINUTO_ENVIO).inTimezone(FUSO).create();
  Logger.log('Gatilho ajustado para ~' + cfg.HORA_ENVIO + 'h' + (cfg.MINUTO_ENVIO < 10 ? '0' : '') + cfg.MINUTO_ENVIO + '.');
}

function testarEnvioAgora() { enviarResumoDiario(); }

// ===========================================================
//  10) INTERNAS
// ===========================================================
function getAba_() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let aba = planilha.getSheetByName(NOME_ABA);
  if (!aba) {
    aba = planilha.insertSheet(NOME_ABA);
    aba.appendRow(CABECALHO);
    aba.getRange(1, 1, 1, CABECALHO.length).setFontWeight('bold');
    aba.setFrozenRows(1);
    aba.getRange('B:C').setNumberFormat('@');   // Carimbo e Data como texto (evita conversão automática)
  }
  return aba;
}

function hojeStr_() { return Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd'); }
function dataISO_(v)   { return (v instanceof Date) ? Utilities.formatDate(v, FUSO, 'yyyy-MM-dd')       : String(v || ''); }
function dataTexto_(v) { return (v instanceof Date) ? Utilities.formatDate(v, FUSO, 'dd/MM/yyyy HH:mm') : String(v || ''); }
function escapar_(txt) { return String(txt || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
