// =====================================================================
//   Vizobot v7 — Nano + Aluguer + Concorrentes + Compra Automática
//   Dono: 847597260 (LID: 244001840066788)
// =====================================================================

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    getContentType
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const pino = require('pino');

// ================= CORES TERMINAL =================
const C = {
    reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
    red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
    blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
    bgBlue: '\x1b[44m', bgGreen: '\x1b[42m', bgYellow: '\x1b[43m',
    bgMagenta: '\x1b[45m', bgCyan: '\x1b[46m'
};

function banner() {
    console.clear();
    console.log(`${C.cyan}${C.bright}`);
    console.log(`  ██╗   ██╗██╗███████╗ ██████╗ ██████╗  ██████╗ ████████╗`);
    console.log(`  ██║   ██║██║╚══███╔╝██╔═══██╗██╔══██╗██╔═══██╗╚══██╔══╝`);
    console.log(`  ██║   ██║██║  ███╔╝ ██║   ██║██████╔╝██║   ██║   ██║   `);
    console.log(`  ╚██╗ ██╔╝██║ ███╔╝  ██║   ██║██╔══██╗██║   ██║   ██║   `);
    console.log(`   ╚████╔╝ ██║███████╗╚██████╔╝██████╔╝╚██████╔╝   ██║   `);
    console.log(`    ╚═══╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝  ╚═════╝    ╚═╝   `);
    console.log(`${C.reset}${C.yellow}${C.bright}                    ⚡ Vizobot v7 ⚡${C.reset}`);
    console.log(`${C.dim}${C.white}          WhatsApp Automation System${C.reset}\n`);
}

function log(tipo, msg) {
    const d = new Date();
    const hora = `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`;
    const ts = `${C.dim}[${hora}]${C.reset}`;
    const tags = {
        info:    `${C.bgBlue}${C.white} INFO ${C.reset}`,
        ok:      `${C.bgGreen}${C.white}  OK  ${C.reset}`,
        warn:    `${C.bgYellow}${C.white} WARN ${C.reset}`,
        erro:    `${C.red}${C.bright} ERRO ${C.reset}`,
        msg:     `${C.bgCyan}${C.white} MSG  ${C.reset}`,
        grupo:   `${C.bgMagenta}${C.white} GRUPO${C.reset}`,
        pv:      `${C.magenta}${C.bright}  PV  ${C.reset}`,
        cmd:     `${C.yellow}${C.bright} CMD  ${C.reset}`,
        bot:     `${C.cyan}${C.bright} BOT  ${C.reset}`,
        rent:    `${C.bgYellow}${C.white} RENT ${C.reset}`,
        compra:  `${C.bgGreen}${C.white} BUY  ${C.reset}`,
        debug:   `${C.dim}${C.white} DBG  ${C.reset}`
    };
    console.log(`${ts} ${tags[tipo] || tags.info} ${msg}`);
}

// ================= CONFIG =================
const BOT_NAME = "Vizobot";
const OWNER_NUMBER = "847597260";
const OWNER_LID = "244001840066788";
const PREFIX = ".";
const DB_PATH = './database';

const EXCECOES_EXTRA = [];

const COMPRA_AUTO_DELAY_MS = 2 * 60 * 1000;

if (!fs.existsSync(DB_PATH)) fs.mkdirSync(DB_PATH);

// ================= DB =================
const loadDB = (file, def = {}) => {
    const p = path.join(DB_PATH, file);
    if (fs.existsSync(p)) {
        try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
        catch { return def; }
    }
    return def;
};
const saveDB = (file, data) => {
    fs.writeFileSync(path.join(DB_PATH, file), JSON.stringify(data, null, 2));
};

let config       = loadDB('config.json', {});
let contas       = loadDB('contas.json', {});
let nanos        = loadDB('nanos.json', {});
let compras      = loadDB('compras.json', {});
let alugueres    = loadDB('alugueres.json', {});
let alarmes      = loadDB('alarmes.json', {});
let chaves       = loadDB('chaves.json', {});
let tabelas      = loadDB('tabela.json', {});
let antilinkCount = {};

let concorrentesDB = loadDB('concorrentes.json', { lista: [] });
if (!concorrentesDB || !Array.isArray(concorrentesDB.lista)) {
    concorrentesDB = { lista: [] };
    saveDB('concorrentes.json', concorrentesDB);
}

const comprasPendentes = {};

// ================= HELPERS =================
async function getGroupMetadata(sock, gid) {
    try {
        const meta = await sock.groupMetadata(gid);
        if (meta) return meta;
    } catch (e) {
        log('warn', `groupMetadata falhou (${gid}): ${e.message}`);
    }
    try {
        const todos = await sock.groupFetchAllParticipating();
        if (todos && todos[gid]) return todos[gid];
    } catch (e) {
        log('warn', `groupFetchAllParticipating falhou: ${e.message}`);
    }
    return null;
}

function normalizarNumero(id) {
    if (!id) return '';
    if (typeof id === 'object') {
        id = id.id || id.lid || id.jid || id.user || '';
    }
    if (!id || typeof id !== 'string') return '';
    return id.split(':')[0].split('@')[0].replace(/\D/g, '');
}

function extrairIdParticipante(p) {
    if (!p) return '';
    if (typeof p === 'string') return p;
    if (typeof p === 'object') {
        const raw = p.id || p.lid || p.jid || '';
        if (typeof raw === 'string') return raw;
        if (typeof raw === 'object') return raw.id || raw.lid || '';
    }
    return '';
}

function extrairNumeroParticipante(p) {
    const id = extrairIdParticipante(p);
    if (!id || typeof id !== 'string') return '';
    return id.split(':')[0].split('@')[0];
}

function coletarIdsParticipante(p) {
    const ids = new Set();
    if (!p) return [...ids];
    if (typeof p === 'string') { ids.add(p); return [...ids]; }
    if (typeof p === 'object') {
        if (typeof p.id === 'string') ids.add(p.id);
        else if (p.id && typeof p.id === 'object') {
            if (p.id.id) ids.add(p.id.id);
            if (p.id.lid) ids.add(p.id.lid);
        }
        if (typeof p.lid === 'string') ids.add(p.lid);
        if (typeof p.phoneNumber === 'string') ids.add(p.phoneNumber);
        if (typeof p.pn === 'string') ids.add(p.pn);
    }
    return [...ids];
}

function normalizarConcorrente(input) {
    if (input === null || input === undefined) return '';
    let n = String(input).replace(/\D/g, '');
    if (n.length === 9) n = '258' + n;
    return n;
}

async function isAdmin(sock, gid, uid) {
    try {
        const meta = await getGroupMetadata(sock, gid);
        if (!meta) return false;
        const alvoIds = coletarIdsParticipante(uid);
        const alvoNums = alvoIds.map(i => i.split(':')[0].split('@')[0].replace(/\D/g, '')).filter(Boolean);

        for (const p of meta.participants) {
            const pIds = coletarIdsParticipante(p);
            const pNums = pIds.map(i => i.split(':')[0].split('@')[0].replace(/\D/g, '')).filter(Boolean);
            const bate = pNums.some(pn => alvoNums.includes(pn)) ||
                         pIds.some(pid => alvoIds.includes(pid));
            if (bate) return p.admin === 'admin' || p.admin === 'superadmin';
        }
        return false;
    } catch { return false; }
}

const botAdminCache = {};
async function botIsAdmin(sock, gid) {
    const now = Date.now();
    if (botAdminCache[gid] && botAdminCache[gid].exp > now) return botAdminCache[gid].val;

    let resultado = false;
    try {
        const meta = await getGroupMetadata(sock, gid);
        if (!meta) { botAdminCache[gid] = { val: false, exp: now + 10000 }; return false; }

        const botIds = new Set();
        if (sock.user?.id) botIds.add(sock.user.id);
        if (sock.user?.lid) botIds.add(sock.user.lid);
        if (sock.user?.phoneNumber) botIds.add(sock.user.phoneNumber);

        const botNums = new Set();
        for (const b of botIds) {
            if (typeof b === 'string') {
                const n = b.split(':')[0].split('@')[0].replace(/\D/g, '');
                if (n) {
                    botNums.add(n);
                    if (n.length === 9) botNums.add('258' + n);
                    if (n.startsWith('258')) botNums.add(n.slice(3));
                }
            }
        }

        for (const p of meta.participants) {
            const pIds = coletarIdsParticipante(p);
            const pNums = pIds.map(i => i.split(':')[0].split('@')[0].replace(/\D/g, '')).filter(Boolean);
            let bate = false;
            for (const pid of pIds) if (botIds.has(pid)) { bate = true; break; }
            if (!bate) {
                for (const pn of pNums) {
                    if (botNums.has(pn)) { bate = true; break; }
                    if (pn.length === 9 && botNums.has('258' + pn)) { bate = true; break; }
                    if (pn.startsWith('258') && botNums.has(pn.slice(3))) { bate = true; break; }
                }
            }
            if (bate) {
                resultado = p.admin === 'admin' || p.admin === 'superadmin';
                break;
            }
        }
    } catch (e) { log('erro', `botIsAdmin: ${e.message}`); }

    botAdminCache[gid] = { val: resultado, exp: now + 30000 };
    return resultado;
}

const isOwnerNumber = (uid) => {
    if (!uid) return false;
    if (typeof uid !== 'string') return false;
    const base = uid.split(':')[0].split('@')[0];
    const num = base.replace(/\D/g, '');
    const ownerNum = OWNER_NUMBER.replace(/\D/g, '');
    if (num === ownerNum) return true;
    if (num === '258' + ownerNum) return true;
    if (OWNER_LID && base === OWNER_LID) return true;
    return false;
};

function ehConcorrente(qualquerId) {
    if (!qualquerId) return null;
    const lista = concorrentesDB.lista || [];
    if (lista.length === 0) return null;

    let idStr = '';
    if (typeof qualquerId === 'string') idStr = qualquerId;
    else if (typeof qualquerId === 'object') {
        idStr = qualquerId.id || qualquerId.lid || qualquerId.jid || '';
        if (typeof idStr === 'object') idStr = idStr.id || idStr.lid || '';
    }
    if (!idStr || typeof idStr !== 'string') return null;

    const idNum = normalizarNumero(idStr);
    const idBase = idStr.split(':')[0].split('@')[0];

    for (const c of lista) {
        const cNorm = String(c).replace(/\D/g, '');
        if (cNorm === idNum || cNorm === idBase) return c;
        if (cNorm.startsWith('258') && cNorm.slice(3) === idNum) return c;
        if (idNum.startsWith('258') && idNum.slice(3) === cNorm) return c;
    }
    return null;
}

let SOCK_REF = null;
function sock_user_id() { return SOCK_REF?.user?.id || ''; }
function sock_user_lid() { return SOCK_REF?.user?.lid || ''; }

function ehExcecao(id) {
    const num = normalizarNumero(id);
    if (!num) return false;

    const donoNum = OWNER_NUMBER.replace(/\D/g, '');
    const botNum = normalizarNumero(sock_user_id());
    const botLid = normalizarNumero(sock_user_lid());

    const lista = new Set();
    if (donoNum) { lista.add(donoNum); lista.add('258' + donoNum); }
    if (OWNER_LID) lista.add(OWNER_LID);
    if (botNum) { lista.add(botNum); lista.add('258' + botNum); }
    if (botLid) lista.add(botLid);

    for (const e of EXCECOES_EXTRA) {
        const limpo = String(e).replace(/\D/g, '');
        if (limpo) { lista.add(limpo); if (limpo.length === 9) lista.add('258' + limpo); }
    }

    for (const ex of lista) {
        if (!ex) continue;
        if (num === ex) return true;
        if (ex.startsWith('258') && ex.slice(3) === num) return true;
        if (num.startsWith('258') && num.slice(3) === ex) return true;
    }
    return false;
}

function fmtHora() {
    const d = new Date();
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}
function fmtDataHora(d = new Date()) {
    const dia = String(d.getDate()).padStart(2,'0');
    const mes = String(d.getMonth()+1).padStart(2,'0');
    const ano = d.getFullYear();
    const hora = String(d.getHours()).padStart(2,'0');
    const min = String(d.getMinutes()).padStart(2,'0');
    return `${dia}/${mes}/${ano} ${hora}:${min}`;
}
function formatData(mb) {
    if (mb >= 1024) return (mb / 1024).toFixed(2) + 'GB';
    return mb.toFixed(0) + 'MB';
}
function hojeString() { return new Date().toDateString(); }

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fmtUptime(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    let out = [];
    if (d > 0) out.push(`${d}d`);
    if (h > 0) out.push(`${h}h`);
    if (m > 0) out.push(`${m}m`);
    out.push(`${sec}s`);
    return out.join(' ');
}

// =====================================================================
//   CONVERSÃO DE PACOTE
// =====================================================================
function pacoteParaMB(txt) {
    if (!txt) return 0;
    const s = String(txt).toLowerCase().trim();
    const gm = s.match(/(\d+(?:[.,]\d+)?)\s*(gb|g)/i);
    if (gm) return parseFloat(gm[1].replace(',', '.')) * 1024;
    const mm = s.match(/(\d+(?:[.,]\d+)?)\s*(mb|m)/i);
    if (mm) return parseFloat(mm[1].replace(',', '.'));
    const n = parseFloat(s.replace(',', '.'));
    if (!isNaN(n)) return n;
    return 0;
}

function normalizarNomePacote(txt) {
    const mb = pacoteParaMB(txt);
    if (mb >= 1024) {
        const gb = mb / 1024;
        return (Number.isInteger(gb) ? gb : gb.toFixed(2)) + 'GB';
    }
    return mb + 'MB';
}

function extrairValorNumerico(valorStr) {
    if (!valorStr) return null;
    const m = String(valorStr).match(/([\d]+(?:[.,]\d+)?)/);
    if (!m) return null;
    return parseFloat(m[1].replace(',', '.'));
}

function encontrarPacotePorValor(gid, valorNum) {
    const tabela = tabelas[gid] || [];
    for (const item of tabela) {
        if (Math.abs(item.preco - valorNum) < 0.01) return item;
    }
    return null;
}

// =====================================================================
//   ALUGUER
// =====================================================================
function parseDuracao(str) {
    if (!str) return null;
    const s = String(str).toLowerCase().trim();
    const m = s.match(/^(\d+)\s*([a-zêç]+)$/);
    if (!m) return null;
    const n = parseInt(m[1]);
    const u = m[2];

    if (['mes', 'mês', 'meses'].includes(u))       return { ms: n * 30 * 86400 * 1000, txt: `${n} mês(es)` };
    if (['min', 'minuto', 'minutos'].includes(u))  return { ms: n * 60 * 1000, txt: `${n} minuto(s)` };
    if (['m'].includes(u))                          return { ms: n * 60 * 1000, txt: `${n} minuto(s)` };
    if (['h', 'hora', 'horas'].includes(u))        return { ms: n * 3600 * 1000, txt: `${n} hora(s)` };
    if (['d', 'dia', 'dias'].includes(u))          return { ms: n * 86400 * 1000, txt: `${n} dia(s)` };
    if (['a', 'ano', 'anos'].includes(u))          return { ms: n * 365 * 86400 * 1000, txt: `${n} ano(s)` };
    return null;
}

function tempoRestante(expiraMs) {
    const diff = expiraMs - Date.now();
    if (diff <= 0) return null;
    const s = Math.floor(diff / 1000);
    const a = Math.floor(s / (365 * 86400));
    const restA = s % (365 * 86400);
    const mes = Math.floor(restA / (30 * 86400));
    const restMes = restA % (30 * 86400);
    const d = Math.floor(restMes / 86400);
    const restD = restMes % 86400;
    const h = Math.floor(restD / 3600);
    const restH = restD % 3600;
    const m = Math.floor(restH / 60);
    const seg = restH % 60;
    const partes = [];
    if (a > 0) partes.push(`${a}a`);
    if (mes > 0) partes.push(`${mes}mes`);
    if (d > 0) partes.push(`${d}d`);
    if (h > 0) partes.push(`${h}h`);
    if (m > 0) partes.push(`${m}min`);
    if (partes.length === 0) partes.push(`${seg}s`);
    return partes.join(' ');
}

function temAluguerAtivo(gid) {
    const a = alugueres[gid];
    return a && a.expira > Date.now();
}

// =====================================================================
//   MENSAGENS
// =====================================================================
const MSG_SEM_ALUGUER =
`╔══════════════════════════════╗
║   ⚠️   SEM PACOTE ATIVO   ⚠️  ║
╚══════════════════════════════╝

Olá! 👋

Este grupo *ainda não possui* um pacote de aluguer ativo para usar o *${BOT_NAME}*.

🔒 Sem pacote válido, *todos os comandos permanecem bloqueados*.
📌 Únicos comandos liberados:
   • *.bot* — Informações do bot
   • *.id* — Mostrar ID do grupo

━━━━━━━━━━━━━━━━━━━━━━━━━

💼 *PARA ATIVAR O PACOTE*

Contacta o dono do bot:

👑 *${OWNER_NUMBER}*
💬 wa.me/${OWNER_NUMBER}

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`;

const MSG_ALUGUER_ATIVO = (duracaoTxt, expiraMs) =>
`╔══════════════════════════════╗
║   ✅   PACOTE ATIVADO   ✅   ║
╚══════════════════════════════╝

🎉 *Este grupo recebeu um pacote do ${BOT_NAME}!*

📦 *DETALHES*
⏱️ Duração: *${duracaoTxt}*
📅 Expira em: *${fmtDataHora(new Date(expiraMs))}*
⏳ Restante: *${tempoRestante(expiraMs)}*

🚀 *Tudo desbloqueado!*

👑 Dono: *${OWNER_NUMBER}*
🤖 *${BOT_NAME}* | v7`;

const MSG_ALUGUER_EXPIRADO =
`╔══════════════════════════════╗
║   ⚠️   PACOTE EXPIRADO   ⚠️  ║
╚══════════════════════════════╝

⚠️ O pacote de aluguer do *${BOT_NAME}* neste grupo *expirou*.

🔒 Todos os comandos foram *bloqueados*.

━━━━━━━━━━━━━━━━━━━━━━━━━

📞 *RENOVA JÁ*

👑 *${OWNER_NUMBER}*
💬 wa.me/${OWNER_NUMBER}

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`;

const BOT_START = Date.now();

// =====================================================================
//   EXTRAIR NÚMERO PARA MEGAS
// =====================================================================
function extrairNumeroMegas(textoOriginal, numeroDestinoComprovativo) {
    if (!textoOriginal || typeof textoOriginal !== 'string') return null;
    const linhas = textoOriginal.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (linhas.length === 0) return null;

    const destinoNorm = (numeroDestinoComprovativo || '').replace(/\D/g, '');
    const palavrasCorpo = /(confirmado|transferiste|taxa|saldo|m-?pesa|e-?mola|continua a transferir|em caso de d[uú]vida|liga\s+100|id da transa[çc][aã]o|nome|conta)/i;
    const candidatos = [];

    for (const linha of linhas) {
        if (palavrasCorpo.test(linha)) continue;
        const matches = linha.match(/\d{8,15}/g);
        if (!matches) continue;
        for (const m of matches) {
            const norm = m.replace(/\D/g, '');
            if (destinoNorm && norm === destinoNorm) continue;
            if (norm.length > 12) continue;
            candidatos.push(norm);
        }
    }

    if (candidatos.length > 0) return candidatos[candidatos.length - 1];
    return null;
}

// =====================================================================
//   DETECTOR
// =====================================================================
function analisarComprovativo(textoOriginal) {
    if (!textoOriginal || typeof textoOriginal !== 'string') return null;
    const t = textoOriginal.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

    // M-PESA
    if (/Confirmado\s+[A-Z0-9]+/i.test(t) && /Transferiste/i.test(t)) {
        const chaveMatch = t.match(/Confirmado\s+([A-Z0-9]+)/i);
        let chave = chaveMatch ? chaveMatch[1].toUpperCase() : 'N/D';
        chave = chave.replace(/\.+$/, '');

        const valorMatch = t.match(/Transferiste\s+([\d.,]+)\s*MT/i);
        const valor = valorMatch ? valorMatch[1].replace(',', '.') + ' MT' : 'N/D';

        let destinoNum = 'N/D';
        let destinoNome = 'N/D';

        const m1 = t.match(/para\s+(\d{8,12})\s*[-–]\s*([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]+?)(?:\s+(?:aos|as|às|em|no|na|\.|$))/i);
        if (m1) { destinoNum = m1[1]; destinoNome = m1[2].trim().toUpperCase(); }
        else {
            const m2 = t.match(/para\s+(?:conta\s+)?(\d{8,12})/i);
            if (m2) destinoNum = m2[1];
        }

        const dataMatch = t.match(/aos?\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(?:as|às)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s*(AM|PM)?/i);
        let dataTxt = 'N/D';
        if (dataMatch) dataTxt = `${dataMatch[1]} às ${dataMatch[2]}${dataMatch[3] ? ' ' + dataMatch[3] : ''}`;

        const numeroMegas = extrairNumeroMegas(textoOriginal, destinoNum);
        return { tipo: 'M-Pesa', chave, valor, destinoNumero: destinoNum, destinoNome, data: dataTxt, numeroMegas };
    }

    // E-MOLA (CORRIGIDO)
    if (/ID\s+da\s+transa[çc][aã]o/i.test(t) && /Transferiste/i.test(t)) {
        const chaveMatch = t.match(/ID\s+da\s+transa[çc][aã]o\s+([A-Z0-9.]+)/i);
        let chave = chaveMatch ? chaveMatch[1] : 'N/D';
        chave = chave.replace(/\.+$/, '');

        const valorMatch = t.match(/Transferiste\s+([\d.,]+)\s*MT/i);
        const valor = valorMatch ? valorMatch[1].replace(',', '.') + ' MT' : 'N/D';

        let destinoNum = 'N/D';
        let destinoNome = 'N/D';

        const m1 = t.match(/para\s+conta\s+(\d{8,12})\s*,?\s*nome[:\s]+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]+?)(?:\s+(?:as|às|em|no|na|\.|$))/i);
        if (m1) { destinoNum = m1[1]; destinoNome = m1[2].trim().toUpperCase(); }
        else {
            const m2 = t.match(/para\s+conta\s+(\d{8,12})/i);
            if (m2) destinoNum = m2[1];
            else {
                const m3 = t.match(/(?:para|ao|à)\s+(\d{8,12})/i);
                if (m3) destinoNum = m3[1];
            }
        }

        const dataMatch = t.match(/(?:as|às)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+de\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
        let dataTxt = 'N/D';
        if (dataMatch) dataTxt = `${dataMatch[2]} às ${dataMatch[1]}`;

        let numeroMegas = extrairNumeroMegas(textoOriginal, destinoNum);
        if (!numeroMegas) {
            const todosNumeros = t.match(/\d{8,12}/g) || [];
            const destinoNorm = destinoNum.replace(/\D/g, '');
            for (const n of todosNumeros) {
                const norm = n.replace(/\D/g, '');
                if (norm !== destinoNorm && norm.length >= 8 && norm.length <= 12) numeroMegas = norm;
            }
        }

        return { tipo: 'E-Mola', chave, valor, destinoNumero: destinoNum, destinoNome, data: dataTxt, numeroMegas };
    }

    return null;
}

// =====================================================================
//   REGISTRAR COMPRA
// =====================================================================
async function registrarCompra(sock, gid, clienteJid, item, tamanhoMB, opts = {}) {
    const { auto = false, msgRef = null, notificar = true } = opts;

    if (!compras[gid]) compras[gid] = {};
    if (!compras[gid][clienteJid]) compras[gid][clienteJid] = { compras: [], total: 0 };

    compras[gid][clienteJid].compras.push({
        item,
        mb: tamanhoMB,
        data: new Date().toISOString(),
        auto
    });
    compras[gid][clienteJid].total += tamanhoMB;
    saveDB('compras.json', compras);

    const hoje = hojeString();
    const comprasHoje = compras[gid][clienteJid].compras
        .filter(c2 => new Date(c2.data).toDateString() === hoje).length;
    const ordenado = Object.entries(compras[gid]).sort((a, b) => b[1].total - a[1].total);
    const posicao = ordenado.findIndex(([id]) => id === clienteJid) + 1;
    const maior = ordenado[0];
    const maiorTotal = maior ? maior[1].total : 0;

    const msgBonita =
`╔══════════════════════════════╗
║   🎉   COMPRA REGISTADA   🎉   ║
╚══════════════════════════════╝

👤 *Cliente:* @${clienteJid.split('@')[0]}
📦 *Pacote:* ${item}
${auto ? '🤖 _Registado automaticamente_' : '✍️ _Registado manualmente_'}

━━━━━━━━━━━━━━━━━━━━━━━━━

📊 *ESTATÍSTICAS*

🛒 *Compras hoje:* ${comprasHoje}ª
🏆 *Posição:* ${posicao}º lugar
💾 *Total:* ${formatData(compras[gid][clienteJid].total)}
👑 *Maior comprador:* ${formatData(maiorTotal)}

━━━━━━━━━━━━━━━━━━━━━━━━━

💪 *Continua assim!*

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`;

    if (notificar) {
        try {
            await sock.sendMessage(gid, {
                text: msgBonita,
                mentions: [clienteJid]
            }, msgRef ? { quoted: msgRef } : undefined);
        } catch (e) {
            log('erro', `Enviar msg compra: ${e.message}`);
        }
    }

    log('compra', `Registada: ${item} para ${clienteJid.split('@')[0]} (${auto ? 'auto' : 'manual'})`);

    return { comprasHoje, posicao, total: compras[gid][clienteJid].total, maiorTotal };
}

// =====================================================================
//   AGENDAR COMPRA AUTO (2 min)
// =====================================================================
async function agendarCompraAuto(sock, gid, clienteJid, item, tamanhoMB, chave, msgId) {
    for (const p of Object.values(comprasPendentes)) {
        if (p.chave === chave && p.gid === gid && p.clienteJid === clienteJid) {
            log('warn', `Compra auto já agendada para chave ${chave}`);
            return;
        }
    }

    log('compra', `⏳ Agendada: ${item} (${chave}) para ${clienteJid.split('@')[0]}`);

    const timer = setTimeout(async () => {
        try {
            if (!comprasPendentes[msgId]) return;
            delete comprasPendentes[msgId];

            try {
                await sock.sendMessage(gid, {
                    text:
`╔══════════════════════════════╗
║   ⏰   REGISTO AUTOMÁTICO   ⏰   ║
╚══════════════════════════════╝

👤 @${clienteJid.split('@')[0]}
📦 *${item}*
🔑 Chave: \`${chave}\`

⏳ Passaram 2 minutos — a registar...

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`,
                    mentions: [clienteJid]
                });
            } catch {}

            await registrarCompra(sock, gid, clienteJid, item, tamanhoMB, { auto: true });
        } catch (e) {
            log('erro', `Executar compra auto: ${e.message}`);
        }
    }, COMPRA_AUTO_DELAY_MS);

    comprasPendentes[msgId] = { gid, clienteJid, item, tamanhoMB, chave, timer };
}

// =====================================================================
//   PROCESSAR COMPROVATIVO
// =====================================================================
async function processarComprovativo(sock, from, sender, quotedMsg, textoOriginal, origemTipo) {
    const dados = analisarComprovativo(textoOriginal);
    if (!dados) return false;

    log('ok', `Comprovativo via ${origemTipo}: ${dados.tipo} | Chave: ${dados.chave}`);

    const senderNum = sender.split('@')[0].split(':')[0];

    if (chaves[from] && chaves[from].includes(dados.chave)) {
        const meta = await getGroupMetadata(sock, from);
        const mencoes = [];
        if (meta) meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').forEach(p => mencoes.push(p.id));

        await sock.sendMessage(from, {
            text:
`╔══════════════════════════════╗
║   ⚠️   COMPROVATIVO USADO   ⚠️  ║
╚══════════════════════════════╝

Olá @${senderNum} 👋

Este comprovativo *JÁ FOI UTILIZADO* anteriormente.

🔑 *Chave:* \`${dados.chave}\`
💵 *Valor:* ${dados.valor}

━━━━━━━━━━━━━━━━━━━━━━━━━

🚨 *ATENÇÃO — POSSÍVEL TENTATIVA DE FRAUDE*

❌ *Comprovativos duplicados configuram TENTATIVA DE BURLA.*

⚠️ Caso se confirme fraude, o teu número será:
   • 🚫 *REMOVIDO* do grupo
   • 🚷 *BANIDO* permanentemente

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`,
            mentions: [sender, ...mencoes]
        }, { quoted: quotedMsg });
        return true;
    }

    const listaContas = dados.tipo === 'M-Pesa' ? (contas[from]?.mpesa || []) : (contas[from]?.emola || []);
    const contasNorm = listaContas.map(n => n.replace(/\D/g, ''));
    const destinoNorm = (dados.destinoNumero || '').replace(/\D/g, '');
    const valido = contasNorm.length > 0 && contasNorm.includes(destinoNorm);

    if (!valido) {
        const mencoes = [];
        const meta = await getGroupMetadata(sock, from);
        if (meta) meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').forEach(p => mencoes.push(p.id));

        await sock.sendMessage(from, {
            text:
`╔══════════════════════════════╗
║   ❌   NÃO VALIDADO   ❌   ║
╚══════════════════════════════╝

🧾 *Tipo:* ${dados.tipo}
🔑 *Chave:* \`${dados.chave}\`
💵 *Valor:* ${dados.valor}
🏦 *Destino:* ${dados.destinoNumero} - ${dados.destinoNome}

━━━━━━━━━━━━━━━━━━━━━━━━━

❌ Conta destino *NÃO COINCIDE* com nenhuma registada!

👮 *ADMINS*, verifiquem.`,
            mentions: mencoes
        }, { quoted: quotedMsg });
        return true;
    }

    if (!dados.numeroMegas) {
        await sock.sendMessage(from, {
            text:
`╔══════════════════════════════╗
║   📱   FALTA O NÚMERO   📱   ║
╚══════════════════════════════╝

✅ *Comprovativo validado!*

🧾 *Tipo:* ${dados.tipo}
🔑 *Chave:* \`${dados.chave}\`
💵 *Valor:* ${dados.valor}

━━━━━━━━━━━━━━━━━━━━━━━━━

📲 *Envie o número que deverá receber os megas*

Formato: \`84xxxxxxx\` ou \`25884xxxxxxx\`

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`
        }, { quoted: quotedMsg });
        return true;
    }

    chaves[from].push(dados.chave);
    saveDB('chaves.json', chaves);

    await sock.sendMessage(from, {
        text:
`╔══════════════════════════════╗
║   ✅   VALIDADO   ✅   ║
╚══════════════════════════════╝

🎉 *Comprovativo detectado!*

━━━━━━━━━━━━━━━━━━━━━━━━━

🧾 *Tipo:* ${dados.tipo}
🔑 *Chave:* \`${dados.chave}\`
🏦 *Destino:* ${dados.destinoNumero} - ${dados.destinoNome}
💵 *Valor:* ${dados.valor}
🕒 *Hoje às:* ${fmtHora()}

━━━━━━━━━━━━━━━━━━━━━━━━━

📦 *NÚMERO PARA RECEBER:*
*${dados.numeroMegas}*

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`
    }, { quoted: quotedMsg });

    // AUTO-REGISTO
    if (config[from]?.compraauto) {
        const valorNum = extrairValorNumerico(dados.valor);

        if (valorNum !== null) {
            const pacote = encontrarPacotePorValor(from, valorNum);

            if (pacote) {
                const msgId = quotedMsg.key.id;
                const tamanhoMB = pacoteParaMB(pacote.pacote);

                await agendarCompraAuto(sock, from, sender, pacote.pacote, tamanhoMB, dados.chave, msgId);

                await sock.sendMessage(from, {
                    text:
`╔══════════════════════════════╗
║   ⏳   COMPRA DETETADA   ⏳   ║
╚══════════════════════════════╝

👤 @${senderNum}

💰 Valor: *${valorNum} MT*
📦 Pacote: *${pacote.pacote}*

━━━━━━━━━━━━━━━━━━━━━━━━━

⏰ Registo automático em *2 minutos*.

⚠️ *ADMINS:* se houver problema, apaguem o comprovativo antes.

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`,
                    mentions: [sender]
                }, { quoted: quotedMsg });
            } else {
                const mencoes = [];
                const meta = await getGroupMetadata(sock, from);
                if (meta) meta.participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').forEach(p => mencoes.push(p.id));

                let tabelaTxt = '';
                const tabela = tabelas[from] || [];
                if (tabela.length > 0) {
                    tabelaTxt = '\n\n📋 *Tabela:*\n' + tabela.map(t => `• ${t.pacote} → ${t.preco} MT`).join('\n');
                } else {
                    tabelaTxt = '\n\n⚠️ *Tabela não configurada!*';
                }

                await sock.sendMessage(from, {
                    text:
`╔══════════════════════════════╗
║   ⚠️   VALOR NÃO RECONHECIDO   ║
╚══════════════════════════════╝

👤 @${senderNum}

💰 O valor *${valorNum} MT* não corresponde a nenhum pacote.${tabelaTxt}

━━━━━━━━━━━━━━━━━━━━━━━━━

👮 *ADMINS*, registem *manualmente* esta compra usando \`.compra <pacote>\` respondendo ao comprovativo.

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`,
                    mentions: [sender, ...mencoes]
                }, { quoted: quotedMsg });
            }
        }
    }

    return true;
}

// =====================================================================
//   LOGIN VIA PAIRING CODE
// =====================================================================
function ask(question) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(question, ans => { rl.close(); resolve(ans); }));
}

async function startBot() {
    banner();

    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        logger: pino({ level: 'silent' }),
        syncFullHistory: false,
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined
    });

    SOCK_REF = sock;
    sock.ev.on('creds.update', saveCreds);

    let pedindoCodigo = false;

    sock.ev.on('connection.update', async (u) => {
        const { connection, lastDisconnect, qr } = u;

        if (qr && !state.creds.registered && !pedindoCodigo) {
            pedindoCodigo = true;
            await new Promise(r => setTimeout(r, 3000));

            console.log(`\n${C.yellow}${C.bright}╔══════════════════════════════════════════════╗`);
            console.log(`║        AUTENTICAÇÃO VIA PAIRING CODE         ║`);
            console.log(`╚══════════════════════════════════════════════╝${C.reset}\n`);

            let numero = await ask(`${C.cyan}📱 Digite o número do WhatsApp do bot (com DDI, ex: 2588xxxxxxx): ${C.reset}`);
            numero = numero.replace(/\D/g, '');

            if (!numero || numero.length < 10) {
                log('erro', 'Número inválido!');
                process.exit(1);
            }

            try {
                await new Promise(r => setTimeout(r, 2000));
                const codigo = await sock.requestPairingCode(numero);
                console.log(`\n${C.green}${C.bright}✅ CÓDIGO: ${C.bgGreen}${C.white}${C.bright}   ${codigo}   ${C.reset}`);
                console.log(`\n${C.red}⚠️  EXPIRA EM 60 SEGUNDOS!${C.reset}\n`);
            } catch (e) {
                log('erro', `Pairing: ${e.message}`);
                pedindoCodigo = false;
            }
        }

        if (connection === 'close') {
            const code = (lastDisconnect?.error instanceof Boom)?.output?.statusCode;
            const reconnect = code !== DisconnectReason.loggedOut;
            log('warn', `Conexão fechada (${code}). Reconectar: ${reconnect}`);
            if (reconnect) startBot();
            else process.exit(1);
        } else if (connection === 'open') {
            log('ok', `${BOT_NAME} conectado!`);
            log('info', `Dono: ${OWNER_NUMBER} | LID: ${OWNER_LID}`);
            log('info', `Bot ID: ${sock.user?.id} | LID: ${sock.user?.lid || 'N/D'}`);
            log('info', `Concorrentes: ${concorrentesDB.lista.length}`);
            log('info', `Iniciado em: ${fmtDataHora()}\n`);

            try {
                const botNum = normalizarNumero(sock.user?.id);
                const botLid = normalizarNumero(sock.user?.lid);
                const donoNum = OWNER_NUMBER.replace(/\D/g, '');
                const proibidos = new Set();
                if (botNum) { proibidos.add(botNum); proibidos.add('258' + botNum); }
                if (botLid) proibidos.add(botLid);
                if (donoNum) { proibidos.add(donoNum); proibidos.add('258' + donoNum); }
                if (OWNER_LID) proibidos.add(OWNER_LID);
                for (const e of EXCECOES_EXTRA) {
                    const limpo = String(e).replace(/\D/g, '');
                    if (limpo) { proibidos.add(limpo); if (limpo.length === 9) proibidos.add('258' + limpo); }
                }

                const antes = concorrentesDB.lista.length;
                concorrentesDB.lista = concorrentesDB.lista.filter(n => {
                    const limpo = String(n).replace(/\D/g, '');
                    for (const p of proibidos) {
                        if (!p) continue;
                        if (limpo === p) return false;
                        if (limpo.startsWith('258') && limpo.slice(3) === p) return false;
                        if (p.startsWith('258') && p.slice(3) === limpo) return false;
                    }
                    return true;
                });

                if (concorrentesDB.lista.length < antes) {
                    saveDB('concorrentes.json', concorrentesDB);
                    log('ok', `🧹 Limpeza: ${antes - concorrentesDB.lista.length} removidos`);
                }
            } catch (e) { log('erro', `Limpeza: ${e.message}`); }
        }
    });

    function initGroup(gid) {
        let changed = false;
        if (!config[gid]) {
            config[gid] = {
                antilink: false, antifoto: false, antivideo: false, antiaudio: false,
                antistatus: false, anticoncorrencia: false, detector: false,
                bemvindo: false, bsvindoMsg: null, nanoativar: false,
                comprasAtivo: false, compraauto: false
            };
            changed = true;
        }
        if (config[gid].compraauto === undefined) config[gid].compraauto = false;
        if (!contas[gid]) { contas[gid] = { mpesa: [], emola: [] }; changed = true; }
        if (!nanos[gid]) { nanos[gid] = {}; changed = true; }
        if (!compras[gid]) { compras[gid] = {}; changed = true; }
        if (!alarmes[gid]) { alarmes[gid] = { abrir: null, fechar: null }; changed = true; }
        if (!chaves[gid]) { chaves[gid] = []; changed = true; }
        if (!tabelas[gid]) { tabelas[gid] = []; changed = true; }

        if (changed) {
            saveDB('config.json', config);
            saveDB('contas.json', contas);
            saveDB('nanos.json', nanos);
            saveDB('compras.json', compras);
            saveDB('alarmes.json', alarmes);
            saveDB('chaves.json', chaves);
            saveDB('tabela.json', tabelas);
        }
    }

    // ================= GROUP PARTICIPANTS =================
    sock.ev.on('group-participants.update', async (update) => {
        try {
            const { id, participants, action } = update;
            initGroup(id);

            if (action === 'add' || action === 'invite') {
                const cc = config[id] || {};
                const temAlug = temAluguerAtivo(id);
                const ativo = cc.anticoncorrencia === true;

                if (ativo && temAlug) {
                    const botAdm = await botIsAdmin(sock, id);
                    for (const p of participants) {
                        const pIds = coletarIdsParticipante(p);
                        if (pIds.length === 0) continue;

                        let isExc = false;
                        for (const pid of pIds) if (ehExcecao(pid)) { isExc = true; break; }
                        if (isExc) continue;

                        let conc = null;
                        for (const pid of pIds) {
                            const r = ehConcorrente(pid);
                            if (r) { conc = r; break; }
                        }

                        if (conc) {
                            const idStr = extrairIdParticipante(p);
                            const num = extrairNumeroParticipante(p);
                            const ehAdminNovo = p.admin === 'admin' || p.admin === 'superadmin';

                            // ⚠️ ADMIN → só avisa
                            if (ehAdminNovo) {
                                log('rent', `🚨 Concorrente ${num} entrou como ADMIN — não removo`);
                                if (botAdm) {
                                    try {
                                        await sock.sendMessage(id, {
                                            text:
`╔══════════════════════════════╗
║   ⚠️   CONCORRENTE ADMIN   ║
╚══════════════════════════════╝

👤 @${num}

❌ Está na *lista negra* de concorrentes
⚠️ Mas entrou como *ADMIN*

🚫 *Não posso removê-lo.*

📌 Rebaixa-o primeiro para poder ser banido.

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`,
                                            mentions: [idStr]
                                        });
                                    } catch {}
                                }
                                continue;
                            }

                            // Membro comum → remove
                            if (botAdm) {
                                try {
                                    await sock.sendMessage(id, {
                                        text:
`╔══════════════════════════════╗
║   🚨   CONCORRENTE DETECTADO   🚨   ║
╚══════════════════════════════╝

👤 @${num}

❌ Está na *lista negra*!
🚫 *Remoção automática.*

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`,
                                        mentions: [idStr]
                                    });
                                    await sock.groupParticipantsUpdate(id, [idStr], 'remove');
                                    log('rent', `Removido concorrente ${num}`);
                                } catch (e) {
                                    log('erro', `Falha ao remover: ${e.message}`);
                                }
                            }
                        }
                    }
                }

                if (config[id].bemvindo && temAluguerAtivo(id)) {
                    const meta = await getGroupMetadata(sock, id);
                    const nomeGrupo = meta?.subject || 'o grupo';
                    const totalMembros = meta?.participants?.length || 0;

                    for (const p of participants) {
                        const pIds = coletarIdsParticipante(p);
                        let isExc = false;
                        for (const pid of pIds) if (ehExcecao(pid)) { isExc = true; break; }
                        if (isExc) continue;

                        let isConc = false;
                        for (const pid of pIds) if (ehConcorrente(pid)) { isConc = true; break; }
                        if (isConc) continue;

                        const idStr = extrairIdParticipante(p);
                        const num = extrairNumeroParticipante(p);

                        let msg = config[id].bsvindoMsg ||
`╔══════════════════════════════╗
║   👋   BEM-VINDO(A)!   👋   ║
╚══════════════════════════════╝

Olá @${num}! 🎉

Bem-vindo(a) ao grupo *${nomeGrupo}*!

👥 *Agora somos ${totalMembros} membros!*

━━━━━━━━━━━━━━━━━━━━━━━━━

📌 *REGRAS:*
✅ Respeita os membros
✅ Sem links
✅ Sem spam
✅ Sem concorrentes

⚠️ O não cumprimento resulta em *remoção*.

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`;

                        msg = msg.replace(/@user/gi, `@${num}`);
                        try { await sock.sendMessage(id, { text: msg, mentions: [idStr] }); } catch {}
                    }
                }
            }
        } catch (e) { log('erro', `Participants: ${e.message}`); }
    });

    // ================= MESSAGES =================
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        const msg = messages[0];
        if (!msg.message) return;

        const from      = msg.key.remoteJid;
        const isGroup   = from.endsWith('@g.us');

        const candidatosSender = [
            msg.key.participant,
            msg.key.participantPn,
            msg.key.participantAlt,
            msg.key.senderPn,
            msg.participant,
            msg.key.remoteJid,
        ].filter(Boolean);

        const idsSender = [];
        for (const c of candidatosSender) {
            if (typeof c === 'string' && !idsSender.includes(c)) idsSender.push(c);
        }

        const sender = idsSender[0] || '';
        const senderNum = sender.split('@')[0].split(':')[0];

        if (isGroup) initGroup(from);

        let souDonoCheck = false;
        for (const id of idsSender) if (isOwnerNumber(id)) { souDonoCheck = true; break; }

        const mtype = getContentType(msg.message);

        let text = '';
        if (mtype === 'conversation')              text = msg.message.conversation || '';
        else if (mtype === 'extendedTextMessage')  text = msg.message.extendedTextMessage?.text || '';
        else if (mtype === 'imageMessage')         text = msg.message.imageMessage?.caption || '';
        else if (mtype === 'videoMessage')         text = msg.message.videoMessage?.caption || '';
        else if (mtype === 'documentMessage')      text = msg.message.documentMessage?.caption || '';

        const ctx = msg.message.extendedTextMessage?.contextInfo ||
                    msg.message.imageMessage?.contextInfo ||
                    msg.message.videoMessage?.contextInfo ||
                    msg.message.audioMessage?.contextInfo ||
                    msg.message.documentMessage?.contextInfo || {};
        const mentioned = ctx.mentionedJid || [];
        const quoted    = ctx.participant;
        const c         = config[from] || {};

        // LOG
        try {
            const tipoMsgMap = {
                conversation: '💬 Texto', extendedTextMessage: '💬 Texto',
                imageMessage: '🖼️ Imagem', videoMessage: '🎥 Vídeo',
                audioMessage: '🎵 Áudio', documentMessage: '📄 Documento',
                stickerMessage: '🎨 Sticker', contactMessage: '👤 Contato',
                locationMessage: '📍 Localização'
            };
            const tipoMsg = tipoMsgMap[mtype] || `📦 ${mtype}`;
            const hora = fmtDataHora();

            if (isGroup) {
                const meta = await getGroupMetadata(sock, from);
                const nomeGrupo = meta?.subject || 'Desconhecido';
                log('grupo', `${C.bright}${nomeGrupo}${C.reset}`);
                log('msg',   `└─ 👤 ${senderNum} | ${tipoMsg} | ${hora}`);
                if (text) {
                    const preview = text.length > 80 ? text.slice(0, 80) + '...' : text;
                    log('msg',   `   💬 "${preview.replace(/\n/g, ' ')}"`);
                }
            } else {
                log('pv', `${senderNum}`);
                if (text) {
                    const preview = text.length > 80 ? text.slice(0, 80) + '...' : text;
                    log('msg', `   💬 "${preview.replace(/\n/g, ' ')}"`);
                }
            }
        } catch {}

        // Deteta comprovativo apagado
        if (isGroup && mtype === 'protocolMessage' && msg.message.protocolMessage?.type === 0) {
            const apagadaId = msg.message.protocolMessage.key?.id;
            if (apagadaId && comprasPendentes[apagadaId]) {
                log('warn', `Comprovativo apagado, cancelando compra auto`);
                clearTimeout(comprasPendentes[apagadaId].timer);
                const p = comprasPendentes[apagadaId];
                delete comprasPendentes[apagadaId];

                try {
                    await sock.sendMessage(from, {
                        text:
`╔══════════════════════════════╗
║   ❌   COMPRA CANCELADA   ❌   ║
╚══════════════════════════════╝

👤 @${p.clienteJid.split('@')[0]}
📦 ${p.item}

⚠️ O comprovativo foi apagado antes do registo automático.

📌 *ADMINS:* registem manualmente se necessário.

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`,
                        mentions: [p.clienteJid]
                    });
                } catch {}
            }
        }

        if (msg.key.fromMe) return;

        // ALUGUER
        if (isGroup) {
            const alug = alugueres[from];
            const expirado = alug && alug.expira <= Date.now();

            if (expirado) {
                delete alugueres[from];
                saveDB('alugueres.json', alugueres);
                log('rent', `Aluguer expirou: ${from}`);
            }

            if (!temAluguerAtivo(from)) {
                const cmdMatch = text.match(/^\.\s*(\S+)/);
                const permitidosSemAluguer = ['bot', 'id', 'checkadmin'];
                if (cmdMatch && permitidosSemAluguer.includes(cmdMatch[1].toLowerCase())) {
                    // permite
                } else {
                    if (cmdMatch) await sock.sendMessage(from, { text: MSG_SEM_ALUGUER }, { quoted: msg });
                    return;
                }
            }
        }

        // ==================== PROTEÇÕES ====================
        if (isGroup) {
            const senderAdmin = await isAdmin(sock, from, sender);
            const protegido   = senderAdmin || souDonoCheck;

            // CONCORRENTE — regra especial: ADMIN concorrente é IGNORADO
            if (c.anticoncorrencia) {
                let isExc = false;
                for (const id of idsSender) if (ehExcecao(id)) { isExc = true; break; }

                if (!isExc) {
                    let conc = null;
                    for (const id of idsSender) {
                        const r = ehConcorrente(id);
                        if (r) { conc = r; break; }
                    }
                    if (conc && !souDonoCheck) {
                        const ehAdminMsg = await isAdmin(sock, from, sender);

                        // ⚠️ ADMIN concorrente → SILÊNCIO TOTAL
                        if (ehAdminMsg) {
                            log('debug', `Concorrente admin ${senderNum} — ignorado silenciosamente`);
                            // Não apaga, não avisa, continua o processamento
                        } else {
                            // Membro comum → apaga + remove
                            const botAdm = await botIsAdmin(sock, from);
                            try { await sock.sendMessage(from, { delete: msg.key }); } catch {}

                            if (botAdm) {
                                for (const id of idsSender) {
                                    try { await sock.groupParticipantsUpdate(from, [id], 'remove'); } catch {}
                                }
                                await sock.sendMessage(from, {
                                    text:
`╔══════════════════════════════╗
║   🚨   CONCORRENTE BANIDO   🚨   ║
╚══════════════════════════════╝

👤 @${senderNum}

❌ Está na *lista negra*!
🚫 *Removido automaticamente.*

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`,
                                    mentions: [sender]
                                });
                            } else {
                                await sock.sendMessage(from, {
                                    text: `⚠️ Concorrente @${senderNum} detetado, mas preciso ser admin para remover.`,
                                    mentions: [sender]
                                });
                            }
                            return;
                        }
                    }
                }
            }

            if (c.antilink && !protegido && text) {
                const linkRegex = /(https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me\/)/i;
                if (linkRegex.test(text)) {
                    try { await sock.sendMessage(from, { delete: msg.key }); } catch {}
                    if (!antilinkCount[from]) antilinkCount[from] = {};
                    if (!antilinkCount[from][sender]) antilinkCount[from][sender] = 0;
                    antilinkCount[from][sender]++;
                    const count = antilinkCount[from][sender];
                    if (count >= 3) {
                        await sock.sendMessage(from, { text: `🚫 @${senderNum} banido (3 links)`, mentions: [sender] });
                        try { await sock.groupParticipantsUpdate(from, [sender], 'remove'); } catch {}
                        antilinkCount[from][sender] = 0;
                    } else {
                        await sock.sendMessage(from, { text: `⚠️ @${senderNum} links não permitidos! (${count}/3)`, mentions: [sender] });
                    }
                    return;
                }
            }

            if (c.detector) {
                if (mtype === 'imageMessage') {
                    const caption = msg.message.imageMessage?.caption || '';
                    if (caption) { const ok = await processarComprovativo(sock, from, sender, msg, caption, 'imagem'); if (ok) return; }
                } else if (mtype === 'conversation' || mtype === 'extendedTextMessage') {
                    const ok = await processarComprovativo(sock, from, sender, msg, text, 'texto');
                    if (ok) return;
                }
            }

            if (c.antifoto && !protegido && mtype === 'imageMessage') {
                const caption = msg.message.imageMessage?.caption || '';
                const isComprovante = c.detector && analisarComprovativo(caption) !== null;
                if (!isComprovante) {
                    try { await sock.sendMessage(from, { delete: msg.key }); } catch {}
                    await sock.sendMessage(from, { text: `📷 @${senderNum} fotos não permitidas!`, mentions: [sender] });
                    return;
                }
            }

            if (c.antivideo && !protegido && mtype === 'videoMessage') {
                try { await sock.sendMessage(from, { delete: msg.key }); } catch {}
                await sock.sendMessage(from, { text: `🎥 @${senderNum} vídeos não permitidos!`, mentions: [sender] });
                return;
            }

            if (c.antiaudio && !protegido && mtype === 'audioMessage') {
                try { await sock.sendMessage(from, { delete: msg.key }); } catch {}
                await sock.sendMessage(from, { text: `🎵 @${senderNum} áudios não permitidos!`, mentions: [sender] });
                return;
            }

            if (c.antistatus && !protegido) {
                const ehMencaoStatus =
                    mtype === 'statusMentionMessage' || msg.message.statusMentionMessage ||
                    ctx.remoteJid === 'status@broadcast' ||
                    /status@broadcast/i.test(JSON.stringify(msg.message));
                if (ehMencaoStatus) {
                    try { await sock.sendMessage(from, { delete: msg.key }); } catch {}
                    await sock.sendMessage(from, { text: `📵 @${senderNum} status não permitido!`, mentions: [sender] });
                    return;
                }
            }
        }

        // NANO
        if (!text.startsWith(PREFIX)) {
            if (isGroup && c.nanoativar && nanos[from] && text) {
                const textoLower = text.trim().toLowerCase();
                for (const [gatilho, resposta] of Object.entries(nanos[from])) {
                    const gatilhoLower = gatilho.toLowerCase();
                    const comeca = textoLower === gatilhoLower || textoLower.startsWith(gatilhoLower + ' ');
                    const regexPalavra = new RegExp(`(^|\\s)${escapeRegex(gatilhoLower)}(\\s|$)`, 'i');
                    if (comeca || regexPalavra.test(textoLower)) {
                        let respostaFinal = resposta.replace(/@user/gi, `@${senderNum}`);
                        const mencoes = [sender];
                        for (const m of mentioned) if (!mencoes.includes(m)) mencoes.push(m);
                        await sock.sendMessage(from, { text: respostaFinal, mentions: mencoes }, { quoted: msg });
                        return;
                    }
                }
            }
            return;
        }

        // ==================== COMANDOS ====================
        const args = text.slice(PREFIX.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        const isSenderAdmin = isGroup ? await isAdmin(sock, from, sender) : false;
        const botAdm = isGroup ? await botIsAdmin(sock, from) : false;
        const temPermissao = souDonoCheck || (isGroup && isSenderAdmin);

        log('cmd', `.${command} | De: ${senderNum} | ${isGroup ? 'GRUPO' : 'PV'}`);

        const comandosSóDonoPV = ['addconcorrente', 'addconcorrentes', 'removeconcorrente', 'delconcorrente', 'listaconcorrentes', 'listagrupos', 'meusgrupos'];
        if (comandosSóDonoPV.includes(command)) {
            if (isGroup) return sock.sendMessage(from, { text: `🚫 Só funciona no PV do bot.` }, { quoted: msg });
            if (!souDonoCheck) return sock.sendMessage(from, { text: `🚫 Apenas o dono.` }, { quoted: msg });
        }

        const comandosDono = ['aluguer', 'removeraluguer', 'cancelaraluguer', 'recolher', 'meuid', 'quemsou'];
        if (comandosDono.includes(command)) {
            if (!souDonoCheck) {
                await sock.sendMessage(from, { text: `🚫 Apenas o dono.` }, { quoted: msg });
                return;
            }
        }

        const comandosAdmin = [
            'del', 'ban', 'grupo', 'limpar',
            'antilink', 'antifoto', 'antivideo', 'antiaudio', 'antistatus',
            'detector', 'anticoncorrencia', 'anticoncorrente',
            'addmpesa', 'addmola', 'delmpesa', 'delmola',
            'promover', 'demote', 'alarmea', 'alarmef', 'bsvindo', 'bemvindo',
            'nanoativar', 'nanoadd', 'nanodel', 'limparnanos',
            'compras', 'resetcompras', 'fantasmas',
            'verconcorrentes',
            'tabela', 'compraauto'
        ];

        if (comandosAdmin.includes(command)) {
            if (!temPermissao) {
                await sock.sendMessage(from, { text: `🚫 Apenas administradores.` }, { quoted: msg });
                return;
            }
            const comandosPrecisamBotAdm = ['del', 'ban', 'grupo', 'limpar', 'promover', 'demote', 'fantasmas', 'verconcorrentes'];
            if (isGroup && comandosPrecisamBotAdm.includes(command) && !botAdm) {
                await sock.sendMessage(from, { text: `⚠️ Preciso ser admin do grupo.\n\n💡 Usa \`.checkadmin\`` }, { quoted: msg });
                return;
            }
        }

        try {
            switch (command) {

                case 'checkadmin': {
                    if (!isGroup) return;
                    const meta = await getGroupMetadata(sock, from);
                    const botId = sock.user?.id || 'N/D';
                    const botLid = sock.user?.lid || 'N/D';
                    const botNum = normalizarNumero(botId);
                    const botLidNum = normalizarNumero(botLid);

                    let encontrado = null;
                    if (meta) {
                        for (const p of meta.participants) {
                            const pIds = coletarIdsParticipante(p);
                            const pNums = pIds.map(i => i.split(':')[0].split('@')[0].replace(/\D/g, ''));
                            if (pNums.includes(botNum) || pNums.includes(botLidNum)) {
                                encontrado = { pIds, admin: p.admin };
                                break;
                            }
                        }
                    }

                    const botAdmV = await botIsAdmin(sock, from);
                    let txt = `🔍 *CHECK ADMIN*\n\n🤖 Bot ID: \`${botId}\`\n📇 LID: \`${botLid}\`\n🔢 Num: \`${botNum}\`\n\n*Estou na lista?* ${encontrado ? '✅' : '❌'}`;
                    if (encontrado) {
                        txt += `\n\n*Meus IDs:*\n${encontrado.pIds.map(i => `• \`${i}\``).join('\n')}`;
                        txt += `\n\n*Admin?* ${encontrado.admin || 'membro'}`;
                    }
                    txt += `\n\n*Resultado:* ${botAdmV ? '✅ SOU ADMIN' : '❌ NÃO SOU ADMIN'}`;
                    await sock.sendMessage(from, { text: txt }, { quoted: msg });
                    break;
                }

                case 'meuid':
                case 'quemsou': {
                    await sock.sendMessage(from, {
                        text: `🤖 *BOT*\n\n🆔 \`${sock.user?.id}\`\n📇 \`${sock.user?.lid || 'N/D'}\``
                    }, { quoted: msg });
                    break;
                }

                case 'id': {
                    if (!isGroup) return;
                    await sock.sendMessage(from, {
                        text: `🆔 *ID DO GRUPO*\n\n\`${from}\`\n\n👑 Dono: *${OWNER_NUMBER}*`
                    }, { quoted: msg });
                    break;
                }

                case 'listagrupos':
                case 'meusgrupos': {
                    try {
                        const grupos = await sock.groupFetchAllParticipating();
                        const lista = Object.values(grupos);
                        if (lista.length === 0) return sock.sendMessage(from, { text: `📭 Vazio.` });

                        let txt = `📋 *GRUPOS DO BOT*\n\n📊 Total: *${lista.length}*\n\n`;
                        for (let i = 0; i < lista.length; i++) {
                            const g = lista[i];
                            const temAlug = alugueres[g.id] && alugueres[g.id].expira > Date.now();
                            txt += `${i+1}. *${g.subject}*${temAlug ? ' ✅' : ''}\n   🆔 \`${g.id}\`\n   👥 ${g.participants?.length || 0}\n\n`;
                        }
                        await sock.sendMessage(from, { text: txt }, { quoted: msg });
                    } catch (e) {
                        await sock.sendMessage(from, { text: `❌ ${e.message}` });
                    }
                    break;
                }

                case 'menu':
                case 'help': {
                    const menuText = `
╭═══════════════════════╮
│ 🤖 *${BOT_NAME} • MENU* │
╰═══════════════════════╯

👑 *ADMIN*
━━━━━━━━━━━━━━━━━━
.id .ban .del .grupo .limpar
.status .bot .checkadmin
.antilink .antifoto .antivideo
.antiaudio .antistatus .detector
.anticoncorrente on/off
.verconcorrentes
.addmpesa .addmola .contas
.promover .demote .pp .p
.alarmea .alarmef

📋 *TABELA DE PACOTES*
━━━━━━━━━━━━━━━━━━
.tabela add 440mb-10mt, 1gb-23mt
.tabela listar
.tabela del 440mb
.tabela clear

🛒 *COMPRAS*
━━━━━━━━━━━━━━━━━━
.compras on/off
.compraauto on/off ⚡
.clientes
.compra 620mb
.resetcompras

🎉 *BOAS-VINDAS*
━━━━━━━━━━━━━━━━━━
.bsvindo <msg>
.bemvindo on/off

🧠 *NANO (SEM PREFIXO)*
━━━━━━━━━━━━━━━━━━
.nanoativar .nanoadd
.nanodel .listanano

👻 *MEMBROS*
━━━━━━━━━━━━━━━━━━
.todos .rentanas .fantasmas

💼 *ALUGUER (DONO PV)*
━━━━━━━━━━━━━━━━━━
.aluguer 7d <id>
.removeraluguer <id>

🚫 *CONCORRENTES (DONO PV)*
━━━━━━━━━━━━━━━━━━
.addconcorrente 84xxx
.addconcorrentes
.removeconcorrente 84xxx
.listaconcorrentes
.recolher <id>
.listagrupos

━━━━━━━━━━━━━━━━━━
Dono: ${OWNER_NUMBER}
⚙️ *${BOT_NAME}* | v7`.trim();
                    await sock.sendMessage(from, { text: menuText }, { quoted: msg });
                    break;
                }

                case 'compraauto': {
                    if (!isGroup) return;
                    if (!args[0]) {
                        const st = config[from].compraauto ? 'ATIVADO' : 'DESATIVADO';
                        const emoji = config[from].compraauto ? '✅' : '❌';
                        return sock.sendMessage(from, {
                            text:
`⚡ *COMPRA AUTO*
━━━━━━━━━━━━━━━━━
${emoji} Status: *${st}*

💡 Use:
• \`.compraauto on\`
• \`.compraauto off\`

📌 *O que faz:*
Quando um cliente manda um comprovativo válido,
o bot deteta o valor, procura na tabela,
e regista a compra automaticamente após *2 minutos*.

⚠️ *Requer:* tabela configurada (\`.tabela add\`)`
                        });
                    }

                    const novo = args[0].toLowerCase() === 'on';

                    if (novo) {
                        const tabela = tabelas[from] || [];
                        if (tabela.length === 0) {
                            return sock.sendMessage(from, {
                                text: `⚠️ *Não posso ativar!*\n\nA *tabela de pacotes* está vazia.\n\n📌 Adiciona primeiro:\n\`.tabela add 440mb-10mt, 1gb-23mt\``
                            });
                        }
                    }

                    config[from].compraauto = novo;
                    saveDB('config.json', config);

                    await sock.sendMessage(from, {
                        text: `⚡ *COMPRA AUTO*: ${novo ? '✅ ATIVADO' : '❌ DESATIVADO'}`
                    });
                    break;
                }

                case 'tabela': {
                    if (!isGroup) return;
                    const sub = (args[0] || '').toLowerCase();

                    if (sub === 'add' || sub === 'adicionar') {
                        if (args.length < 2) {
                            return sock.sendMessage(from, {
                                text: `📋 \`.tabela add pacote-preço, pacote-preço, ...\`\n\nEx: \`.tabela add 440mb-10mt, 215mb-5mt, 1gb-23mt\``
                            });
                        }

                        const rawText = msg.message.extendedTextMessage?.text || msg.message.conversation || '';
                        const semComando = rawText.replace(/^\.?\s*tabela\s+(add|adicionar)\s+/i, '').trim();
                        const partes = semComando.split(',').map(p => p.trim()).filter(Boolean);

                        const adicionados = [], invalidos = [], atualizados = [];
                        if (!tabelas[from]) tabelas[from] = [];

                        for (const parte of partes) {
                            const m = parte.match(/^([\w\s]+?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(?:mt|mzn)?$/i);
                            if (!m) { invalidos.push(parte); continue; }

                            const pacoteNome = normalizarNomePacote(m[1]);
                            const preco = parseFloat(m[2].replace(',', '.'));
                            const mb = pacoteParaMB(m[1]);

                            if (!pacoteNome || !preco || mb <= 0) { invalidos.push(parte); continue; }

                            const idx = tabelas[from].findIndex(t => t.pacote === pacoteNome);
                            if (idx >= 0) {
                                tabelas[from][idx].preco = preco;
                                atualizados.push(`${pacoteNome} → ${preco} MT`);
                            } else {
                                tabelas[from].push({ pacote: pacoteNome, preco, mb });
                                adicionados.push(`${pacoteNome} → ${preco} MT`);
                            }
                        }

                        saveDB('tabela.json', tabelas);

                        let txt = `📋 *TABELA ATUALIZADA*\n\n`;
                        if (adicionados.length > 0) txt += `✅ Adicionados (${adicionados.length}):\n${adicionados.map(a => `• ${a}`).join('\n')}\n\n`;
                        if (atualizados.length > 0) txt += `🔄 Atualizados (${atualizados.length}):\n${atualizados.map(a => `• ${a}`).join('\n')}\n\n`;
                        if (invalidos.length > 0) txt += `⚠️ Inválidos (${invalidos.length}):\n${invalidos.map(a => `• ${a}`).join('\n')}\n\n`;
                        txt += `━━━━━━━━━━━━━━━━\n📊 *Tabela atual:*\n${tabelas[from].map(t => `• ${t.pacote} → ${t.preco} MT`).join('\n')}`;

                        await sock.sendMessage(from, { text: txt }, { quoted: msg });
                        break;
                    }

                    if (sub === 'listar' || sub === 'list' || sub === 'ver') {
                        const tabela = tabelas[from] || [];
                        if (tabela.length === 0) {
                            return sock.sendMessage(from, { text: `📭 Tabela vazia.\n\n💡 \`.tabela add 440mb-10mt, 1gb-23mt\`` });
                        }

                        let txt = `📋 *TABELA DE PACOTES*\n\n`;
                        for (let i = 0; i < tabela.length; i++) {
                            txt += `${i+1}. *${tabela[i].pacote}* → *${tabela[i].preco} MT*\n`;
                        }
                        txt += `\n⚡ Compra auto: *${config[from].compraauto ? 'ON' : 'OFF'}*`;

                        await sock.sendMessage(from, { text: txt }, { quoted: msg });
                        break;
                    }

                    if (sub === 'del' || sub === 'delete' || sub === 'remover') {
                        if (!args[1]) return;
                        const pacoteNome = normalizarNomePacote(args.slice(1).join(' '));
                        const tabela = tabelas[from] || [];
                        const idx = tabela.findIndex(t => t.pacote === pacoteNome);
                        if (idx < 0) return sock.sendMessage(from, { text: `⚠️ Não encontrado.` });
                        tabela.splice(idx, 1);
                        saveDB('tabela.json', tabelas);
                        await sock.sendMessage(from, { text: `🗑️ *${pacoteNome}* removido.` });
                        break;
                    }

                    if (sub === 'clear' || sub === 'limpar') {
                        tabelas[from] = [];
                        saveDB('tabela.json', tabelas);
                        config[from].compraauto = false;
                        saveDB('config.json', config);
                        await sock.sendMessage(from, { text: `🗑️ Tabela limpa + compra auto OFF.` });
                        break;
                    }

                    await sock.sendMessage(from, {
                        text: `📋 *COMANDO TABELA*\n\n🔹 \`.tabela add 440mb-10mt\`\n🔹 \`.tabela add 440mb-10mt, 215mb-5mt, 1gb-23mt\`\n🔹 \`.tabela listar\`\n🔹 \`.tabela del 440mb\`\n🔹 \`.tabela clear\``
                    });
                    break;
                }

                case 'recolher': {
                    if (isGroup) return sock.sendMessage(from, { text: `🚫 Só no PV do bot.` }, { quoted: msg });
                    if (!souDonoCheck) return sock.sendMessage(from, { text: `🚫 Apenas o dono.` }, { quoted: msg });
                    if (args.length < 1) return sock.sendMessage(from, { text: `⚠️ \`.recolher <id>\`` });

                    const gid = args[0];
                    if (!gid.includes('@g.us')) return sock.sendMessage(from, { text: `⚠️ ID inválido.` });

                    const meta = await getGroupMetadata(sock, gid);
                    if (!meta) return sock.sendMessage(from, { text: `❌ Não acessei.\n\n💡 \`.listagrupos\`` });

                    const adicionados = [], duplicados = [];
                    for (const p of meta.participants) {
                        const pIds = coletarIdsParticipante(p);
                        let isExc = false;
                        for (const pid of pIds) if (ehExcecao(pid)) { isExc = true; break; }
                        if (isExc) continue;

                        let idStr = extrairIdParticipante(p);
                        if (!idStr) idStr = pIds[0];
                        let numNorm = idStr.split(':')[0].split('@')[0].replace(/\D/g, '');
                        if (numNorm.length === 9) numNorm = '258' + numNorm;
                        if (!numNorm || numNorm.length < 9) continue;

                        if (concorrentesDB.lista.includes(numNorm)) duplicados.push(numNorm);
                        else { concorrentesDB.lista.push(numNorm); adicionados.push(numNorm); }
                    }

                    saveDB('concorrentes.json', concorrentesDB);

                    await sock.sendMessage(from, {
                        text: `🎯 *RECOLHA CONCLUÍDA*\n\n📦 ${meta.subject}\n👥 ${meta.participants.length} membros\n\n✅ Adicionados: *${adicionados.length}*\nℹ️ Já existiam: *${duplicados.length}*\n📋 Total: *${concorrentesDB.lista.length}*`
                    }, { quoted: msg });
                    break;
                }

                case 'addconcorrente': {
                    if (args.length < 1) return;
                    let numNorm = args[0].includes('@') ? args[0].split(':')[0].split('@')[0] : normalizarConcorrente(args[0]);
                    if (!numNorm || numNorm.length < 9) return;
                    if (ehExcecao(numNorm)) return sock.sendMessage(from, { text: `🚫 Excluído.` });
                    if (!concorrentesDB.lista.includes(numNorm)) {
                        concorrentesDB.lista.push(numNorm);
                        saveDB('concorrentes.json', concorrentesDB);
                    }
                    await sock.sendMessage(from, { text: `✅ \`${numNorm}\`\n📋 Total: *${concorrentesDB.lista.length}*` }, { quoted: msg });
                    break;
                }

                case 'addconcorrentes':
                case 'addvariosconcorrentes': {
                    const rawText = msg.message.extendedTextMessage?.text || msg.message.conversation || '';
                    const linhas = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                    if (linhas.length < 2) return sock.sendMessage(from, { text: `⚠️ \`.addconcorrentes\` + linhas` });

                    const adicionados = [], duplicados = [], excluidos = [];
                    for (let i = 1; i < linhas.length; i++) {
                        let linha = linhas[i].replace(PREFIX, '').trim();
                        const nums = linha.match(/\d{9,20}/g) || [];
                        for (const n of nums) {
                            let numNorm = n.length > 15 ? n : normalizarConcorrente(n);
                            if (numNorm.length < 9) continue;
                            if (ehExcecao(numNorm)) { excluidos.push(numNorm); continue; }
                            if (concorrentesDB.lista.includes(numNorm)) duplicados.push(numNorm);
                            else { concorrentesDB.lista.push(numNorm); adicionados.push(numNorm); }
                        }
                    }
                    saveDB('concorrentes.json', concorrentesDB);
                    await sock.sendMessage(from, {
                        text: `✅ Add: ${adicionados.length}\nℹ️ Dup: ${duplicados.length}\n🚫 Exc: ${excluidos.length}\n📋 Total: ${concorrentesDB.lista.length}`
                    }, { quoted: msg });
                    break;
                }

                case 'removeconcorrente':
                case 'delconcorrente': {
                    if (args.length < 1) return;
                    let numNorm = args[0].includes('@') ? args[0].split(':')[0].split('@')[0] : normalizarConcorrente(args[0]);
                    const idx = concorrentesDB.lista.indexOf(numNorm);
                    if (idx >= 0) {
                        concorrentesDB.lista.splice(idx, 1);
                        saveDB('concorrentes.json', concorrentesDB);
                        await sock.sendMessage(from, { text: `🗑️ \`${numNorm}\`\n📋 Total: *${concorrentesDB.lista.length}*` }, { quoted: msg });
                    } else await sock.sendMessage(from, { text: `⚠️ Não encontrado.` }, { quoted: msg });
                    break;
                }

                case 'listaconcorrentes': {
                    const lista = concorrentesDB.lista || [];
                    if (lista.length === 0) return sock.sendMessage(from, { text: `📭 Vazio.` }, { quoted: msg });
                    const txt = `🚨 *BASE GLOBAL*\n📋 Total: *${lista.length}*\n\n${lista.map((n, i) => `${i+1}. ${n}`).join('\n')}`;
                    await sock.sendMessage(from, { text: txt }, { quoted: msg });
                    break;
                }

                case 'verconcorrentes': {
                    if (!isGroup) return sock.sendMessage(from, { text: `⚠️ Só funciona em grupos.` });

                    const cc = config[from];
                    if (!cc.anticoncorrencia) {
                        return sock.sendMessage(from, { text: `⚠️ Ativa primeiro \`.anticoncorrente on\`` }, { quoted: msg });
                    }

                    const base = concorrentesDB.lista || [];
                    if (base.length === 0) return sock.sendMessage(from, { text: `📭 Base vazia.` }, { quoted: msg });

                    const meta = await getGroupMetadata(sock, from);
                    if (!meta) return;

                    const membrosComuns = [];
                    const adminsPresentes = [];

                    for (const p of meta.participants) {
                        const pIds = coletarIdsParticipante(p);
                        if (pIds.length === 0) continue;

                        let isExc = false;
                        for (const pid of pIds) if (ehExcecao(pid)) { isExc = true; break; }
                        if (isExc) continue;

                        let match = null;
                        for (const pid of pIds) {
                            const r = ehConcorrente(pid);
                            if (r) { match = r; break; }
                        }
                        if (!match) continue;

                        const info = {
                            idStr: extrairIdParticipante(p),
                            num: extrairNumeroParticipante(p),
                            match,
                            admin: p.admin === 'admin' || p.admin === 'superadmin'
                        };

                        if (info.admin) adminsPresentes.push(info);
                        else membrosComuns.push(info);
                    }

                    const botAdm = await botIsAdmin(sock, from);

                    let txt = `🚨 *VERIFICAÇÃO DE CONCORRENTES*\n\n📦 *${meta.subject}*\n📋 Base: ${base.length}\n`;

                    if (adminsPresentes.length === 0 && membrosComuns.length === 0) {
                        txt += `\n✅ *Nenhum concorrente no grupo.*`;
                        return sock.sendMessage(from, { text: txt }, { quoted: msg });
                    }

                    if (adminsPresentes.length > 0) {
                        txt += `\n⚠️ *CONCORRENTES ADMIN* (não removo)\n`;
                        txt += adminsPresentes.map(a => `👑 @${a.num}`).join('\n');
                        txt += `\n\n🚫 Estes são admins — rebaixa-os primeiro.\n`;
                    }

                    if (membrosComuns.length > 0) {
                        txt += `\n${adminsPresentes.length > 0 ? '━━━━━━━━━━━━━━━━━━━\n' : ''}`;
                        txt += `\n🚫 *CONCORRENTES (a remover)*\n`;
                        txt += membrosComuns.map(a => `👤 @${a.num}`).join('\n');
                        txt += `\n\n${botAdm ? '⚙️ Removendo...' : '⚠️ Não sou admin.'}`;
                    }

                    const todasMencoes = [
                        ...adminsPresentes.map(a => a.idStr),
                        ...membrosComuns.map(a => a.idStr)
                    ];

                    await sock.sendMessage(from, {
                        text: txt,
                        mentions: todasMencoes
                    }, { quoted: msg });

                    // Remove apenas membros comuns
                    if (botAdm && membrosComuns.length > 0) {
                        let removidos = 0;
                        for (const m of membrosComuns) {
                            try {
                                await sock.groupParticipantsUpdate(from, [m.idStr], 'remove');
                                removidos++;
                            } catch (e) { log('erro', `Falha remover: ${e.message}`); }
                        }

                        if (removidos > 0) {
                            let aviso = `🚨 *${removidos} concorrente(s) removido(s)* ✅\n\n❌ Aqui *não é casa de mãe Joana!*`;
                            if (adminsPresentes.length > 0) {
                                aviso += `\n\n⚠️ *${adminsPresentes.length} ADMIN* concorrente(s) não removido(s). Rebaixa-os primeiro.`;
                            }
                            try { await sock.sendMessage(from, { text: aviso }); } catch {}
                        }
                    } else if (adminsPresentes.length > 0 && membrosComuns.length === 0) {
                        try {
                            await sock.sendMessage(from, {
                                text: `⚠️ *ADMINS NECESSÁRIOS*\n\n🚫 Concorrentes detetados são *ADMINISTRADORES*.\n\n📌 Rebaixem-nos e usem \`.verconcorrentes\` novamente.`
                            });
                        } catch {}
                    }
                    break;
                }

                case 'aluguer': {
                    if (args.length < 2) return;
                    let duracaoStr, gid;
                    if (args[0].includes('@g.us')) { gid = args[0]; duracaoStr = args[1]; }
                    else { duracaoStr = args[0]; gid = args[1]; }
                    if (!gid.includes('@g.us')) return;

                    const dur = parseDuracao(duracaoStr);
                    if (!dur) return;

                    const agora = Date.now();
                    const base = (alugueres[gid] && alugueres[gid].expira > agora) ? alugueres[gid].expira : agora;
                    const novaExpira = base + dur.ms;
                    alugueres[gid] = { expira: novaExpira, criado: alugueres[gid]?.criado || agora, ultimaDuracao: dur.txt };
                    saveDB('alugueres.json', alugueres);

                    await sock.sendMessage(from, { text: `✅ Aluguer: ${dur.txt}\n📅 ${fmtDataHora(new Date(novaExpira))}` }, { quoted: msg });
                    try { await sock.sendMessage(gid, { text: MSG_ALUGUER_ATIVO(dur.txt, novaExpira) }); } catch {}
                    break;
                }

                case 'removeraluguer': {
                    if (args.length < 1) return;
                    if (!alugueres[args[0]]) return;
                    delete alugueres[args[0]];
                    saveDB('alugueres.json', alugueres);
                    await sock.sendMessage(from, { text: `🗑️ Removido.` }, { quoted: msg });
                    break;
                }

                case 'cancelaraluguer': {
                    if (args.length < 2) return;
                    let duracaoStr, gid;
                    if (args[0].includes('@g.us')) { gid = args[0]; duracaoStr = args[1]; }
                    else { duracaoStr = args[0]; gid = args[1]; }
                    if (!alugueres[gid]) return;
                    const dur = parseDuracao(duracaoStr);
                    if (!dur) return;
                    const novaExpira = alugueres[gid].expira - dur.ms;
                    if (novaExpira <= Date.now()) {
                        delete alugueres[gid];
                        saveDB('alugueres.json', alugueres);
                        await sock.sendMessage(from, { text: `🗑️ Cancelado.` }, { quoted: msg });
                    } else {
                        alugueres[gid].expira = novaExpira;
                        saveDB('alugueres.json', alugueres);
                        await sock.sendMessage(from, { text: `✅ Reduzido.` }, { quoted: msg });
                    }
                    break;
                }

                case 'del': {
                    if (!isGroup) return;
                    if (!quoted) return sock.sendMessage(from, { text: "⚠️ Responde à mensagem." });
                    try {
                        await sock.sendMessage(from, { delete: { remoteJid: from, fromMe: false, id: ctx.stanzaId, participant: quoted }});
                    } catch {}
                    break;
                }

                case 'ban': {
                    if (!isGroup) return;
                    let alvo = null, alvoNum = null;
                    if (mentioned[0]) { alvo = mentioned[0]; alvoNum = alvo.split('@')[0].split(':')[0]; }
                    else if (quoted) { alvo = quoted; alvoNum = alvo.split('@')[0].split(':')[0]; }
                    else if (args[0]) { alvoNum = args[0].replace(/\D/g, ''); alvo = alvoNum + '@s.whatsapp.net'; }
                    if (!alvo) return sock.sendMessage(from, { text: `⚠️ \`.ban @user\` / responder / número` });
                    if (ehExcecao(alvo)) return;

                    // Verifica se é admin
                    const ehAdminAlvo = await isAdmin(sock, from, alvo);
                    if (ehAdminAlvo) {
                        return sock.sendMessage(from, {
                            text: `⚠️ @${alvoNum} é *admin*.\n\n❌ Não posso remover admins.\n📌 Rebaixa-o primeiro.`,
                            mentions: [alvo]
                        });
                    }

                    try {
                        await sock.groupParticipantsUpdate(from, [alvo], 'remove');
                        await sock.sendMessage(from, {
                            text:
`╔══════════════════════════════╗
║   🚫   MEMBRO REMOVIDO   🚫   ║
╚══════════════════════════════╝

👤 @${alvoNum}
👮 Por: @${senderNum}

━━━━━━━━━━━━━━━━━━━━━━━━━

❌ Aqui *não é casa de mãe Joana!*

━━━━━━━━━━━━━━━━━━━━━━━━━
🤖 *${BOT_NAME}* | v7`,
                            mentions: [alvo, sender]
                        }, { quoted: msg });
                    } catch {}
                    break;
                }

                case 'grupo': {
                    if (!isGroup) return;
                    if (['a','abrir','open'].includes(args[0])) {
                        await sock.groupSettingUpdate(from, 'not_announcement');
                        await sock.sendMessage(from, { text: `🔓 Aberto` });
                    } else if (['f','fechar','close'].includes(args[0])) {
                        await sock.groupSettingUpdate(from, 'announcement');
                        await sock.sendMessage(from, { text: `🔒 Fechado` });
                    }
                    break;
                }

                case 'limpar': {
                    if (!isGroup) return;
                    const branco = '\n'.repeat(80) + '\u200b'.repeat(300) + '\n'.repeat(80);
                    await sock.sendMessage(from, { text: branco });
                    break;
                }

                case 'antilink':
                case 'antifoto':
                case 'antivideo':
                case 'antiaudio':
                case 'antistatus':
                case 'detector':
                case 'anticoncorrencia':
                case 'anticoncorrente': {
                    if (!isGroup) return;
                    const cmdKey = command === 'anticoncorrente' ? 'anticoncorrencia' : command;
                    if (!args[0]) {
                        const st = config[from][cmdKey] ? 'ATIVADO' : 'DESATIVADO';
                        return sock.sendMessage(from, { text: `ℹ️ *${cmdKey}*: ${st}` });
                    }
                    config[from][cmdKey] = args[0].toLowerCase() === 'on';
                    saveDB('config.json', config);
                    await sock.sendMessage(from, { text: `✅ *${cmdKey}*: ${config[from][cmdKey] ? 'ON' : 'OFF'}` });
                    break;
                }

                case 'status': {
                    if (!isGroup) return;
                    const cc = config[from];
                    await sock.sendMessage(from, {
                        text:
`📊 *Status*
🔗 Antilink: ${cc.antilink?'✅':'❌'}
📷 Antifoto: ${cc.antifoto?'✅':'❌'}
🎥 Antivideo: ${cc.antivideo?'✅':'❌'}
🎵 Antiaudio: ${cc.antiaudio?'✅':'❌'}
📢 Antistatus: ${cc.antistatus?'✅':'❌'}
🧾 Detector: ${cc.detector?'✅':'❌'}
🚫 Anticoncorrente: ${cc.anticoncorrencia?'✅':'❌'}
👋 Bem-vindo: ${cc.bemvindo?'✅':'❌'}
🧠 Nano: ${cc.nanoativar?'✅':'❌'}
🛒 Compras: ${cc.comprasAtivo?'✅':'❌'}
⚡ Compra auto: ${cc.compraauto?'✅':'❌'}`
                    });
                    break;
                }

                case 'addmpesa': {
                    if (!isGroup || !args[0]) return;
                    const num = args[0].replace(/\D/g, '');
                    if (!contas[from].mpesa.includes(num)) { contas[from].mpesa.push(num); saveDB('contas.json', contas); }
                    await sock.sendMessage(from, { text: `✅ M-Pesa: \`${num}\`` });
                    break;
                }
                case 'addmola': {
                    if (!isGroup || !args[0]) return;
                    const num = args[0].replace(/\D/g, '');
                    if (!contas[from].emola.includes(num)) { contas[from].emola.push(num); saveDB('contas.json', contas); }
                    await sock.sendMessage(from, { text: `✅ E-Mola: \`${num}\`` });
                    break;
                }
                case 'contas': {
                    if (!isGroup) return;
                    let txt = `📱 *Contas*\n\n💰 M-Pesa:\n`;
                    txt += contas[from].mpesa.length ? contas[from].mpesa.map((n,i)=>`${i+1}. ${n}`).join('\n') : 'Nenhuma';
                    txt += `\n\n💸 E-Mola:\n`;
                    txt += contas[from].emola.length ? contas[from].emola.map((n,i)=>`${i+1}. ${n}`).join('\n') : 'Nenhuma';
                    await sock.sendMessage(from, { text: txt });
                    break;
                }
                case 'delmpesa': {
                    if (!isGroup || !args[0]) return;
                    const i = parseInt(args[0]) - 1;
                    if (contas[from].mpesa[i]) {
                        const r = contas[from].mpesa.splice(i, 1);
                        saveDB('contas.json', contas);
                        await sock.sendMessage(from, { text: `🗑️ ${r[0]}` });
                    }
                    break;
                }
                case 'delmola': {
                    if (!isGroup || !args[0]) return;
                    const i = parseInt(args[0]) - 1;
                    if (contas[from].emola[i]) {
                        const r = contas[from].emola.splice(i, 1);
                        saveDB('contas.json', contas);
                        await sock.sendMessage(from, { text: `🗑️ ${r[0]}` });
                    }
                    break;
                }

                case 'bot': {
                    if (isGroup) {
                        const meta = await getGroupMetadata(sock, from);
                        if (!meta) return;
                        const criacao = meta.creation ? new Date(meta.creation * 1000) : null;
                        const idadeDias = criacao ? Math.floor((Date.now() - criacao.getTime()) / 86400000) : 0;
                        const idadeAnos = Math.floor(idadeDias / 365);
                        const restanteDias = idadeDias % 365;
                        const admins = meta.participants.filter(p => p.admin).length;
                        const uptime = fmtUptime(Date.now() - BOT_START);
                        const alug = alugueres[from];
                        const temAlug = alug && alug.expira > Date.now();
                        const alugTxt = temAlug ? `✅ ATIVO | ⏳ ${tempoRestante(alug.expira)}` : `❌ INATIVO`;

                        await sock.sendMessage(from, {
                            text:
`🤖 *${BOT_NAME}*
━━━━━━━━━━━━━━━━━━
👥 ${meta.subject}
🆔 \`${from}\`
👤 ${meta.participants.length} membros
👑 ${admins} admins
📅 ${criacao ? fmtDataHora(criacao).split(' ')[0] : 'N/D'} (${idadeAnos}a ${restanteDias}d)
━━━━━━━━━━━━━━━━━━
💼 Aluguer: ${alugTxt}
⚡ Compra auto: ${config[from]?.compraauto ? '✅' : '❌'}
━━━━━━━━━━━━━━━━━━
🕐 Uptime: ${uptime}
👑 Dono: ${OWNER_NUMBER}`
                        }, { quoted: msg });
                    } else {
                        const uptime = fmtUptime(Date.now() - BOT_START);
                        await sock.sendMessage(from, { text: `🤖 *${BOT_NAME}*\n🕐 ${uptime}\n👑 ${OWNER_NUMBER}` }, { quoted: msg });
                    }
                    break;
                }

                case 'promover': {
                    if (!isGroup || !mentioned[0]) return;
                    await sock.groupParticipantsUpdate(from, [mentioned[0]], "promote");
                    await sock.sendMessage(from, { text: `👑 @${mentioned[0].split('@')[0]} promovido!`, mentions: [mentioned[0]] });
                    break;
                }
                case 'demote': {
                    if (!isGroup || !mentioned[0]) return;
                    await sock.groupParticipantsUpdate(from, [mentioned[0]], "demote");
                    await sock.sendMessage(from, { text: `📉 @${mentioned[0].split('@')[0]} rebaixado.`, mentions: [mentioned[0]] });
                    break;
                }
                case 'pp': {
                    const adm = isGroup ? await isAdmin(sock, from, sender) : false;
                    await sock.sendMessage(from, { text: `👑 ${adm ? 'Admin' : 'Membro'}` });
                    break;
                }
                case 'p': {
                    await sock.sendMessage(from, { text: `👤 Membro.` });
                    break;
                }

                case 'alarmea': {
                    if (!isGroup || !args[0] || !/^\d{1,2}:\d{2}$/.test(args[0])) return;
                    alarmes[from].abrir = args[0];
                    saveDB('alarmes.json', alarmes);
                    await sock.sendMessage(from, { text: `⏰ Abre ${args[0]}` });
                    break;
                }
                case 'alarmef': {
                    if (!isGroup || !args[0] || !/^\d{1,2}:\d{2}$/.test(args[0])) return;
                    alarmes[from].fechar = args[0];
                    saveDB('alarmes.json', alarmes);
                    await sock.sendMessage(from, { text: `⏰ Fecha ${args[0]}` });
                    break;
                }

                case 'bsvindo': {
                    if (!isGroup) return;
                    const m = args.join(' ');
                    if (!m) return;
                    config[from].bsvindoMsg = m;
                    saveDB('config.json', config);
                    await sock.sendMessage(from, { text: "✅ Salvo!" });
                    break;
                }
                case 'bemvindo': {
                    if (!isGroup) return;
                    if (!args[0]) return sock.sendMessage(from, { text: `ℹ️ ${config[from].bemvindo ? 'ON' : 'OFF'}` });
                    config[from].bemvindo = args[0].toLowerCase() === 'on';
                    saveDB('config.json', config);
                    await sock.sendMessage(from, { text: `✅ ${config[from].bemvindo ? 'ON' : 'OFF'}` });
                    break;
                }

                case 'nanoativar': {
                    if (!isGroup) return;
                    if (!args[0]) return sock.sendMessage(from, { text: `ℹ️ ${config[from].nanoativar ? 'ON' : 'OFF'}` });
                    config[from].nanoativar = args[0].toLowerCase() === 'on';
                    saveDB('config.json', config);
                    await sock.sendMessage(from, { text: `✅ Nano ${config[from].nanoativar ? 'ON' : 'OFF'}` });
                    break;
                }
                case 'nanoadd': {
                    if (!isGroup) return;
                    const rawText = msg.message.extendedTextMessage?.text || msg.message.conversation || '';
                    const semComando = rawText.slice(PREFIX.length + 'nanoadd'.length).trim();
                    const idx = semComando.indexOf(',');
                    if (idx === -1) return;
                    let gat = semComando.slice(0, idx).trim().toLowerCase();
                    const resp = semComando.slice(idx + 1).trim();
                    if (gat.startsWith(PREFIX)) gat = gat.slice(PREFIX.length).trim();
                    if (!gat || !resp) return;
                    nanos[from][gat] = resp;
                    saveDB('nanos.json', nanos);
                    await sock.sendMessage(from, { text: `✅ "${gat}"` });
                    break;
                }
                case 'nanodel': {
                    if (!isGroup) return;
                    let g = args.join(' ').trim().toLowerCase();
                    if (g.startsWith(PREFIX)) g = g.slice(PREFIX.length).trim();
                    if (nanos[from][g]) {
                        delete nanos[from][g];
                        saveDB('nanos.json', nanos);
                        await sock.sendMessage(from, { text: `🗑️ "${g}"` });
                    }
                    break;
                }
                case 'listanano': {
                    if (!isGroup) return;
                    const lista = Object.entries(nanos[from] || {});
                    if (lista.length === 0) return sock.sendMessage(from, { text: "📋 Vazio." });
                    const txt = `📋 *Nanos*\n${lista.map(([g,r],i)=>`${i+1}. ${g} → ${r}`).join('\n')}`;
                    await sock.sendMessage(from, { text: txt });
                    break;
                }
                case 'limparnanos': {
                    if (!isGroup) return;
                    nanos[from] = {};
                    saveDB('nanos.json', nanos);
                    await sock.sendMessage(from, { text: "🧹 Limpos." });
                    break;
                }

                case 'compras': {
                    if (!isGroup) return;
                    if (!args[0]) return sock.sendMessage(from, { text: `ℹ️ ${config[from].comprasAtivo ? 'ON' : 'OFF'}` });
                    config[from].comprasAtivo = args[0].toLowerCase() === 'on';
                    saveDB('config.json', config);
                    await sock.sendMessage(from, { text: `✅ ${config[from].comprasAtivo ? 'ON' : 'OFF'}` });
                    break;
                }

                case 'compra': {
                    if (!isGroup || !quoted) return sock.sendMessage(from, { text: "⚠️ Responde à mensagem." });
                    const item = args.join(' ') || 'Indefinido';
                    const tamanhoMB = pacoteParaMB(item);
                    await registrarCompra(sock, from, quoted, item, tamanhoMB, { auto: false, msgRef: msg });
                    break;
                }

                case 'clientes':
                case 'cliente': {
                    if (!isGroup) return;
                    const ranking = Object.entries(compras[from] || {}).sort((a,b) => b[1].total - a[1].total);
                    if (ranking.length === 0) return sock.sendMessage(from, { text: "📭 Vazio." });
                    const medalhas = ['🥇','🥈','🥉'];
                    let txt = `🏆 *TOP CLIENTES*\n\n`;
                    const mencoes = [];
                    ranking.slice(0, 10).forEach(([id, dados], i) => {
                        const pos = medalhas[i] || `${i+1}º`;
                        txt += `${pos} @${id.split('@')[0]} — ${formatData(dados.total)}\n`;
                        mencoes.push(id);
                    });
                    await sock.sendMessage(from, { text: txt, mentions: mencoes });
                    break;
                }

                case 'rentanas': {
                    if (!isGroup) return;
                    const meta = await getGroupMetadata(sock, from);
                    if (!meta) return;
                    const sem = meta.participants.filter(p => !compras[from]?.[p.id] || (compras[from][p.id].compras || []).length === 0).map(p => p.id);
                    if (sem.length === 0) return sock.sendMessage(from, { text: "✅ Todos compraram!" });
                    const txt = `👻 *Sem compras (${sem.length})*\n${sem.map(id => `• @${id.split('@')[0]}`).join('\n')}`;
                    await sock.sendMessage(from, { text: txt, mentions: sem });
                    break;
                }

                case 'resetcompras': {
                    if (!isGroup) return;
                    compras[from] = {};
                    saveDB('compras.json', compras);
                    await sock.sendMessage(from, { text: "🗑️ Resetado." });
                    break;
                }

                case 'todos': {
                    if (!isGroup) return;
                    const meta = await getGroupMetadata(sock, from);
                    if (!meta) return;
                    const mencoes = meta.participants.map(p => p.id);
                    const msgTodos = args.join(' ') || "Olá a todos!";
                    await sock.sendMessage(from, { text: msgTodos, mentions: mencoes });
                    break;
                }

                case 'fantasmas': {
                    if (!isGroup) return;
                    const limite = parseInt(args[0]) || 10;
                    const meta = await getGroupMetadata(sock, from);
                    if (!meta) return;
                    const membros = meta.participants.map(p => p.id);
                    const paraRemover = membros.slice(-limite);
                    await sock.groupParticipantsUpdate(from, paraRemover, "remove");
                    await sock.sendMessage(from, { text: `👻 ${paraRemover.length} removidos.\n\n❌ Aqui *não é casa de mãe Joana!*` });
                    break;
                }

                default:
                    break;
            }
        } catch (error) {
            log('erro', `Comando ${command}: ${error.message}`);
            await sock.sendMessage(from, { text: `❌ Erro: ${error.message}` });
        }
    });

    // ================= ALARMES =================
    setInterval(async () => {
        try {
            const agora = new Date();
            const hora = `${String(agora.getHours()).padStart(2,'0')}:${String(agora.getMinutes()).padStart(2,'0')}`;
            for (const [gid, cfg] of Object.entries(alarmes)) {
                if (cfg.abrir === hora) {
                    try { await sock.groupSettingUpdate(gid, 'not_announcement'); await sock.sendMessage(gid, { text: "🔓 Aberto" }); } catch {}
                }
                if (cfg.fechar === hora) {
                    try { await sock.groupSettingUpdate(gid, 'announcement'); await sock.sendMessage(gid, { text: "🔒 Fechado" }); } catch {}
                }
            }

            const agoraMs = Date.now();
            for (const [gid, alug] of Object.entries(alugueres)) {
                if (alug.expira <= agoraMs) {
                    delete alugueres[gid];
                    saveDB('alugueres.json', alugueres);
                    log('rent', `Aluguer expirou: ${gid}`);
                    try { await sock.sendMessage(gid, { text: MSG_ALUGUER_EXPIRADO }); } catch {}
                }
            }
        } catch {}
    }, 30000);
}

startBot();
