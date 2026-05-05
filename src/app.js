
console.log("INDEX FINANCIERO v2026-05-05-40 cargado: estructura modular base con modulo Pedidos clinicos");
// ============================================================
// GOOGLE SHEETS CSV URLs
// Cabeceras confirmadas:
// GastosGenerales: fila 2 = Empresa,Fecha,Fuente de gasto,Factura,Concepto,Proveedor,Estado,Forma de pago,Aditio,Importe,...,Fecha de pago
// Cajas (Enero26 etc): fila 4 = Fecha,Efectivo,Tarjeta Caixa,Tarjeta Kutxa,Tarjeta Sabadell,Tarjeta Cajamar,Transferencia,Financiación,Gasto,Total,Facturado,Obj diario,15% Caja,...
// Financiaciones: fila 1 = FF,FECHA,N.PETICION,CANAL,FINANCIADO,BANCO,COMISION,DESCUENTO,% DESCUENTO,MESES,NOMBRE,NIF,ESTADO
// ============================================================
const BASE = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSBbKDnkWMySnc2VE1G0zGZD47g4ErXqseJzhf497DLsEEBtoQlq1Z08HZiY1KZFw/pub';
const INGRESOS_EXTERNOS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSBbKDnkWMySnc2VE1G0zGZD47g4ErXqseJzhf497DLsEEBtoQlq1Z08HZiY1KZFw/pub?gid=1441132040&single=true&output=csv';
const GID = {
  Enero26:   '1721822184',
  Febrero26: '752470346',
  Marzo26:   '2104790247',
  Abril26:   '124434076',
  Gastos:    '794197618',
  Fins:      '1690767513',
};
const csvUrl = gid => `${BASE}?gid=${gid}&single=true&output=csv`;
const pubHtmlUrl = () => BASE.replace(/\/pub$/, '/pubhtml');
const MONTH_NAMES = [
  ['enero','ene'], ['febrero','feb'], ['marzo','mar'], ['abril','abr'], ['mayo','may'], ['junio','jun'],
  ['julio','jul'], ['agosto','ago'], ['septiembre','set','sep'], ['octubre','oct'], ['noviembre','nov'], ['diciembre','dic']
];
const FALLBACK_CAJA_SHEETS = [
  { name: 'Enero26', gid: GID.Enero26, year: 2026, month: 1 },
  { name: 'Febrero26', gid: GID.Febrero26, year: 2026, month: 2 },
  { name: 'Marzo26', gid: GID.Marzo26, year: 2026, month: 3 },
  { name: 'Abril26', gid: GID.Abril26, year: 2026, month: 4 },
].filter(s => s.gid);
function normTxt(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function sheetNameToCajaMeta(name, gid) {
  const n = normTxt(name).replace(/[_-]+/g, ' ');
  let month = 0;
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    if (MONTH_NAMES[i].some(m => n.includes(m))) { month = i + 1; break; }
  }
  if (!month) return null;
  const hasCajaWord = /\bcaja(s)?\b/.test(n) || /\bcobro(s)?\b/.test(n);
  const looksLikeMonthSheet = /(^|\s)(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)\s*\d{2,4}($|\s)/.test(n);
  const hasYear = /(20\d{2}|\b\d{2}\b)/.test(n);
  // Acepta hojas tipo "Enero26" y también "Caja Enero 2026" / "Cajas Mayo26".
  if (!hasCajaWord && !looksLikeMonthSheet) return null;
  if (!hasYear && !hasCajaWord) return null;
  const y4 = n.match(/20\d{2}/);
  const y2 = n.match(/(?:^|\D)(\d{2})(?:\D|$)/);
  const year = y4 ? Number(y4[0]) : (y2 ? 2000 + Number(y2[1]) : 2026);
  return { name: String(name || '').trim(), gid: String(gid), year, month };
}
async function discoverCajaSheets() {
  // v28: siempre mezcla las hojas fijas conocidas con las detectadas automáticamente.
  // Motivo: Google pubhtml a veces no lista una pestaña visible/antigua (por ejemplo Enero26),
  // y si devolvemos solo las detectadas se dejan de sincronizar ingresos de ese mes.
  try {
    const html = await fetchText(pubHtmlUrl());
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const found = [];
    doc.querySelectorAll('a[href*="gid="]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/[?&]gid=(\d+)/);
      if (!m) return;
      const meta = sheetNameToCajaMeta(a.textContent || '', m[1]);
      if (meta) found.push(meta);
    });
    const re = /gid=(\d+)[^>]*>([^<]{2,80})<\//g;
    let m;
    while ((m = re.exec(html))) {
      const meta = sheetNameToCajaMeta(m[2], m[1]);
      if (meta) found.push(meta);
    }
    const byMonth = new Map();
    // Primero las conocidas, para garantizar Enero26-Febrero26-Marzo26-Abril26 aunque pubhtml no las devuelva.
    FALLBACK_CAJA_SHEETS.forEach(x => byMonth.set(`${x.year}|${x.month}`, x));
    // Después las detectadas, para añadir meses nuevos como Mayo26, Junio26, etc.
    found.forEach(x => {
      const key = `${x.year}|${x.month}`;
      if (!byMonth.has(key)) byMonth.set(key, x);
    });
    const arr = Array.from(byMonth.values()).sort((a,b) => (a.year - b.year) || (a.month - b.month));
    if (found.length && arr.length !== found.length) {
      console.info('[Caja sheets] Hojas fijas + detectadas:', arr.map(s => `${s.name}(${s.gid})`).join(', '));
    }
    return arr.length ? arr : FALLBACK_CAJA_SHEETS;
  } catch (err) {
    console.warn('[Caja sheets] No se pudieron detectar automáticamente las pestañas. Uso fallback manual.', err);
    return FALLBACK_CAJA_SHEETS;
  }
}

// ============================================================
// CSV PARSER — handles quoted fields with commas
// ============================================================
function parseCSVLines(text) {
  // Split into lines respecting quoted newlines
  const lines = [];
  let cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQ = !inQ; cur += ch; }
    else if (ch === '\n' && !inQ) { lines.push(cur); cur = ''; }
    else { cur += ch; }
  }
  if (cur) lines.push(cur);
  return lines;
}

function parseCSVRow(line) {
  const vals = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) {
      vals.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  vals.push(cur.trim());
  return vals;
}

// Parse CSV where headers are on a specific row (0-indexed)
function parseCSVFromRow(text, headerRow = 0) {
  const lines = parseCSVLines(text).filter(l => l.trim() !== '');
  if (lines.length <= headerRow) return [];
  const headers = parseCSVRow(lines[headerRow]);
  const result = [];
  for (let i = headerRow + 1; i < lines.length; i++) {
    const vals = parseCSVRow(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] || ''; });
    // Skip empty rows
    if (Object.values(obj).every(v => !v)) continue;
    result.push(obj);
  }
  return result;
}

function firstField(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null && String(row[name]).trim() !== '') return row[name];
  }
  const normalized = Object.fromEntries(Object.keys(row || {}).map(k => [normTxt(k), row[k]]));
  for (const name of names) {
    const key = normTxt(name);
    if (normalized[key] !== undefined && normalized[key] !== null && String(normalized[key]).trim() !== '') return normalized[key];
  }
  return '';
}

async function fetchText(url) {
  const proxyUrl = 'https://rdepiltywmdwiegbtyxr.supabase.co/functions/v1/dynamic-responder?url=' + encodeURIComponent(url);
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error('HTTP ' + res.status + ' al descargar datos');
  return res.text();
}

// ============================================================
// PARSERS POR SECCIÓN
// ============================================================

// GASTOS — cabecera en fila 2 (índice 1), fila 1 es título
async function fetchGastos() {
  const text = await fetchText(csvUrl(GID.Gastos));
  const rows = parseCSVFromRow(text, 1); // headers en fila 2 (índice 1)
  return rows
    .filter(r => r['Empresa'] && r['Fecha'] && r['Importe'])
    .map(r => {
      const fechaPago = fixDate(firstField(r, ['Fecha de pago','Fecha Pago','Fecha pago','Pago estimado','Fecha estimada de pago','Fecha estimada pago'])) || null;
      const g = {
        empresa: r['Empresa'],
        fecha: fixDate(r['Fecha']),
        fecha_pago: fechaPago,
        fuente_gasto: r['Fuente de gasto'] || '',
        factura: r['Factura'] || '',
        concepto: r['Concepto'] || '',
        proveedor: r['Proveedor'] || '',
        estado: r['Estado'] || '',
        forma_pago: r['Forma de pago'] || '',
        aditio: r['Aditio'] || '',
        importe: parseNum(r['Importe']),
        observaciones: r['Observaciones'] || '',
      };
      // Si Supabase todavía no tiene la columna fecha_pago, al menos queda asociada localmente tras sincronizar.
      if (fechaPago) localStorage.setItem('gasto_pago_est_' + gastoKey(g), fechaPago);
      return g;
    });
}


async function fetchIngresosExternos() {
  try {
    const text = await fetchText(INGRESOS_EXTERNOS_URL);
    const rows = parseCSVFromRow(text, 1); // cabecera en fila 2
    return rows
      .filter(r => r['Empresa'] && r['Fecha'] && r['Importe'])
      .map(r => ({
        empresa: (r['Empresa'] || '').trim(),
        fecha: fixDate(r['Fecha']),
        factura: r['Factura'] || '',
        concepto: r['Concepto'] || '',
        proveedor: r['Proveedor'] || '',
        estado: r['Estado'] || '',
        forma_pago: r['Forma de pago'] || '',
        subida: r['Subida'] || '',
        importe: parseNum(r['Importe']),
        iva: parseNum(r['IVA']),
        irpf: parseNum(r['IRPF']),
        observaciones: r['Observaciones'] || '',
        seguros_s: r['Seguros S.'] || '',
        fuente: 'Facturas Bridge/Vallecas'
      }))
      .filter(r => r.fecha && Math.abs(Number(r.importe)||0) > 0.0001);
  } catch (e) {
    console.warn('[Ingresos externos] No se pudieron cargar Bridge/Vallecas:', e.message || e);
    return [];
  }
}

// CAJAS — cabecera en fila 4 (índice 3)
async function fetchCajas(gid, anio, mes) {
  const text = await fetchText(csvUrl(gid));
  const lines = parseCSVLines(text).filter(l => l.trim() !== '');
  if (lines.length < 5) return [];
  
  const headers = parseCSVRow(lines[3]); // fila 4 = índice 3
  const hIdx = name => headers.findIndex(h => h && h.toLowerCase().includes(name.toLowerCase()));
  const iEf = hIdx('fectivo');
  const iCaixa = hIdx('aixa');
  const iKutxa = hIdx('utxa');
  const iSab = hIdx('abadell');
  const iCaj = hIdx('ajamar');
  const iBBVA = hIdx('bva');
  const iTr = hIdx('ransferencia');
  const iFin = hIdx('inanci');
  const iGas = hIdx('asto');
  const iTot = hIdx('otal');
  const iFact = hIdx('acturado');
  const iObj = hIdx('bj');
  const maxDay = new Date(anio, mes, 0).getDate();

  const records = [];
  for (let i = 4; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    const dia = parseInt(row[0], 10);
    if (!dia || Number.isNaN(dia) || dia < 1 || dia > maxDay) continue;
    
    const get = idx => idx >= 0 ? (parseNum(row[idx]) || 0) : 0;
    const efectivo = get(iEf);
    const tarjeta_caixa = get(iCaixa);
    const tarjeta_kutxa = get(iKutxa);
    const tarjeta_sabadell = get(iSab);
    const tarjeta_cajamar = get(iCaj);
    const tarjeta_bbva = get(iBBVA);
    const transferencia = get(iTr);
    const financiacion = get(iFin);
    const gasto = get(iGas);
    const totalHoja = get(iTot);
    const totalCalculado = efectivo + tarjeta_caixa + tarjeta_kutxa + tarjeta_sabadell + tarjeta_cajamar + tarjeta_bbva + transferencia + financiacion;
    const facturado = (row[iFact] || '').toString().trim().toUpperCase() === 'SI';
    const obj_diario = iObj >= 0 ? (parseNum(row[iObj]) || null) : null;
    const total = totalHoja || totalCalculado;

    // No guardamos días sin movimiento real de caja.
    // Aunque la hoja tenga filas de calendario o días marcados, si todos los importes son 0 no debe entrar en tesorería.
    const tieneMovimiento = [efectivo, tarjeta_caixa, tarjeta_kutxa, tarjeta_sabadell, tarjeta_cajamar, tarjeta_bbva, transferencia, financiacion, gasto, total].some(v => Math.abs(v || 0) > 0.0001);
    if (!tieneMovimiento) continue;
    
    records.push({
      fecha: `${anio}-${String(mes).padStart(2,'0')}-${String(dia).padStart(2,'0')}`,
      empresa: 'Corporacion',
      efectivo,
      tarjeta_caixa,
      tarjeta_kutxa,
      tarjeta_sabadell,
      tarjeta_cajamar,
      tarjeta_bbva,
      transferencia,
      financiacion,
      gasto,
      total,
      facturado,
      obj_diario,
    });
  }
  return records;
}

// TESORERÍA — cuadro de cuentas B40:N42 de cada pestaña mensual
async function fetchTesoreriaCuentas(gid, anio, mes) {
  const text = await fetchText(csvUrl(gid));
  const lines = parseCSVLines(text);
  const header = parseCSVRow(lines[39] || ''); // fila 40
  const values = parseCSVRow(lines[40] || ''); // fila 41
  const transfer = parseCSVRow(lines[41] || ''); // fila 42
  const norm = v => String(v || '').trim().toUpperCase();
  const findVal = (needle, opts = {}) => {
    const matches = [];
    for (let i = 1; i <= 13; i++) {
      const h = norm(header[i]);
      if (!h) continue;
      if (h.includes(needle)) matches.push({ i, h, v: parseNum(values[i]) });
    }
    if (!matches.length) return 0;
    if (opts.last) return matches[matches.length - 1].v || 0;
    if (opts.notLinea) {
      const m = matches.find(x => !x.h.includes('LINEA'));
      return m ? (m.v || 0) : 0;
    }
    return matches[0].v || 0;
  };
  const findBlockVal = (needle) => {
    const all = lines.map(l => parseCSVRow(l || ''));
    for (let r = 0; r < all.length; r++) {
      const row = all[r] || [];
      for (let c = 0; c < row.length; c++) {
        if (!norm(row[c]).includes(needle)) continue;
        // Prefer the numeric value directly underneath the header, as in the BBVA LINEA block.
        for (let rr = r + 1; rr <= Math.min(r + 5, all.length - 1); rr++) {
          const sameCol = parseNum((all[rr] || [])[c]);
          if (Number.isFinite(sameCol) && String((all[rr] || [])[c] || '').trim() !== '') return sameCol || 0;
          const nextCol = parseNum((all[rr] || [])[c + 1]);
          if (Number.isFinite(nextCol) && String((all[rr] || [])[c + 1] || '').trim() !== '') return nextCol || 0;
        }
      }
    }
    return 0;
  };
  let traspaso = 0;
  for (let i = 1; i <= 13; i++) {
    if (norm(transfer[i]).includes('TRASPASO')) {
      traspaso = parseNum(transfer[i + 1]);
      break;
    }
  }
  const yyyyMm = `${anio}-${String(mes).padStart(2,'0')}`;
  const lastDay = new Date(anio, mes, 0).getDate();
  const totalCaja = findVal('TTL');
  const totalTesoreria = findVal('TTL', { last: true }) || totalCaja;
  const row = {
    mes: yyyyMm,
    fecha: `${yyyyMm}-${String(lastDay).padStart(2,'0')}`,
    empresa: 'Corporacion',
    efectivo: findVal('EFECTIVO'),
    ff_aprobada: findVal('FF'),
    caixa: findVal('CAIXA'),
    sabadell: findVal('SABADELL', { notLinea: true }),
    kutxa: findVal('KUTXA'),
    cajamar: findVal('CAJAMAR'),
    bbva: findVal('BBVA'),
    bbva_linea: findBlockVal('BBVA LINEA'),
    transferencia: findVal('TRANSFERENCIA'),
    total_caja: totalCaja,
    sabadell_linea: findVal('SABADELL LINEA'),
    total_tesoreria: totalTesoreria,
    traspaso
  };
  return Math.abs(row.total_tesoreria || row.total_caja || row.efectivo || row.ff_aprobada) > 0.0001 ? [row] : [];
}

// FINANCIACIONES — cabecera en fila 1 (índice 0)
async function fetchFins() {
  const text = await fetchText(csvUrl(GID.Fins));
  const rows = parseCSVFromRow(text, 0); // headers en fila 1 (índice 0)
  return rows
    .filter(r => r['FF'] && r['FECHA'] && fixDate(r['FECHA']))
    .map(r => ({
      ff: r['FF'],
      fecha: fixDate(r['FECHA']),
      n_peticion: r['N.PETICION'] || '',
      canal: r['CANAL'] || '',
      financiado: parseNum(r['FINANCIADO']),
      banco: parseNum(r['BANCO']),
      comision: parseNum(r['COMISION']),
      descuento: parseNum(r['DESCUENTO']),
      pct_descuento: parseNum(r['% DESCUENTO']),
      meses: parseInt(r['MESES']) || null,
      nombre: r['NOMBRE'] || '',
      nif: r['NIF'] || '',
      estado: r['ESTADO'] || '',
    }));
}

// Convierte fecha DD/MM/YYYY o DD-MM-YYYY a YYYY-MM-DD
function fixDate(v) {
  if (!v) return null;
  const s = String(v).trim().replace(/\s/g,'');
  if (!s) return null;
  // DD/MM/YYYY o DD-MM-YYYY
  const m1 = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
  // YYYY-MM-DD ya correcto
  if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.slice(0,10);
  // Formato roto tipo "10/0472026" — intentar extraer números
  const nums = s.replace(/[\/\-]/g,'');
  if (nums.length === 8) {
    // DDMMYYYY
    return `${nums.slice(4,8)}-${nums.slice(2,4)}-${nums.slice(0,2)}`;
  }
  return null; // fecha inválida, descartar
}
function parseNum(v) {
  if (!v || v === '') return 0;
  const s = String(v).trim().replace(/€/g,'').replace(/\s/g,'');
  // Formato español: puntos como miles, coma como decimal
  if (s.includes(',')) {
    return parseFloat(s.replace(/\./g,'').replace(',','.')) || 0;
  }
  return parseFloat(s) || 0;
}

// ============================================================
// SUPABASE
// ============================================================
let sb = null;
let currentUser = null;
let currentProfile = null;
const INITIAL_ADMIN_EMAILS = ['jcarchenilla@cliniapuente.es','jmuniz@clinicapuente.es','apoveda@clinicapuente.es'];
const ROLE_LABELS = { admin:'Admin', finanzas:'Finanzas', validador:'Validador', lectura:'Lectura' };
function initSB() {
  const url = localStorage.getItem('cd_url');
  const key = localStorage.getItem('cd_key');
  if (url && key) {
    sb = supabase.createClient(url, key);
    set('connSt', '● Conectado');
    document.getElementById('connSt').style.color = '#1A9E72';
    return true;
  }
  set('connSt', '● Configuración pendiente');
  return false;
}
function openCfg() {
  document.getElementById('cUrl').value = localStorage.getItem('cd_url') || '';
  document.getElementById('cAnon').value = localStorage.getItem('cd_key') || '';
  document.getElementById('cfgM').classList.add('open');
}
function closeCfg() { document.getElementById('cfgM').classList.remove('open'); }
async function saveCfg() {
  const u = document.getElementById('cUrl').value.trim();
  const k = document.getElementById('cAnon').value.trim();
  if (!u || !k) { alert('Rellena ambos campos'); return; }
  localStorage.setItem('cd_url', u);
  localStorage.setItem('cd_key', k);
  closeCfg(); initSB(); await bootAuth();
}
function hasRole(...roles) { return !!currentProfile && roles.includes(currentProfile.role); }
function requireRole(...roles) { if (!hasRole(...roles)) { alert('No tienes permisos para esta acción.'); return false; } return true; }
function authHeaderToken() { return sb?.auth?.getSession ? null : null; }
async function bootAuth() {
  if (!sb) { document.getElementById('authGate').classList.add('open'); setTimeout(openCfg, 400); return; }
  const { data } = await sb.auth.getSession();
  if (!data.session) { document.getElementById('authGate').classList.add('open'); return; }
  currentUser = data.session.user;
  await loadCurrentProfile();
  document.getElementById('authGate').classList.remove('open');
  updateUserUI();
  if (currentProfile?.must_change_password) document.getElementById('pwdM').classList.add('open');
  await loadDB();
}
async function login() {
  if (!sb) { openCfg(); return; }
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPass').value;
  const err = document.getElementById('loginErr'); err.style.display='none'; err.textContent='';
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { err.textContent = error.message || 'No se pudo iniciar sesión'; err.style.display='block'; return; }
  currentUser = data.user;
  await bootAuth();
}
async function logout() { if (sb) await sb.auth.signOut(); currentUser=null; currentProfile=null; location.reload(); }
async function loadCurrentProfile() {
  if (!currentUser) return;
  const { data, error } = await sb.from('user_profiles').select('*').eq('id', currentUser.id).maybeSingle();
  if (error) console.warn('No se pudo cargar user_profiles:', error.message);
  currentProfile = data || { id: currentUser.id, email: currentUser.email, role: INITIAL_ADMIN_EMAILS.includes((currentUser.email||'').toLowerCase()) ? 'admin' : 'lectura', full_name: currentUser.email };
}
function updateUserUI() {
  set('userEmail', currentUser?.email || '—');
  set('userRole', ROLE_LABELS[currentProfile?.role] || currentProfile?.role || '—');
  set('cfg-user', currentProfile?.full_name || currentUser?.email || '—');
  set('cfg-email', currentUser?.email || '—');
  set('cfg-role', ROLE_LABELS[currentProfile?.role] || currentProfile?.role || '—');
  const adminBox = document.getElementById('admin-only-box');
  if (adminBox) adminBox.style.display = hasRole('admin') ? 'block' : 'none';
}
async function changeTemporaryPassword() {
  const p1 = document.getElementById('newPass1').value;
  const p2 = document.getElementById('newPass2').value;
  if (!p1 || p1.length < 8) return alert('La contraseña debe tener al menos 8 caracteres.');
  if (p1 !== p2) return alert('Las contraseñas no coinciden.');
  const { error } = await sb.auth.updateUser({ password: p1 });
  if (error) return alert(error.message);
  await sb.from('user_profiles').update({ must_change_password:false, updated_at:new Date().toISOString() }).eq('id', currentUser.id);
  currentProfile.must_change_password = false;
  document.getElementById('pwdM').classList.remove('open');
  alert('Contraseña actualizada.');
}
async function adminUsersCall(payload) {
  const { data: sess } = await sb.auth.getSession();
  const endpoint = (localStorage.getItem('cd_url') || '').replace(/\/$/, '') + '/functions/v1/admin-users';
  const res = await fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json', 'Authorization':'Bearer ' + sess.session.access_token }, body: JSON.stringify(payload) });
  const data = await res.json().catch(()=>({}));
  if (!res.ok || data.error) throw new Error(data.error || data.message || 'Error admin-users');
  return data;
}
async function loadUsersAdmin() {
  const tbody = document.getElementById('tb-users'); if (!tbody || !sb) return;
  const { data, error } = await sb.from('user_profiles').select('email,full_name,role,is_active,must_change_password,updated_at').order('email');
  if (error) { tbody.innerHTML = `<tr><td colspan="5" style="color:var(--red)">${error.message}</td></tr>`; return; }
  tbody.innerHTML = (data||[]).map(u => `<tr><td>${u.email}</td><td>${u.full_name||'—'}</td><td><span class="role-pill">${ROLE_LABELS[u.role]||u.role}</span></td><td>${u.is_active?'<span class="pill pg">Activo</span>':'<span class="pill pr">Inactivo</span>'} ${u.must_change_password?'<span class="pill pa">Temporal</span>':''}</td><td>${u.updated_at?new Date(u.updated_at).toLocaleString('es-ES'):'—'}</td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--text3)">Sin usuarios.</td></tr>';
}
async function createUserAdmin() {
  if (!requireRole('admin')) return;
  const email = document.getElementById('newUserEmail').value.trim();
  const full_name = document.getElementById('newUserName').value.trim();
  const role = document.getElementById('newUserRole').value;
  const password = document.getElementById('newUserPass').value || 'JuanJeTQ@';
  if (!email) return alert('Indica un email.');
  try {
    await adminUsersCall({ action:'create_user', email, full_name, role, password, must_change_password:true });
    document.getElementById('newUserEmail').value=''; document.getElementById('newUserName').value='';
    await loadUsersAdmin(); alert('Usuario creado con contraseña temporal.');
  } catch (e) { alert(e.message); }
}
async function loadAuditLog() {
  const tb = document.getElementById('tb-audit'); if (!tb || !sb) return;
  const { data, error } = await sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(50);
  if (error) { tb.innerHTML = `<tr><td colspan="5" style="color:var(--text3)">Auditoría no disponible: ${error.message}</td></tr>`; return; }
  tb.innerHTML = (data||[]).map(a => `<tr><td>${a.created_at?new Date(a.created_at).toLocaleString('es-ES'):'—'}</td><td>${a.user_email||'—'}</td><td>${a.action||'—'}</td><td>${a.table_name||'—'}</td><td style="font-size:12px;color:var(--text3)">${a.record_id||''}</td></tr>`).join('') || '<tr><td colspan="5" style="color:var(--text3)">Sin eventos.</td></tr>';
}

// ============================================================
// NAV
// ============================================================
function nav(id, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + id); if (page) page.classList.add('active');
  el.classList.add('active');
  if(id==='config'){ updateUserUI(); loadUsersAdmin(); loadAuditLog(); }
}

// ============================================================
// UTILS
// ============================================================
const M = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const MS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const COLORS = ['#1B5FA8','#1A9E72','#B87318','#D4502A','#5B52B8','#2AA68E','#888780'];
const eur = n => n == null ? '—' : new Intl.NumberFormat('es-ES', {style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n);
const fdate = d => d ? String(d).slice(0, 10) : '—';

// ============================================================
// PRODUCTOS BANCARIOS
// ============================================================
const BANK_PRODUCTS = [
  { id: 'sabadell_linea', banco: 'Banco Sabadell', producto: 'Línea de crédito', tipo: 'linea', limite: 30000, origen: 'Disponible automático desde Sabadell línea en B40:N42' },
  { id: 'bbva_linea', banco: 'BBVA', producto: 'Línea de crédito', tipo: 'linea', limite: 40000, origen: 'Disponible automático desde bloque BBVA LINEA' },
  { id: 'bbva_credito', banco: 'BBVA', producto: 'Crédito', tipo: 'prestamo', principal: 30000, origen: 'Principal inicial contratado' },
];
function latestTesRecord() { const arr = (D.tes || []).slice().sort((a,b) => String(a.mes).localeCompare(String(b.mes))); return arr[arr.length - 1] || {}; }
function clampBank(n, max) { n = Math.max(0, Number(n) || 0); return Math.min(max, n); }
function manualBankDisponible(id) { const raw = localStorage.getItem('bp_disponible_' + id); if (raw === null || raw === '') return null; const n = Number(String(raw).replace(',', '.')); return Number.isFinite(n) ? Math.max(0, n) : null; }
function setManualBankDisponible(id, value) { const product = BANK_PRODUCTS.find(p => p.id === id); const max = product?.limite || 0; const n = clampBank(String(value).replace(',', '.'), max); localStorage.setItem('bp_disponible_' + id, String(n)); renderProductos(); renderTes(); }
function clearManualBankDisponible(id) { localStorage.removeItem('bp_disponible_' + id); renderProductos(); renderTes(); }
function getBankProductsComputed() {
  const latest = latestTesRecord();
  const autoDisponible = {
    sabadell_linea: Math.abs(Number(latest.sabadell_linea) || 0),
    bbva_linea: Math.abs(Number(latest.bbva_linea) || 0),
  };
  return BANK_PRODUCTS.map(p => {
    if (p.tipo === 'prestamo') return { ...p, limite: p.principal, dispuesto: p.principal, disponible: null, usoPct: null };
    const manual = manualBankDisponible(p.id);
    const auto = autoDisponible[p.id] || 0;
    const disponible = clampBank(manual !== null ? manual : auto, p.limite);
    const dispuesto = Math.max(0, p.limite - disponible);
    return { ...p, disponible, dispuesto, usoPct: p.limite > 0 ? (dispuesto / p.limite) * 100 : 0, origenDato: manual !== null ? 'Manual: disponible introducido' : p.origen };
  });
}
function getBankSummary() { const productos = getBankProductsComputed(); const lineas = productos.filter(p => p.tipo === 'linea'); return { productos, limiteLineas: lineas.reduce((sum,p)=>sum+(p.limite||0),0), dispuestoLineas: lineas.reduce((sum,p)=>sum+(p.dispuesto||0),0), disponibleLineas: lineas.reduce((sum,p)=>sum+(p.disponible||0),0), prestamoInicial: productos.filter(p=>p.tipo==='prestamo').reduce((sum,p)=>sum+(p.principal||0),0) }; }
const charts = {};

function mkChart(id, type, labels, datasets, extra = {}) {
  if (charts[id]) charts[id].destroy();
  const el = document.getElementById(id);
  if (!el) return;
  charts[id] = new Chart(el, {
    type,
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => eur(c.raw) } } },
      scales: type === 'doughnut' ? {} : {
        x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11, family: 'DM Sans' }, color: '#A8A59F' } },
        y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11, family: 'DM Sans' }, color: '#A8A59F', callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } }
      }, ...extra
    }
  });
}

function set(id, v) { const e = document.getElementById(id); if (e) e.innerHTML = v; }
function setC(id, c) { const e = document.getElementById(id); if (e) e.className = c; }
function maskIban(v){ const s=String(v||'').replace(/\s+/g,'').trim(); if(!s) return ''; if(/^ES\d{2}[A-Z0-9]{20}$/i.test(s)) return 'ES•• •••• •••• •••• •••• ' + s.slice(-4); if(s.length>10 && /[A-Z]{2}\d{2}/i.test(s)) return '•••• ' + s.slice(-4); return s; }
function safeAccount(v){ const m=maskIban(v); return m ? `<span class="masked">${m}</span>` : ''; }

// ============================================================
// DATA STORE
// ============================================================
let D = { cajas: [], gastos: [], fins: [], devs: [], workers: [], tes: [], ingresosExternos: [], movimientos: [], reglasBanco: [], bankConnections: [], conciliaciones: [] };

// ============================================================
// SYNC FROM GOOGLE SHEETS
// ============================================================
async function syncSheets() {
  if (!sb) { alert('Configura Supabase primero'); openCfg(); return; }
  if (!requireRole('admin','finanzas')) return;
  const btn = document.getElementById('sBtn');
  btn.classList.add('syncing');
  btn.innerHTML = '<svg class="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Sincronizando...';
  
  const log = [];
  try {
    log.push('Detectando pestañas de caja...');
    const cajaSheets = await discoverCajaSheets();
    log.push('Pestañas de caja detectadas: ' + cajaSheets.map(s => `${s.name}(${s.gid})`).join(', '));

    log.push('Descargando cajas...');
    const cajasAll = (await Promise.all(
      cajaSheets.map(s => fetchCajas(s.gid, s.year, s.month))
    )).flat();
    const tesoreriaCuentas = (await Promise.all(
      cajaSheets.map(s => fetchTesoreriaCuentas(s.gid, s.year, s.month))
    )).flat();
    log.push(`Cajas: ${cajasAll.length} registros válidos`);
    log.push(`Tesorería cuentas: ${tesoreriaCuentas.length} meses`);
    
    const cajaMap = new Map();
    cajasAll.forEach(c => cajaMap.set(`${c.empresa || 'Corporacion'}|${c.fecha}`, c));
    const cajasUniq = Array.from(cajaMap.values()).sort((a,b) => a.fecha.localeCompare(b.fecha));
    if (cajasUniq.length !== cajasAll.length) log.push(`Aviso: ${cajasAll.length - cajasUniq.length} caja(s) duplicada(s) descartada(s)`);

    log.push('Descargando gastos...');
    const gastos = await fetchGastos();
    log.push(`Gastos: ${gastos.length} registros`);

    log.push('Descargando financiaciones...');
    const fins = await fetchFins();
    log.push(`Financiaciones: ${fins.length} registros`);

    // Cajas: reemplazo completo del año. Si algo falla, se para la sync y no se muestra como correcta.
    const { error: delCajas } = await sb.from('cajas_diarias').delete().gte('fecha', '2026-01-01').lte('fecha', '2026-12-31');
    if (delCajas) throw new Error('Borrando cajas: ' + delCajas.message);
    if (cajasUniq.length) {
      const { error: eC } = await sb.from('cajas_diarias').insert(cajasUniq);
      if (eC) throw new Error('Guardando cajas: ' + eC.message);
    }
    log.push('✓ Cajas guardadas');

    const { error: delGastos } = await sb.from('gastos').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delGastos) throw new Error('Borrando gastos: ' + delGastos.message);
    if (gastos.length) {
      let { error: eG } = await sb.from('gastos').insert(gastos);
      // Compatibilidad: si la tabla gastos todavía no tiene fecha_pago, reintenta sin esa columna.
      // Para que sea compartido entre usuarios, añade la columna con el SQL adjunto.
      if (eG && /fecha_pago|schema cache|column/i.test(eG.message || '')) {
        log.push('Aviso: la tabla gastos no acepta fecha_pago; reintento sin columna y mantengo pago estimado en navegador');
        const gastosSinFechaPago = gastos.map(({fecha_pago, ...rest}) => rest);
        ({ error: eG } = await sb.from('gastos').insert(gastosSinFechaPago));
      }
      if (eG) throw new Error('Guardando gastos: ' + eG.message);
    }
    log.push('✓ Gastos guardados');

    const { error: delFins } = await sb.from('financiaciones').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delFins) throw new Error('Borrando financiaciones: ' + delFins.message);
    if (fins.length) {
      const { error: eF } = await sb.from('financiaciones').insert(fins);
      if (eF) throw new Error('Guardando financiaciones: ' + eF.message);
    }
    log.push('✓ Financiaciones guardadas');

    const tesMap = new Map();
    tesoreriaCuentas.forEach(t => tesMap.set(`${t.empresa || 'Corporacion'}|${t.mes}`, t));
    const tesUniq = Array.from(tesMap.values()).sort((a,b) => String(a.mes).localeCompare(String(b.mes)));
    D.tes = tesUniq;
    localStorage.setItem('cd_tesoreria_cuentas', JSON.stringify(tesUniq));
    log.push(`✓ Tesorería B40:N42 guardada en navegador: ${tesUniq.length} meses`);

    const now = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    localStorage.setItem('cd_last_sync', now);
    await loadDB(); // renderiza exactamente lo que queda guardado en Supabase, igual que tras refrescar.
    set('lsync', 'Última sync: ' + now);
    set('r-sync-info', 'Sincronizado a las ' + now + ' · ' + cajaSheets.length + ' pestañas de caja, ' + cajasUniq.length + ' días válidos, ' + tesUniq.length + ' meses de tesorería, ' + gastos.length + ' gastos, ' + fins.length + ' financiaciones');
    log.push('✅ Sync completada');
  } catch (e) {
    log.push('❌ ERROR: ' + e.message);
    alert('Error al sincronizar: ' + e.message + '\n\nNo se marcará la sincronización como correcta. Revisa la consola.');
    console.error(e);
  }
  
  console.log('[Sync]', log.join('\n'));
  btn.classList.remove('syncing');
  btn.innerHTML = '<svg class="si" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Sincronizar';
}

// ============================================================
// LOAD FROM DB ON START
// ============================================================
async function loadDB() {
  if (!sb) return;
  const [c, g, f, dv, w, mb, rb, bc] = await Promise.all([
    sb.from('cajas_diarias').select('*').order('fecha'),
    sb.from('gastos').select('*').order('fecha', { ascending: false }),
    sb.from('financiaciones').select('*').order('fecha', { ascending: false }),
    sb.from('devoluciones').select('*').order('fecha_solicitud', { ascending: false }),
    sb.from('trabajadores').select('*').order('nombre'),
    sb.from('movimientos_bancarios').select('*').order('fecha', { ascending: false }),
    sb.from('reglas_conciliacion_bancaria').select('*').eq('activa', true).order('prioridad', { ascending: false }),
    sb.from('bank_connections').select('*').order('created_at', { ascending: false }),
  ]);
  D.cajas = (c.data || []).filter(esCajaReal); D.gastos = g.data || []; D.fins = f.data || [];
  try { D.tes = JSON.parse(localStorage.getItem('cd_tesoreria_cuentas') || '[]'); } catch (_) { D.tes = []; }
  D.devs = dv.data || []; D.workers = w.data || [];
  D.movimientos = (mb && !mb.error && Array.isArray(mb.data)) ? mb.data : loadBankMovementsLocal();
  D.reglasBanco = (rb && !rb.error && Array.isArray(rb.data)) ? rb.data : loadBankRulesLocal();
  D.bankConnections = (bc && !bc.error && Array.isArray(bc.data)) ? bc.data : [];
  D.ingresosExternos = await fetchIngresosExternos();
  const ls = localStorage.getItem('cd_last_sync');
  if (ls) set('lsync', 'Última sync: ' + ls);
  await loadPrevConfigFromSupabase();
  renderAll();
  loadUsersAdmin();
  loadAuditLog();
}


// ============================================================
// RENDER
// ============================================================
// ============================================================
// EMPRESA GLOBAL STATE
// ============================================================
const EMPRESAS = ['Global','Corporacion','Bridge','Vallecas Las'];
let empresaActual = 'Global';

async function setEmpresa(emp) {
  empresaActual = emp;
  renderEmpresaBars();
  await loadPrevConfigFromSupabase();
  renderAll();
}

function renderEmpresaBars() {
  ['empresa-bar-r','empresa-bar-t','empresa-bar-g','empresa-bar-i','empresa-bar-p','empresa-bar-m'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = EMPRESAS.map(e =>
      `<button class="eb ${empresaActual===e?'active':''}" onclick="setEmpresa('${e}')">${e}</button>`
    ).join('');
  });
}

function filtrarEmp(arr, campo='empresa') {
  if (empresaActual === 'Global') return arr;
  return arr.filter(r => (r[campo]||'').toLowerCase().includes(empresaActual.toLowerCase()));
}

function esCajaReal(c) {
  if (!c || !c.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(String(c.fecha).slice(0,10))) return false;
  const [y,m,d] = String(c.fecha).slice(0,10).split('-').map(Number);
  const maxDay = new Date(y, m, 0).getDate();
  if (!d || d < 1 || d > maxDay) return false;
  return [c.efectivo,c.tarjeta_caixa,c.tarjeta_kutxa,c.tarjeta_sabadell,c.tarjeta_cajamar,c.tarjeta_bbva,c.transferencia,c.financiacion,c.gasto,c.total]
    .some(v => Math.abs(Number(v) || 0) > 0.0001);
}

function renderAll() {
  renderEmpresaBars();
  renderResumen(); renderTes(); renderProductos(); renderGastos(); renderIngresos(); renderPrev(); renderMovimientos(); renderReglasBancarias(); renderBankConnections();
  renderFins(); renderDevs(); renderEquipo(); renderObjs();
}


function ingresoPendiente(i) {
  const e = normTxt(i.estado || '');
  return e.includes('pend') || e.includes('no cob') || e.includes('sin cobrar') || e.includes('por cobrar');
}
function ingresoCobrado(i) {
  const e = normTxt(i.estado || '');
  return e.includes('cob') || e.includes('pagad') || e === 'ok' || e.includes('abonad');
}
function ingresosCorporacionDesdeCajas() {
  return (D.cajas || []).filter(esCajaReal).map(c => ({
    empresa: 'Corporacion',
    fecha: c.fecha,
    factura: 'Caja diaria',
    concepto: 'Caja diaria',
    proveedor: 'Clínica Dental',
    estado: 'Cobrado',
    forma_pago: 'Mixto',
    importe: Number(c.total) || 0,
    iva: 0,
    irpf: 0,
    fuente: 'Cajas mensuales',
    caja: c
  })).filter(i => i.fecha && Math.abs(i.importe || 0) > 0.0001);
}
function allIngresosOperativos() {
  return [...ingresosCorporacionDesdeCajas(), ...(D.ingresosExternos || [])]
    .filter(i => i.fecha && Math.abs(Number(i.importe)||0) > 0.0001)
    .sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)));
}
function ingresosFiltradosEmpresa() { return filtrarEmp(allIngresosOperativos(), 'empresa'); }
function estadoIngresoBadge(i) {
  const estado = (i.estado || '').trim() || 'Sin estado';
  if (ingresoPendiente(i)) return `<span class="pill pr" style="font-size:10px">${estado}</span>`;
  if (ingresoCobrado(i)) return `<span class="pill pg" style="font-size:10px">${estado}</span>`;
  return `<span class="pill pz" style="font-size:10px">${estado}</span>`;
}

function renderResumen() {
  const cajas = filtrarEmp(D.cajas, 'empresa');
  const ingresos = ingresosFiltradosEmpresa();
  const gastos = filtrarEmp(D.gastos, 'empresa');
  // La tabla financiaciones no tiene columna empresa en Supabase; se muestran globales.
  const fins = D.fins;
  const fac = ingresos.reduce((s, i) => s + (Number(i.importe) || 0), 0);
  const gst = gastos.reduce((s, g) => s + (g.importe || 0), 0);
  const finOps = fins.reduce((s, f) => s + (f.financiado || 0), 0);
  const dp = D.devs.filter(d => d.estado === 'PENDIENTE').length;
  const res = fac - gst;
  const diasFacturados = ingresos.length;
  set('r-fac', eur(fac)); set('r-fac-s', diasFacturados + ' días con datos');
  set('r-res', eur(res)); setC('r-res', 'mv ' + (res >= 0 ? 'up' : 'dn'));
  set('r-res-s', res >= 0 ? '▲ En positivo' : '▼ En negativo');
  set('r-fin', eur(finOps)); set('r-fin-s', fins.length + ' operaciones');
  set('r-dev', dp); setC('r-dev', 'mv ' + (dp > 0 ? 'dn' : 'up'));
  set('r-dev-s', dp > 0 ? 'Requieren atención' : 'Todo resuelto');

  const pm = {}; ingresos.forEach(i => { const m = String(i.fecha).slice(5, 7); pm[m] = (pm[m] || 0) + (Number(i.importe) || 0); });
  const mk = Object.keys(pm).sort();
  mkChart('c-fac', 'bar', mk.map(m => MS[+m-1]), [{ data: mk.map(m => pm[m]), backgroundColor: '#1B5FA8', borderRadius: 5, barPercentage: 0.7 }]);

  const ef = cajas.reduce((s, c) => s + (c.efectivo || 0), 0);
  const tar = cajas.reduce((s, c) => s + (c.tarjeta_caixa || 0) + (c.tarjeta_kutxa || 0) + (c.tarjeta_sabadell || 0) + (c.tarjeta_cajamar || 0) + (c.tarjeta_bbva || 0), 0);
  const tr = cajas.reduce((s, c) => s + (c.transferencia || 0), 0);
  const finCaja = cajas.reduce((s, c) => s + (c.financiacion || 0), 0);
  mkChart('c-cobros', 'doughnut', ['Financiado','Tarjeta','Efectivo','Transferencia'],
    [{ data: [finCaja, tar, ef, tr], backgroundColor: ['#1B5FA8','#1A9E72','#B87318','#5B52B8'], borderWidth: 0, hoverOffset: 4 }],
    { cutout: '65%' });
  set('cobros-leg', ['Financiado','Tarjeta','Efectivo','Transferencia'].map((l,i) =>
    `<span><span class="lsq" style="background:${['#1B5FA8','#1A9E72','#B87318','#5B52B8'][i]}"></span>${l}</span>`).join(''));

  const gm = {}; gastos.forEach(g => { if (g.fecha) { const m = String(g.fecha).slice(5, 7); gm[m] = (gm[m] || 0) + (g.importe || 0); } });
  const rm = [...new Set([...Object.keys(pm), ...Object.keys(gm)])].sort();
  mkChart('c-res', 'bar', rm.map(m => MS[+m-1]),
    [{ data: rm.map(m => (pm[m]||0) - (gm[m]||0)), backgroundColor: rm.map(m => (pm[m]||0)-(gm[m]||0) >= 0 ? '#1A9E72' : '#D4502A'), borderRadius: 5 }]);
}


function mesKeyFromFecha(fecha) {
  const f = String(fecha || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(f) ? f.slice(0, 7) : '';
}

function filterEmpresaFor(arr, emp, campo='empresa') {
  if (emp === 'Global') return arr || [];
  const target = normTxt(emp);
  return (arr || []).filter(r => normTxt(r[campo] || '').includes(target));
}

function tesManualKey(emp) {
  return 'tes_saldos_' + String(emp || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').toLowerCase();
}
function defaultManualTreasuryAccounts(emp) {
  return [{ banco: 'Banco', cuenta: 'Cuenta corriente principal', saldo: 0 }];
}
function getManualTreasuryAccounts(emp) {
  try {
    const raw = localStorage.getItem(tesManualKey(emp));
    const arr = raw ? JSON.parse(raw) : null;
    if (Array.isArray(arr) && arr.length) return arr.map(a => ({ banco: a.banco || 'Banco', cuenta: a.cuenta || 'Cuenta', saldo: Number(a.saldo) || 0 }));
  } catch (_) {}
  return defaultManualTreasuryAccounts(emp);
}
function saveManualTreasuryAccounts(emp, arr) {
  localStorage.setItem(tesManualKey(emp), JSON.stringify((arr || []).map(a => ({ banco: a.banco || '', cuenta: a.cuenta || '', saldo: Number(a.saldo) || 0 }))));
}
function setManualTreasuryAccount(emp, idx, field, value) {
  const arr = getManualTreasuryAccounts(emp);
  if (!arr[idx]) return;
  arr[idx][field] = field === 'saldo' ? Number(String(value).replace(',', '.')) || 0 : value;
  saveManualTreasuryAccounts(emp, arr);
  renderTes();
}
function addManualTreasuryAccount(emp) {
  const arr = getManualTreasuryAccounts(emp);
  arr.push({ banco: 'Banco', cuenta: 'Nueva cuenta', saldo: 0 });
  saveManualTreasuryAccounts(emp, arr);
  renderTes();
}
function removeManualTreasuryAccount(emp, idx) {
  const arr = getManualTreasuryAccounts(emp);
  arr.splice(idx, 1);
  saveManualTreasuryAccounts(emp, arr.length ? arr : defaultManualTreasuryAccounts(emp));
  renderTes();
}
function manualTreasuryTotal(emp) {
  return getManualTreasuryAccounts(emp).reduce((s,a)=>s+(Number(a.saldo)||0),0);
}

function tesoreriaOperativaMensual(emp = empresaActual) {
  const ingresos = filterEmpresaFor(allIngresosOperativos(), emp, 'empresa');
  const gastos = filterEmpresaFor(D.gastos || [], emp, 'empresa');
  const mesesSet = new Set();
  ingresos.forEach(i => { const m = mesKeyFromFecha(i.fecha); if (m) mesesSet.add(m); });
  gastos.forEach(g => { const m = mesKeyFromFecha(g.fecha); if (m) mesesSet.add(m); });
  const meses = [...mesesSet].sort();
  return meses.map(m => {
    const ingresosMes = ingresos.filter(i => mesKeyFromFecha(i.fecha) === m);
    const gastosMes = gastos.filter(g => mesKeyFromFecha(g.fecha) === m);
    const totalIngresos = ingresosMes.reduce((sum, i) => sum + (Number(i.importe) || 0), 0);
    const totalGastos = gastosMes.reduce((sum, g) => sum + (Number(g.importe) || 0), 0);
    const ivaIngresos = ingresosMes.reduce((sum, i) => sum + (Number(i.iva) || 0), 0);
    const balance = totalIngresos - totalGastos;
    return { mes: m, ingresos: totalIngresos, gastos: totalGastos, balance, iva: ivaIngresos, ingresosCount: ingresosMes.length, gastosCount: gastosMes.length };
  });
}
function latestOperativeMonth(rows) {
  const sorted = (rows || []).slice().sort((a,b) => String(a.mes).localeCompare(String(b.mes)));
  return sorted[sorted.length - 1]?.mes || '';
}
function setTesSnapshotChip(text) {
  set('tes-snapshot-chip', text || 'Última posición real');
}

function setTesLabels(mode) {
  if (mode === 'cuentas') {
    set('t-l-tot', 'Caja operativa');
    set('t-l-obj', 'Disponible líneas');
    set('t-l-ef', 'Efectivo');
    set('t-l-fi', 'FF aprobada');
    set('t-chart-title', 'Distribución por cuenta');
    set('t-table-title', 'Detalle de saldos y líneas');
  } else if (mode === 'global') {
    set('t-l-tot', 'Caja operativa global');
    set('t-l-obj', 'Disponible líneas');
    set('t-l-ef', 'Movimiento mes');
    set('t-l-fi', 'IVA ingresos');
    set('t-chart-title', 'Saldos por empresa');
    set('t-table-title', 'Fotografía bancaria global');
  } else {
    set('t-l-tot', 'Tesorería bancaria');
    set('t-l-obj', 'Ingresos mes');
    set('t-l-ef', 'Gastos mes');
    set('t-l-fi', 'Balance operativo');
    set('t-chart-title', 'Saldos bancarios configurados');
    set('t-table-title', 'Fotografía bancaria y movimiento operativo');
  }
}

function corpTesRecords() {
  return (D.tes || []).filter(r => normTxt(r.empresa || 'Corporacion').includes('corporacion')).sort((a,b) => String(a.mes).localeCompare(String(b.mes)));
}
function selectedCorpTesRecord() {
  const tesBase = corpTesRecords();
  const latest = tesBase[tesBase.length - 1] || null;
  if (latest?.mes) setTesSnapshotChip('Posición real: ' + M[+latest.mes.slice(5)-1] + ' ' + latest.mes.slice(0,4));
  else setTesSnapshotChip('Sin posición real');
  return latest;
}

function renderTesSinDatos(message) {
  setTesSnapshotChip('Sin posición real');
  set('t-tot', eur(0)); setC('t-tot', 'mv'); set('t-dias', message || 'Sin saldos bancarios configurados');
  set('t-obj', eur(0)); set('t-obj-s', ''); set('t-ef', eur(0)); set('t-ef-s', ''); set('t-fi', eur(0)); set('t-fi-s', '');
  document.getElementById('tb-tes').innerHTML = `<tr><td colspan="4" style="color:var(--text3);text-align:center;padding:24px">${message || 'Sin datos de tesorería.'}</td></tr>`;
  mkChart('c-caja', 'bar', [], [{ data: [] }]);
  set('t-bank-disponible', eur(0)); set('t-bank-dispuesto', eur(0)); set('t-bank-liquidez', eur(0));
}

function renderTesCorporacion() {
  setTesLabels('cuentas');
  const t = selectedCorpTesRecord();
  if (!t) return renderTesSinDatos('Sin datos de tesorería de Corporación. Pulsa Sincronizar para leer los cuadros B40:N42.');
  const totalCaja = Number(t.total_caja) || 0;
  const efectivo = Number(t.efectivo) || 0;
  const ff = Number(t.ff_aprobada) || 0;
  const bankSummary = getBankSummary();

  set('t-tot', eur(totalCaja)); setC('t-tot', 'mv'); set('t-dias', 'Caja operativa real del cuadro B40:N42');
  set('t-obj', eur(bankSummary.disponibleLineas)); set('t-obj-s', 'Líneas de crédito disponibles');
  set('t-ef', eur(efectivo)); set('t-ef-s', totalCaja > 0 ? ((efectivo/totalCaja)*100).toFixed(1) + '% de caja operativa' : '');
  set('t-fi', eur(ff)); set('t-fi-s', totalCaja > 0 ? ((ff/totalCaja)*100).toFixed(1) + '% de caja operativa' : '');
  set('t-bank-disponible', eur(bankSummary.disponibleLineas));
  set('t-bank-dispuesto', eur(bankSummary.dispuestoLineas));
  set('t-bank-liquidez', eur(totalCaja + bankSummary.disponibleLineas));

  const cuentas = [
    ['Efectivo', Number(t.efectivo)||0, 'B41', 'Caja'],
    ['FF aprobada', Number(t.ff_aprobada)||0, 'C41', 'Caja'],
    ['Caixa', Number(t.caixa)||0, 'D41', 'Banco'],
    ['Sabadell', Number(t.sabadell)||0, 'E41', 'Banco'],
    ['Kutxa', Number(t.kutxa)||0, 'F41', 'Banco'],
    ['Cajamar', Number(t.cajamar)||0, 'G41', 'Banco'],
    ['Transferencia', Number(t.transferencia)||0, 'H/I41 según mes', 'Banco'],
  ].filter(x => Math.abs(x[1]) > 0.0001);
  const lineas = [
    ['BBVA línea disponible', Math.abs(Number(t.bbva_linea)||0), 'bloque BBVA LINEA', 'Línea crédito'],
    ['Sabadell línea disponible', Math.abs(Number(t.sabadell_linea)||0), 'L/M41 según mes', 'Línea crédito'],
  ].filter(x => Math.abs(x[1]) > 0.0001);

  mkChart('c-caja', 'bar', cuentas.map(x => x[0]), [{ data: cuentas.map(x => x[1]), backgroundColor: '#1B5FA8', borderRadius: 5 }]);
  document.getElementById('tb-tes').innerHTML = [
    ...cuentas.map(([nombre, importe, origen, estado]) => `<tr><td style="font-weight:500">${nombre}</td><td class="tr" style="font-weight:600">${eur(importe)}</td><td style="font-size:12px;color:var(--text3)">${origen}</td><td><span class="pill pb">${estado}</span></td></tr>`),
    `<tr><td style="font-weight:700">Caja operativa</td><td class="tr" style="font-weight:800">${eur(totalCaja)}</td><td style="font-size:12px;color:var(--text3)">primer TTL</td><td><span class="pill pg">Subtotal</span></td></tr>`,
    ...lineas.map(([nombre, importe, origen, estado]) => `<tr><td style="font-weight:500">${nombre}</td><td class="tr" style="font-weight:600;color:var(--green)">${eur(importe)}</td><td style="font-size:12px;color:var(--text3)">${origen}</td><td><span class="pill pz">${estado}</span></td></tr>`),
    `<tr><td style="font-weight:700">Liquidez potencial</td><td class="tr" style="font-weight:800">${eur(totalCaja + bankSummary.disponibleLineas)}</td><td style="font-size:12px;color:var(--text3)">caja operativa + líneas disponibles</td><td><span class="pill pg">Total</span></td></tr>`
  ].join('');
}

function renderTesManualEmpresa(emp) {
  setTesLabels('manual');
  const rows = tesoreriaOperativaMensual(emp);
  const accounts = getManualTreasuryAccounts(emp);
  const total = accounts.reduce((s,a)=>s+(Number(a.saldo)||0),0);
  const mes = latestOperativeMonth(rows);
  setTesSnapshotChip(total ? 'Saldo actual manual' : 'Sin saldo bancario real');
  const r = rows.find(x => x.mes === mes) || rows[rows.length - 1] || { ingresos:0, gastos:0, balance:0, iva:0, ingresosCount:0, gastosCount:0 };

  set('t-tot', eur(total)); setC('t-tot', 'mv'); set('t-dias', total ? 'Saldos bancarios introducidos manualmente' : 'Introduce saldos bancarios reales para esta empresa');
  set('t-obj', eur(r.ingresos)); set('t-obj-s', `${r.ingresosCount} ingreso(s) del mes`);
  set('t-ef', eur(r.gastos)); set('t-ef-s', `${r.gastosCount} gasto(s) del mes`);
  set('t-fi', (r.balance >= 0 ? '+' : '') + eur(r.balance)); setC('t-fi', 'mv ' + (r.balance >= 0 ? 'up' : 'dn')); set('t-fi-s', 'Ingresos - gastos · no es saldo bancario');
  set('t-bank-disponible', eur(0)); set('t-bank-dispuesto', eur(0)); set('t-bank-liquidez', eur(total));

  mkChart('c-caja', 'bar', accounts.map(a => a.cuenta || a.banco || 'Cuenta'), [{ data: accounts.map(a => Number(a.saldo)||0), backgroundColor: '#1B5FA8', borderRadius: 5 }]);
  const accRows = accounts.map((a, idx) => `<tr><td><input value="${a.banco || ''}" onchange="setManualTreasuryAccount('${emp}',${idx},'banco',this.value)" style="width:110px;padding:5px 7px;border:1px solid var(--border2);border-radius:7px;background:var(--bg);font-family:'DM Sans';font-size:12px"> <input value="${a.cuenta || ''}" onchange="setManualTreasuryAccount('${emp}',${idx},'cuenta',this.value)" style="width:190px;padding:5px 7px;border:1px solid var(--border2);border-radius:7px;background:var(--bg);font-family:'DM Sans';font-size:12px"></td><td class="tr"><input type="number" value="${Number(a.saldo)||0}" onchange="setManualTreasuryAccount('${emp}',${idx},'saldo',this.value)" style="width:120px;text-align:right;padding:5px 7px;border:1px solid var(--border2);border-radius:7px;background:var(--bg);font-family:'DM Sans';font-size:12px"> €</td><td style="font-size:12px;color:var(--text3)">Manual · saldo bancario actual</td><td><button class="eb" onclick="removeManualTreasuryAccount('${emp}',${idx})" style="font-size:11px;padding:5px 8px">Eliminar</button></td></tr>`).join('');
  document.getElementById('tb-tes').innerHTML = [
    `<tr><td colspan="4"><div class="al" style="background:var(--accent-light);color:#0C3E78;border:1px solid rgba(27,95,168,.15)">ℹ️ Para ${emp}, Tesorería es el saldo bancario real que introduzcas aquí. Los ingresos y gastos se muestran debajo solo como movimiento operativo del mes.</div></td></tr>`,
    accRows,
    `<tr><td colspan="4"><button class="eb" onclick="addManualTreasuryAccount('${emp}')">+ Añadir cuenta bancaria</button></td></tr>`,
    `<tr><td style="font-weight:700">Total tesorería bancaria</td><td class="tr" style="font-weight:800">${eur(total)}</td><td style="font-size:12px;color:var(--text3)">suma de saldos bancarios</td><td><span class="pill pg">Fotografía</span></td></tr>`,
    `<tr><td style="font-weight:600">Ingresos del mes</td><td class="tr" style="font-weight:700;color:var(--green)">${eur(r.ingresos)}</td><td style="font-size:12px;color:var(--text3)">Sección Ingresos · ${mes || 'sin mes'}</td><td><span class="pill pg">Movimiento</span></td></tr>`,
    `<tr><td style="font-weight:600">Gastos del mes</td><td class="tr" style="font-weight:700;color:var(--red)">${eur(r.gastos)}</td><td style="font-size:12px;color:var(--text3)">Gastos Generales · columna Empresa</td><td><span class="pill pr">Movimiento</span></td></tr>`,
    `<tr><td style="font-weight:700">Balance operativo del mes</td><td class="tr" style="font-weight:800;color:${r.balance>=0?'var(--green)':'var(--red)'}">${r.balance>=0?'+':''}${eur(r.balance)}</td><td style="font-size:12px;color:var(--text3)">no se usa como saldo de tesorería</td><td><span class="pill ${r.balance>=0?'pg':'pr'}">Resultado</span></td></tr>`
  ].join('');
}

function renderTesGlobal() {
  setTesLabels('global');
  const corp = selectedCorpTesRecord();
  const corpCaja = corp ? (Number(corp.total_caja) || 0) : 0;
  const bridge = manualTreasuryTotal('Bridge');
  const vallecas = manualTreasuryTotal('Vallecas Las');
  const cajaOperativaGlobal = corpCaja + bridge + vallecas;
  const bankSummary = getBankSummary();
  const rows = tesoreriaOperativaMensual('Global');
  const currentMes = latestOperativeMonth(rows);
  setTesSnapshotChip(corp?.mes ? 'Posición real: ' + M[+corp.mes.slice(5)-1] + ' ' + corp.mes.slice(0,4) : 'Posición real global');
  const r = rows.find(x => x.mes === currentMes) || rows[rows.length - 1] || { ingresos:0, gastos:0, balance:0, iva:0 };

  set('t-tot', eur(cajaOperativaGlobal)); setC('t-tot', 'mv'); set('t-dias', 'Corporación B40:N42 + saldos manuales Bridge/Vallecas');
  set('t-obj', eur(bankSummary.disponibleLineas)); set('t-obj-s', 'Líneas disponibles de Corporación');
  set('t-ef', (r.balance >= 0 ? '+' : '') + eur(r.balance)); setC('t-ef', 'mv ' + (r.balance >= 0 ? 'up' : 'dn')); set('t-ef-s', 'Ingresos - gastos del mes global');
  set('t-fi', eur(r.iva)); set('t-fi-s', 'IVA de ingresos del mes global');
  set('t-bank-disponible', eur(bankSummary.disponibleLineas));
  set('t-bank-dispuesto', eur(bankSummary.dispuestoLineas));
  set('t-bank-liquidez', eur(cajaOperativaGlobal + bankSummary.disponibleLineas));

  const parts = [
    ['Corporación', corpCaja, 'B40:N42 · caja operativa'],
    ['Bridge', bridge, 'Saldo manual'],
    ['Vallecas Las', vallecas, 'Saldo manual'],
  ];
  mkChart('c-caja', 'bar', parts.map(p=>p[0]), [{ data: parts.map(p=>p[1]), backgroundColor: ['#1B5FA8','#1A9E72','#B87318'], borderRadius: 5 }]);
  document.getElementById('tb-tes').innerHTML = [
    ...parts.map(([nombre, importe, origen]) => `<tr><td style="font-weight:600">${nombre}</td><td class="tr" style="font-weight:700">${eur(importe)}</td><td style="font-size:12px;color:var(--text3)">${origen}</td><td><span class="pill pb">Saldo</span></td></tr>`),
    `<tr><td style="font-weight:700">Caja operativa global</td><td class="tr" style="font-weight:800">${eur(cajaOperativaGlobal)}</td><td style="font-size:12px;color:var(--text3)">saldos reales configurados</td><td><span class="pill pg">Fotografía</span></td></tr>`,
    `<tr><td style="font-weight:600">Líneas disponibles</td><td class="tr" style="font-weight:700;color:var(--green)">${eur(bankSummary.disponibleLineas)}</td><td style="font-size:12px;color:var(--text3)">Productos bancarios</td><td><span class="pill pz">Potencial</span></td></tr>`,
    `<tr><td style="font-weight:700">Liquidez potencial global</td><td class="tr" style="font-weight:800">${eur(cajaOperativaGlobal + bankSummary.disponibleLineas)}</td><td style="font-size:12px;color:var(--text3)">caja operativa + líneas disponibles</td><td><span class="pill pg">Total</span></td></tr>`,
    `<tr><td style="font-weight:600">Movimiento operativo del mes</td><td class="tr" style="font-weight:700;color:${r.balance>=0?'var(--green)':'var(--red)'}">${r.balance>=0?'+':''}${eur(r.balance)}</td><td style="font-size:12px;color:var(--text3)">ingresos - gastos; no sustituye al saldo bancario</td><td><span class="pill ${r.balance>=0?'pg':'pr'}">Movimiento</span></td></tr>`
  ].join('');
}

function renderTes() {
  if (empresaActual === 'Corporacion') return renderTesCorporacion();
  if (empresaActual === 'Global') return renderTesGlobal();
  return renderTesManualEmpresa(empresaActual);
}

function renderProductos() {
  const s = getBankSummary();
  set('bp-limite', eur(s.limiteLineas)); set('bp-dispuesto', eur(s.dispuestoLineas)); set('bp-disponible', eur(s.disponibleLineas)); set('bp-prestamo', eur(s.prestamoInicial));
  const lineas = s.productos.filter(p => p.tipo === 'linea');
  mkChart('c-bank-lines', 'bar', lineas.map(p => p.banco), [
    { label: 'Dispuesto', data: lineas.map(p => p.dispuesto || 0), backgroundColor: '#D4502A', borderRadius: 5 },
    { label: 'Disponible', data: lineas.map(p => p.disponible || 0), backgroundColor: '#1A9E72', borderRadius: 5 },
  ], { plugins: { legend: { display: true, labels: { font: { family: 'DM Sans', size: 11 } } }, tooltip: { callbacks: { label: c => (c.dataset.label || '') + ': ' + eur(c.raw) } } }, scales: { x: { stacked: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11, family: 'DM Sans' }, color: '#A8A59F' } }, y: { stacked: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { font: { size: 11, family: 'DM Sans' }, color: '#A8A59F', callback: v => v >= 1000 ? (v/1000).toFixed(0)+'k' : v } } } });
  const tbody = document.getElementById('tb-bank-products');
  if (!tbody) return;
  tbody.innerHTML = s.productos.map(p => {
    if (p.tipo === 'prestamo') return `<tr><td style="font-weight:500">${p.banco}</td><td>${p.producto}</td><td class="tr" style="font-weight:600">${eur(p.principal)}</td><td class="tr">—</td><td class="tr">—</td><td><span class="pill pz">Principal inicial</span></td><td style="font-size:12px;color:var(--text3)">${p.origen}</td></tr>`;
    const pct = Math.max(0, Math.min(100, p.usoPct || 0));
    return `<tr><td style="font-weight:500">${p.banco}</td><td>${p.producto}</td><td class="tr" style="font-weight:600">${eur(p.limite)}</td><td class="tr"><input value="${p.disponible || 0}" onchange="setManualBankDisponible('${p.id}', this.value)" title="Disponible, no dispuesto" style="width:90px;text-align:right;padding:5px 7px;border:1px solid var(--border2);border-radius:7px;background:var(--bg);font-family:'DM Sans';font-size:12px"> €</td><td class="tr" style="font-weight:600;color:var(--red)">${eur(p.dispuesto)}</td><td><div style="width:120px;background:var(--bg2);border-radius:999px;overflow:hidden;height:8px;margin-bottom:4px"><div style="width:${pct}%;height:8px;background:${pct>80?'#D4502A':pct>50?'#B87318':'#1A9E72'}"></div></div><span style="font-size:11px;color:var(--text3)">${pct.toFixed(1)}% usado</span></td><td style="font-size:12px;color:var(--text3)">${p.origenDato || p.origen}${p.origenDato && p.origenDato.startsWith('Manual') ? ` <button onclick="clearManualBankDisponible('${p.id}')" style="border:0;background:transparent;color:var(--accent);cursor:pointer;font-size:11px">usar Excel</button>` : ''}</td></tr>`;
  }).join('');
}




// ============================================================
// OPEN BANKING / PSD2 VIA POWENS + SUPABASE EDGE FUNCTION
// ============================================================
function openBankingFunctionUrl() {
  const url = localStorage.getItem('cd_url') || '';
  return url ? url.replace(/\/$/, '') + '/functions/v1/powens-banking' : '';
}
async function openBankingCall(action, payload={}) {
  const endpoint = openBankingFunctionUrl();
  const key = localStorage.getItem('cd_key') || '';
  if (!endpoint || !key) throw new Error('Configura Supabase antes de conectar bancos.');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ action, ...payload })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || data.message || 'Error Powens banking');
  return data;
}
function setOBStatus(msg, kind='info') {
  const el = document.getElementById('ob-status');
  if (!el) return;
  const color = kind === 'err' ? 'var(--red)' : (kind === 'ok' ? 'var(--green)' : 'var(--text3)');
  el.style.color = color;
  el.textContent = msg || '';
}
async function loadOpenBankingInstitutions() {
  try {
    setOBStatus('Cargando conectores bancarios de Powens para España...');
    const data = await openBankingCall('institutions', { country: 'ES' });
    const target = ['caixa','caixabank','bbva','sabadell','cajamar','tajamar','laboral','kutxa'];
    const all = Array.isArray(data.institutions) ? data.institutions : [];
    const filtered = all.filter(b => target.some(t => normTxt((b.name || '') + ' ' + (b.id || '') + ' ' + (b.uuid || '')).includes(t)));
    const banks = filtered.length ? filtered : all;
    const sel = document.getElementById('ob-bank-select');
    sel.innerHTML = '<option value="">Selecciona banco</option>' + banks.map(b => {
      const id = b.uuid || b.id;
      const nm = (b.name || '').replace(/"/g,'&quot;');
      return `<option value="${id}" data-name="${nm}" data-id-connector="${b.id || ''}">${b.name} · ${b.id || b.uuid}</option>`;
    }).join('');
    setOBStatus(`${banks.length} conectores cargados. Selecciona uno para iniciar el Webview de Powens.`, 'ok');
  } catch (err) {
    console.error(err);
    setOBStatus(err.message || String(err), 'err');
  }
}
async function createBankConnection() {
  try {
    const sel = document.getElementById('ob-bank-select');
    const institution_id = sel.value;
    if (!institution_id) return alert('Selecciona un banco.');
    const banco = sel.selectedOptions[0]?.dataset?.name || sel.selectedOptions[0]?.textContent || institution_id;
    const id_connector = sel.selectedOptions[0]?.dataset?.idConnector || '';
    const empresa = document.getElementById('ob-empresa').value;
    const alias = document.getElementById('ob-alias').value.trim() || `${banco} · ${empresa}`;
    setOBStatus('Creando enlace seguro de Powens Webview...');
    const redirect_url = window.location.origin + window.location.pathname + '?powens_return=1';
    const data = await openBankingCall('create_connection', { institution_id, id_connector, banco, empresa, alias, redirect_url });
    if (data.link) {
      setOBStatus('Redirigiendo a Powens para autorizar el banco...', 'ok');
      window.location.href = data.link;
    } else {
      setOBStatus('Conexión creada, pero Powens no devolvió enlace.', 'err');
    }
  } catch (err) {
    console.error(err);
    setOBStatus(err.message || String(err), 'err');
  }
}
async function completeReturnedBankConnection() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('powens_return') && !params.has('code') && !params.has('connection_id') && !params.has('connection_ids') && !params.has('id_connection') && !params.has('error')) return;
  const returnedError = params.get('error') || params.get('error_description') || '';
  if (returnedError) {
    setOBStatus('Powens no completó la autorización: ' + returnedError + '. La conexión no se usará hasta reconectar y obtener token.', 'err');
    history.replaceState({}, document.title, window.location.pathname);
    return;
  }
  try {
    setOBStatus('Completando conexión bancaria de Powens...');
    const code = params.get('code') || '';
    const connection_id = params.get('connection_id') || params.get('id_connection') || '';
    const connection_ids = params.get('connection_ids') || '';
    const state = params.get('state') || '';
    if (!code && !connection_id && !connection_ids) throw new Error('Powens no devolvió code ni connection_id. Hay que reconectar desde Webview.');
    await openBankingCall('complete_connection', { code, connection_id, connection_ids, state });
    setOBStatus('Conexión bancaria completada. Sincronizando datos...', 'ok');
    await openBankingCall('sync_all', {});
    await loadDB();
    history.replaceState({}, document.title, window.location.pathname);
  } catch (err) {
    console.warn(err);
    setOBStatus('No se pudo completar automáticamente. Usa Reconectar o trabaja con extractos Excel/CSV. ' + (err.message || ''), 'err');
  }
}
async function syncBankConnection(id) {
  try {
    const conn = (D.bankConnections || []).find(c => String(c.id) === String(id));
    if (conn && !['connected','active'].includes(String(conn.status || '').toLowerCase())) {
      throw new Error('Esta conexión está pendiente/incompleta. Pulsa Reconectar o elimina la fila.');
    }
    setOBStatus('Sincronizando banco con Powens...');
    const data = await openBankingCall('sync_connection', { connection_id: id });
    setOBStatus(`Sincronizado: ${data.inserted || 0} movimientos procesados.`, 'ok');
    await loadDB();
  } catch (err) {
    console.error(err);
    setOBStatus(err.message || String(err), 'err');
  }
}
async function syncAllBankConnections() {
  try {
    setOBStatus('Sincronizando todas las conexiones Powens...');
    const data = await openBankingCall('sync_all', {});
    setOBStatus(`Sincronización completada: ${data.inserted || 0} movimientos procesados.`, 'ok');
    await loadDB();
  } catch (err) {
    console.error(err);
    setOBStatus(err.message || String(err), 'err');
  }
}
function renderBankConnections() {
  const tbody = document.getElementById('tb-bank-connections');
  if (!tbody) return;
  const rows = D.bankConnections || [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--text3)">Sin bancos conectados todavía. Carga bancos Powens y crea la conexión Webview.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(c => {
    const validUntil = c.consent_expires_at ? new Date(c.consent_expires_at).toLocaleDateString('es-ES') : '—';
    const status = c.status || 'pendiente';
    const connected = status === 'connected' || status === 'active';
    const pill = connected ? 'pg' : (status === 'error' ? 'pr' : 'pa');
    const actions = connected
      ? `<button class="eb" onclick="syncBankConnection('${c.id}')">Actualizar</button>`
      : `<button class="eb" onclick="createBankConnection()">Reconectar</button> <button class="eb" onclick="deleteBankConnection('${c.id}')">Eliminar</button>`;
    const statusLabel = status === 'webview_created' || status === 'created' ? 'pendiente autorización' : status;
    return `<tr><td style="font-weight:600">${c.banco || c.institution_id || 'Banco'}</td><td>${c.empresa || ''}</td><td>${safeAccount(c.alias || c.account_iban || c.cuenta || '')}</td><td><span class="pill ${pill}">${statusLabel}</span></td><td>${validUntil}</td><td>${c.last_sync_at ? new Date(c.last_sync_at).toLocaleString('es-ES') : '—'}</td><td>${actions}</td></tr>`;
  }).join('');
}

async function deleteBankConnection(id) {
  if (!confirm('Eliminar esta conexión bancaria pendiente/incompleta?')) return;
  try {
    if (sb) {
      const { error } = await sb.from('bank_connections').delete().eq('id', id);
      if (error) throw error;
    }
    D.bankConnections = (D.bankConnections || []).filter(c => String(c.id) !== String(id));
    setOBStatus('Conexión eliminada.', 'ok');
    renderBankConnections();
  } catch (err) {
    console.error(err);
    setOBStatus('No se pudo eliminar: ' + (err.message || err), 'err');
  }
}

// ============================================================
// MOVIMIENTOS BANCARIOS
// ============================================================
function bankMoveKey(m) {
  return [m.empresa || '', m.fecha || '', m.banco || '', m.cuenta || '', m.concepto || '', m.referencia || '', Number(m.importe)||0, Number(m.saldo)||0]
    .map(x => normTxt(String(x))).join('|');
}
function loadBankMovementsLocal() {
  try { return JSON.parse(localStorage.getItem('bank_movimientos_backup') || '[]'); } catch (_) { return []; }
}
function saveBankMovementsLocal() {
  localStorage.setItem('bank_movimientos_backup', JSON.stringify(D.movimientos || []));
}
function bankMovementDbPayload(m, batchId=null) {
  const payload = {
    id: String(m.id || '').trim(),
    empresa: m.empresa || '',
    fecha: m.fecha || null,
    fecha_valor: m.fecha_valor || m.fecha || null,
    banco: m.banco || '',
    cuenta: m.cuenta || '',
    iban_mask: m.iban_mask || maskIban(m.cuenta || ''),
    concepto: m.concepto || '',
    referencia: m.referencia || '',
    forma_pago: m.forma_pago || '',
    importe: Number(m.importe) || 0,
    saldo: Number(m.saldo) || 0,
    estado_validacion: m.estado_validacion || 'pendiente',
    validado: !!m.validado,
    es_nuevo: m.es_nuevo !== false,
    incidencia: !!m.incidencia,
    nota_incidencia: m.nota_incidencia || '',
    cuenta_asociada: m.cuenta_asociada || '',
    categoria_asociada: m.categoria_asociada || '',
    tipo_movimiento: m.tipo_movimiento || (Number(m.importe) >= 0 ? 'ingreso' : 'gasto'),
    estado_clasificacion: m.estado_clasificacion || 'sin_clasificar',
    proveedor_asociado: m.proveedor_asociado || '',
    regla_id: m.regla_id || '',
    estado_conciliacion: m.estado_conciliacion || 'sin_conciliar',
    entidad_relacionada_tipo: m.entidad_relacionada_tipo || '',
    entidad_relacionada_id: m.entidad_relacionada_id || '',
    entidad_relacionada_label: m.entidad_relacionada_label || '',
    sugerencia_conciliacion_tipo: m.sugerencia_conciliacion_tipo || '',
    sugerencia_conciliacion_id: m.sugerencia_conciliacion_id || '',
    sugerencia_conciliacion_label: m.sugerencia_conciliacion_label || '',
    impacto_resultado: !!m.impacto_resultado,
    impacto_tesoreria: m.impacto_tesoreria !== false,
    impacto_balance: !!m.impacto_balance,
    es_intercompany: !!m.es_intercompany,
    tipo_intercompany: m.tipo_intercompany || '',
    empresa_origen: m.empresa_origen || '',
    empresa_destino: m.empresa_destino || '',
    movimiento_relacionado_id: m.movimiento_relacionado_id || '',
    nota_intercompany: m.nota_intercompany || '',
    archivo_origen: m.archivo_origen || '',
    origen: m.origen || 'extracto_manual',
    formato_banco: m.formato_banco || '',
    import_batch_id: batchId || m.import_batch_id || null,
    duplicate_key: m.duplicate_key || bankMoveKey(m),
    fuente_prioritaria: m.fuente_prioritaria || 'banco',
    requiere_conciliacion: m.requiere_conciliacion !== false,
    fecha_importacion: m.fecha_importacion || new Date().toISOString(),
    uploaded_at: m.uploaded_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: currentUser?.id || null
  };
  return payload;
}
async function createBankImportBatch(meta, total, added, duplicates) {
  if (!sb) return null;
  const row = {
    empresa: meta?.empresa || document.getElementById('bank-import-empresa')?.value || '',
    banco: meta?.banco || '',
    cuenta_alias: meta?.cuenta_alias || document.getElementById('bank-import-alias')?.value || '',
    formato_banco: meta?.formato_banco || document.getElementById('bank-import-format')?.value || 'auto',
    archivo_nombre: meta?.archivo_nombre || '',
    registros_total: total || 0,
    registros_nuevos: added || 0,
    registros_duplicados: duplicates || 0,
    estado: 'procesado'
  };
  const { data, error } = await sb.from('bank_import_batches').insert(row).select('id').single();
  if (error) { console.warn('[Import batch] No se pudo crear lote:', error.message); return null; }
  return data?.id || null;
}
async function saveBankMovementsSupabase(importMeta=null) {
  // Guardamos una copia local solo como respaldo técnico, pero la fuente real es Supabase.
  saveBankMovementsLocal();
  if (!sb) throw new Error('No hay conexión con Supabase. Revisa Configuración.');
  const { data: sess } = await sb.auth.getSession();
  if (!sess?.session) throw new Error('Debes iniciar sesión para guardar movimientos bancarios en Supabase.');
  if (!(D.movimientos || []).length) return { saved: 0, batchId: null };

  const batchId = importMeta ? await createBankImportBatch(importMeta, importMeta.total, importMeta.added, importMeta.duplicates) : null;

  // Importante: Supabase/Postgres no permite que un mismo UPSERT contenga dos filas
  // con la misma clave de conflicto. Si un extracto trae duplicados o quedaron copias
  // de versiones anteriores en localStorage, primero consolidamos por ID.
  const byId = new Map();
  for (const m of (D.movimientos || [])) {
    const row = bankMovementDbPayload(m, batchId);
    if (!row.id) row.id = 'mb_' + btoa(unescape(encodeURIComponent(row.duplicate_key || bankMoveKey(row)))).replace(/[^a-zA-Z0-9]/g,'').slice(0,42);
    // Si hay duplicado, conservamos el más reciente / más completo.
    const prev = byId.get(row.id);
    if (!prev || String(row.updated_at || '') >= String(prev.updated_at || '')) byId.set(row.id, row);
  }
  const rows = Array.from(byId.values());

  // También dejamos D.movimientos limpio para que no vuelva a intentar subir duplicados.
  D.movimientos = rows.map(r => ({ ...r })).sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.uploaded_at || '').localeCompare(String(a.uploaded_at || '')));
  saveBankMovementsLocal();

  for (let i = 0; i < rows.length; i += 250) {
    const chunk = rows.slice(i, i + 250);
    const { error } = await sb.from('movimientos_bancarios').upsert(chunk, { onConflict: 'id' });
    if (error) throw new Error('Supabase no guardó los movimientos bancarios: ' + error.message);
  }
  return { saved: rows.length, batchId };
}
function loadBankRulesLocal() {
  try { return JSON.parse(localStorage.getItem('bank_rules') || '[]'); } catch (_) { return []; }
}
function saveBankRulesLocal() { localStorage.setItem('bank_rules', JSON.stringify(D.reglasBanco || [])); }
async function saveBankRulesSupabase() {
  saveBankRulesLocal();
  if (!sb) return;
  try {
    const rows = (D.reglasBanco || []).map(r => ({...r, activa: r.activa !== false}));
    if (rows.length) {
      const { error } = await sb.from('reglas_conciliacion_bancaria').upsert(rows, { onConflict: 'id' });
      if (error) console.warn('[Reglas conciliación] No se pudieron guardar en Supabase. Uso localStorage.', error.message);
    }
  } catch (err) { console.warn('[Reglas conciliación] Tabla no disponible. Uso localStorage.', err.message || err); }
}
function cuentaAsociadaCategorias() {
  const setCats = new Set((D.gastos || []).map(g => (g.fuente_gasto || g.categoria || '').trim()).filter(Boolean));
  // Cuentas de ingresos necesarias para movimientos bancarios positivos y traspasos internos.
  ['Ventas', 'T. Intercompany', 'Traspaso entre empresas'].forEach(c => setCats.add(c));
  return Array.from(setCats).sort((a,b)=>a.localeCompare(b,'es'));
}
function gastoCategorias() {
  return cuentaAsociadaCategorias();
}

function intercompanyTypeLabel(t) {
  if (t === 'dividendo') return 'Reparto de dividendos';
  if (t === 'prestamo_intercompany') return 'Préstamo intersocietario';
  if (t === 'devolucion_prestamo_intercompany') return 'Devolución préstamo intersocietario';
  if (t === 'transferencia_interna') return 'Transferencia interna';
  return 'No intercompany';
}
function inferIntercompanyFromConcept(m) {
  const txt = normTxt([m.concepto, m.referencia, m.cuenta_asociada, m.categoria_asociada].join(' '));
  const empresa = String(m.empresa || '');
  const isCorpBridge = (txt.includes('corporacion') || txt.includes('corporación') || empresa === 'Corporacion') && txt.includes('bridge');
  const isBridgeVallecas = (txt.includes('bridge') || empresa === 'Bridge') && (txt.includes('vallecas') || txt.includes('vallecas las'));
  if (txt.includes('dividendo') || txt.includes('reparto') || isCorpBridge) {
    return { es_intercompany: true, tipo_intercompany: 'dividendo', empresa_origen: 'Corporacion', empresa_destino: 'Bridge', tipo_movimiento: 'intercompany', cuenta_asociada: 'Reparto de dividendos', categoria_asociada: 'Reparto de dividendos', impacto_resultado: false, impacto_tesoreria: true, impacto_balance: true };
  }
  if (txt.includes('prestamo intersocietario') || txt.includes('préstamo intersocietario') || txt.includes('prestamo intercompany') || txt.includes('préstamo intercompany') || isBridgeVallecas) {
    return { es_intercompany: true, tipo_intercompany: 'prestamo_intercompany', empresa_origen: 'Bridge', empresa_destino: 'Vallecas Las', tipo_movimiento: 'intercompany', cuenta_asociada: 'Préstamo intersocietario', categoria_asociada: 'Préstamo intersocietario', impacto_resultado: false, impacto_tesoreria: true, impacto_balance: true };
  }
  return null;
}
function applyIntercompanyToMovement(m, overwrite=false) {
  if (!m) return m;
  if (!overwrite && m.es_intercompany) return m;
  const inf = inferIntercompanyFromConcept(m);
  if (!inf) return m;
  Object.assign(m, inf);
  m.estado_clasificacion = m.estado_clasificacion === 'auto' ? 'auto' : 'intercompany';
  return m;
}
async function aplicarIntercompany(overwrite=false) {
  (D.movimientos || []).forEach(m => applyIntercompanyToMovement(m, overwrite));
  await saveBankMovementsSupabase();
  renderMovimientos();
}
function setMovimientoIntercompany(id, tipo) {
  const m = (D.movimientos || []).find(x => x.id === id);
  if (!m) return;
  if (!tipo) {
    m.es_intercompany = false;
    m.tipo_intercompany = '';
    m.empresa_origen = '';
    m.empresa_destino = '';
    m.impacto_resultado = false;
    m.estado_conciliacion = 'sin_conciliar';
    m.entidad_relacionada_tipo = '';
    m.entidad_relacionada_id = '';
    m.entidad_relacionada_label = '';
    m.tipo_movimiento = Number(m.importe) >= 0 ? 'ingreso' : 'gasto';
  } else if (tipo === 'dividendo') {
    Object.assign(m, { estado_conciliacion:'conc_intercompany', entidad_relacionada_tipo:'intercompany', es_intercompany:true, tipo_intercompany:'dividendo', empresa_origen:'Corporacion', empresa_destino:'Bridge', tipo_movimiento:'intercompany', cuenta_asociada:'Reparto de dividendos', categoria_asociada:'Reparto de dividendos', impacto_resultado:false, impacto_tesoreria:true, impacto_balance:true });
  } else if (tipo === 'prestamo_intercompany') {
    Object.assign(m, { estado_conciliacion:'conc_intercompany', entidad_relacionada_tipo:'intercompany', es_intercompany:true, tipo_intercompany:'prestamo_intercompany', empresa_origen:'Bridge', empresa_destino:'Vallecas Las', tipo_movimiento:'intercompany', cuenta_asociada:'Préstamo intersocietario', categoria_asociada:'Préstamo intersocietario', impacto_resultado:false, impacto_tesoreria:true, impacto_balance:true });
  }
  m.estado_clasificacion = tipo ? 'intercompany' : 'sin_clasificar';
  saveBankMovementsSupabase();
  renderMovimientos();
}
function renderIntercompanyTable(all) {
  const tb = document.getElementById('tb-intercompany');
  if (!tb) return;
  const rows = (all || []).filter(m => m.es_intercompany || m.tipo_movimiento === 'intercompany').slice(0,150);
  tb.innerHTML = rows.map(m => `<tr><td>${fdate(m.fecha)}</td><td>${intercompanyTypeLabel(m.tipo_intercompany)}</td><td>${m.empresa_origen || '—'}</td><td>${m.empresa_destino || '—'}</td><td>${m.concepto || '—'}</td><td class="tr" style="font-weight:700">${eur(Math.abs(Number(m.importe)||0))}</td><td><span class="pill pg">Excluido resultado</span></td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:22px">Sin operaciones intercompany detectadas todavía.</td></tr>';
}

function bankConceptSignature(text) {
  let s = normTxt(String(text || ''));
  s = s.replace(/\b(es|iban|ccc)\s*[a-z0-9]{6,}\b/g, ' ');
  s = s.replace(/[a-z]{2}\d{8,}/g, ' ');
  s = s.replace(/\b\d{4,}\b/g, ' ');
  s = s.replace(/x{3,}\d*/g, ' ');
  s = s.replace(/[^a-záéíóúüñ\s]/g, ' ');
  const stop = new Set(['pago','recibo','factura','cargo','abono','rem','num','numero','ref','referencia','operacion','movimiento','fecha','tarj','tarjeta','compra','transferencia','traspaso','sepa','orden','adeudo','emitido','recibido','cuenta','cliente','comerc']);
  const words = s.split(/\s+/).map(w => w.trim()).filter(w => w.length > 2 && !stop.has(w));
  // Quitamos duplicados conservando orden para que reglas parecidas sean estables.
  const seen = new Set();
  const out = [];
  for (const w of words) { if (!seen.has(w)) { seen.add(w); out.push(w); } }
  return out.slice(0, 8).join(' ');
}
function bankConceptTokens(text) {
  return bankConceptSignature(text).split(/\s+/).filter(Boolean);
}
function bankConceptSimilar(ruleText, conceptText) {
  const rSig = bankConceptSignature(ruleText);
  const cSig = bankConceptSignature(conceptText);
  if (!rSig || !cSig) return false;
  if (cSig.includes(rSig) || rSig.includes(cSig)) return true;
  const r = bankConceptTokens(ruleText);
  const c = new Set(bankConceptTokens(conceptText));
  if (!r.length) return false;
  const hits = r.filter(x => c.has(x)).length;
  // Para reglas cortas exigimos coincidencia total; para largas permitimos pequeñas diferencias.
  if (r.length <= 2) return hits === r.length;
  return hits >= Math.max(2, Math.ceil(r.length * 0.67));
}
function tipoFromCuentaAsociada(cat, importe) {
  if (cat === 'Ventas') return 'ingreso';
  if (cat === 'T. Intercompany' || cat === 'Reparto de dividendos' || cat === 'Préstamo intersocietario') return 'intercompany';
  if (cat === 'Traspaso entre empresas') return 'traspaso';
  return Number(importe) >= 0 ? 'ingreso' : 'gasto';
}
function applyCuentaImpact(m, cat, source='auto') {
  if (!m) return m;
  m.cuenta_asociada = cat || '';
  m.categoria_asociada = cat || '';
  m.estado_clasificacion = cat ? source : 'sin_clasificar';
  if (!cat) return m;
  if (cat === 'Ventas') {
    m.tipo_movimiento = 'ingreso';
    m.impacto_resultado = true;
    m.impacto_tesoreria = true;
    m.es_intercompany = false;
    m.tipo_intercompany = '';
    if (!m.estado_conciliacion || m.estado_conciliacion === 'sin_conciliar') m.estado_conciliacion = 'sin_conciliar';
  } else if (cat === 'T. Intercompany') {
    m.tipo_movimiento = 'intercompany';
    m.es_intercompany = true;
    m.tipo_intercompany = m.tipo_intercompany || 'transferencia_interna';
    m.impacto_resultado = false;
    m.impacto_tesoreria = true;
    m.impacto_balance = true;
    m.estado_conciliacion = 'conc_intercompany';
    m.entidad_relacionada_tipo = 'intercompany';
  } else if (cat === 'Traspaso entre empresas') {
    m.tipo_movimiento = 'traspaso';
    m.es_intercompany = false;
    m.tipo_intercompany = '';
    m.empresa_origen = m.empresa_origen || m.empresa || '';
    m.empresa_destino = m.empresa_destino || m.empresa || '';
    m.impacto_resultado = false;
    m.impacto_tesoreria = true;
    m.impacto_balance = false;
    m.estado_conciliacion = 'no_operativo';
    m.entidad_relacionada_tipo = 'traspaso';
  } else {
    m.tipo_movimiento = Number(m.importe) >= 0 ? 'ingreso' : 'gasto';
    m.impacto_resultado = true;
    m.impacto_tesoreria = true;
  }
  return m;
}
function ruleMatchesMovement(rule, m) {
  if (!rule || rule.activa === false || !m) return false;
  const txt = String(rule.texto_contiene || rule.texto || '').trim();
  if (!txt) return false;
  const concepto = [m.concepto, m.referencia].join(' ');
  if (!bankConceptSimilar(txt, concepto)) return false;
  if (rule.empresa && rule.empresa !== 'Global' && m.empresa && rule.empresa !== m.empresa) return false;
  if (rule.banco && normTxt(rule.banco) && normTxt(m.banco) && !normTxt(m.banco).includes(normTxt(rule.banco))) return false;
  return true;
}
function applyBankRulesToMovement(m, overwrite=false) {
  if (!m || (!overwrite && (m.cuenta_asociada || m.categoria_asociada || m.tipo_movimiento === 'traspaso'))) return m;
  const rules = (D.reglasBanco || []).filter(r => r.activa !== false).sort((a,b)=>(Number(b.prioridad)||0)-(Number(a.prioridad)||0));
  const rule = rules.find(r => ruleMatchesMovement(r, m));
  if (!rule) {
    if (!m.tipo_movimiento) m.tipo_movimiento = Number(m.importe) >= 0 ? 'ingreso' : 'gasto';
    if (!m.estado_clasificacion) m.estado_clasificacion = 'sin_clasificar';
    return m;
  }
  const cat = rule.categoria_destino || rule.cuenta_destino || '';
  applyCuentaImpact(m, cat, 'auto');
  m.tipo_movimiento = rule.tipo || tipoFromCuentaAsociada(cat, m.importe);
  m.proveedor_asociado = rule.proveedor_sugerido || m.proveedor_asociado || '';
  m.regla_id = rule.id;
  m.estado_clasificacion = 'auto';
  if (rule.tipo === 'dividendo') {
    Object.assign(m, { estado_conciliacion:'conc_intercompany', entidad_relacionada_tipo:'intercompany', es_intercompany:true, tipo_intercompany:'dividendo', empresa_origen:'Corporacion', empresa_destino:'Bridge', tipo_movimiento:'intercompany', cuenta_asociada:'Reparto de dividendos', categoria_asociada:'Reparto de dividendos', impacto_resultado:false, impacto_tesoreria:true, impacto_balance:true });
  }
  if (rule.tipo === 'prestamo_intercompany') {
    Object.assign(m, { estado_conciliacion:'conc_intercompany', entidad_relacionada_tipo:'intercompany', es_intercompany:true, tipo_intercompany:'prestamo_intercompany', empresa_origen:'Bridge', empresa_destino:'Vallecas Las', tipo_movimiento:'intercompany', cuenta_asociada:'Préstamo intersocietario', categoria_asociada:'Préstamo intersocietario', impacto_resultado:false, impacto_tesoreria:true, impacto_balance:true });
  }
  return m;
}
async function aplicarReglasBancarias(overwrite=false) {
  (D.movimientos || []).forEach(m => { applyBankRulesToMovement(m, overwrite); applyIntercompanyToMovement(m, overwrite); });
  await saveBankMovementsSupabase();
  renderMovimientos();
  renderReglasBancarias();
}
function ruleIdFromFields(texto, empresa, banco, tipo, cat) {
  const raw = [texto, empresa || '', banco || '', tipo || '', cat || ''].map(x=>normTxt(String(x))).join('|');
  try { return 'rbc_' + btoa(unescape(encodeURIComponent(raw))).replace(/[^a-zA-Z0-9]/g,'').slice(0,38); }
  catch(e) { return 'rbc_' + raw.replace(/[^a-zA-Z0-9]/g,'_').slice(0,38); }
}
async function addBankRuleFromForm(textoArg, catArg, tipoArg, empresaArg, bancoArg, proveedorArg) {
  const texto = String(textoArg ?? document.getElementById('rule-text')?.value ?? '').trim();
  const cat = String(catArg ?? document.getElementById('rule-cat')?.value ?? '').trim();
  let tipo = String(tipoArg ?? document.getElementById('rule-tipo')?.value ?? 'gasto').trim();
  const empresa = empresaArg || (empresaActual === 'Global' ? 'Global' : empresaActual);
  const banco = bancoArg || '';
  if (!texto || !cat) { alert('Indica texto del concepto y cuenta destino'); return; }
  if (cat === 'Ventas') tipo = 'ingreso';
  if (cat === 'T. Intercompany') tipo = 'intercompany';
  const rule = {
    id: ruleIdFromFields(texto, empresa, banco, tipo, cat),
    empresa, banco, texto_contiene: texto, tipo,
    categoria_destino: cat, proveedor_sugerido: proveedorArg || '', forma_pago: '', prioridad: 100, activa: true,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString()
  };
  const ix = (D.reglasBanco || []).findIndex(r => r.id === rule.id);
  if (ix >= 0) D.reglasBanco[ix] = {...D.reglasBanco[ix], ...rule}; else D.reglasBanco.push(rule);
  await saveBankRulesSupabase();
  await aplicarReglasBancarias(false);
  const inp = document.getElementById('rule-text'); if (inp) inp.value = '';
}
async function toggleBankRule(id, active) {
  const r = (D.reglasBanco || []).find(x=>x.id===id); if (!r) return;
  r.activa = !!active; r.updated_at = new Date().toISOString();
  await saveBankRulesSupabase(); renderReglasBancarias(); renderMovimientos();
}
async function setMovimientoCategoria(id, value) {
  const m = (D.movimientos || []).find(x => x.id === id); if (!m) return;
  applyCuentaImpact(m, value, value ? 'manual' : 'sin_clasificar');
  await saveBankMovementsSupabase(); renderMovimientos();
}
function suggestedRuleText(concepto) {
  return bankConceptSignature(concepto);
}
async function learnRuleFromMovimiento(id) {
  const m = (D.movimientos || []).find(x => x.id === id);
  if (!m || !m.cuenta_asociada) { alert('Primero asigna una cuenta asociada'); return; }
  const texto = suggestedRuleText([m.concepto, m.referencia].join(' '));
  if (!texto) { alert('No he podido extraer un patrón de este concepto'); return; }
  const tipo = tipoFromCuentaAsociada(m.cuenta_asociada, m.importe);
  const before = (D.movimientos || []).filter(x => !x.cuenta_asociada && ruleMatchesMovement({texto_contiene:texto, empresa:m.empresa || empresaActual, banco:m.banco || '', activa:true}, x)).length;
  await addBankRuleFromForm(texto, m.cuenta_asociada, tipo, m.empresa || empresaActual, m.banco || '', m.proveedor_asociado || '');
  const after = (D.movimientos || []).filter(x => x.regla_id && x.cuenta_asociada === m.cuenta_asociada && ruleMatchesMovement({texto_contiene:texto, empresa:m.empresa || empresaActual, banco:m.banco || '', activa:true}, x)).length;
  alert(`Regla aprendida: "${texto}" → ${m.cuenta_asociada}. Se aplicará automáticamente a movimientos con concepto similar. Coincidencias encontradas: ${Math.max(before, after)}`);
}
function renderReglasBancarias() {
  const catSel = document.getElementById('rule-cat');
  if (catSel) {
    const cats = gastoCategorias();
    catSel.innerHTML = [''].concat(cats).map(c => `<option value="${c}">${c || 'Cuenta destino'}</option>`).join('');
  }
  const tbody = document.getElementById('tb-reglas-banco');
  if (!tbody) return;
  const rows = filterEmpresaFor(D.reglasBanco || [], empresaActual, 'empresa');
  tbody.innerHTML = rows.slice(0,80).map(r => `<tr><td style="font-weight:600">${r.texto_contiene || '—'}</td><td>${r.empresa || 'Global'}</td><td>${r.banco || 'Todos'}</td><td><span class="pill pb">${r.tipo || 'gasto'}</span></td><td>${r.categoria_destino || '—'}</td><td>${r.proveedor_sugerido || '—'}</td><td><input type="checkbox" ${r.activa !== false ? 'checked' : ''} onchange="toggleBankRule('${r.id}',this.checked)"></td></tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:18px">Sin reglas todavía. Añade una regla o aprende desde un movimiento validado.</td></tr>';
}

function pickAny(row, names) {
  const keys = Object.keys(row || {});
  const clean = v => normTxt(v).replace(/[^a-z0-9]/g, '');
  for (const n of names) {
    const target = clean(n);
    const k = keys.find(x => clean(x) === target) || keys.find(x => clean(x).includes(target) || target.includes(clean(x)));
    if (k && row[k] != null && row[k] !== '') return row[k];
  }
  return '';
}
function excelDateToISO(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toISOString().slice(0,10);
  }
  const s = String(v || '').trim();
  // Permite textos tipo "06/04/2026 Hora 13:16"
  const m = s.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
  if (m) return fixDate(m[1]);
  return fixDate(v) || (s.match(/^\d{4}-\d{2}-\d{2}/) ? s.slice(0,10) : null);
}
function inferEmpresaMovimiento(row, fileName) {
  const e = String(pickAny(row, ['Empresa', 'Sociedad', 'Clinica']) || '').trim();
  if (e) return e;
  const f = normTxt(fileName || '');
  if (f.includes('bridge')) return 'Bridge';
  if (f.includes('vallecas')) return 'Vallecas Las';
  return empresaActual !== 'Global' ? empresaActual : 'Corporacion';
}
function cellText(v) {
  if (v == null) return '';
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0,10);
  return String(v).trim();
}
function simpleTxt(v) { return normTxt(v).replace(/[^a-z0-9]/g, ''); }
function rowText(row) { return (row || []).map(cellText).filter(Boolean).join(' '); }
function findHeaderIndex(raw) {
  return raw.findIndex(r => {
    const keys = (r || []).map(simpleTxt).filter(Boolean);
    const hasDate = keys.some(t => ['fecha','fechavalor','fcontable','fvalor','foperativa','fechaoperacion','date'].includes(t) || t.includes('fecha'));
    const hasAmount = keys.some(t => ['importe','importeeur','amount','cargoabono','saldo'].includes(t) || t.includes('importe') || t.includes('saldo'));
    const hasConcept = keys.some(t => ['concepto','movimiento','descripcion','descripcion','detalle','observaciones','masdatos'].includes(t) || t.includes('concepto') || t.includes('movimiento'));
    return keys.length >= 3 && hasDate && hasAmount && hasConcept;
  });
}
function makeUniqueHeaders(arr) {
  const seen = {};
  return (arr || []).map((h, i) => {
    let base = String(h || ('Columna ' + (i + 1))).trim();
    if (!base) base = 'Columna ' + (i + 1);
    const k = simpleTxt(base) || ('col' + i);
    seen[k] = (seen[k] || 0) + 1;
    return seen[k] > 1 ? `${base} ${seen[k]}` : base;
  });
}
function detectBankContext(raw, fileName) {
  const manual = document.getElementById('bank-import-format')?.value || 'auto';
  const text = normTxt((fileName || '') + ' ' + (raw || []).slice(0, 35).map(rowText).join(' '));
  let banco = '';
  if (manual && manual !== 'auto') banco = manual;
  else if (text.includes('banco bilbao') || text.includes('bbva')) banco = 'BBVA';
  else if (text.includes('caixabank') || text.includes('la caixa') || text.includes('caixa')) banco = 'Caixa';
  else if (text.includes('sabadell') || text.includes('bancsabadell')) banco = 'Sabadell';
  else if (text.includes('cajamar') || text.includes('tajamar')) banco = 'Cajamar';
  else if (text.includes('laboral kutxa') || text.includes('kutxa')) banco = 'Laboral Kutxa';

  let cuenta = '';
  const all = (raw || []).slice(0, 45).map(rowText).join(' ');
  const iban = all.match(/ES[0-9A-Z\s\-]{18,40}/i);
  if (iban) cuenta = iban[0].replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 34);
  if (!cuenta) {
    const ccc = all.match(/\b\d{4}-\d{4}-\d{2}-\d{10}\b/);
    if (ccc) cuenta = ccc[0];
  }
  if (!cuenta) cuenta = document.getElementById('bank-import-alias')?.value || '';

  let alias = document.getElementById('bank-import-alias')?.value || '';
  if (!alias && banco) alias = banco + ' ' + (cuenta ? '· ' + maskIban(cuenta) : '');
  return { banco, cuenta, alias, formato: banco || manual || 'auto' };
}
function buildRowsFromBankSheet(raw, fileName) {
  const headerIdx = findHeaderIndex(raw);
  if (headerIdx < 0) throw new Error('No he encontrado cabecera bancaria reconocible. Formatos soportados: BBVA, Caixa, Sabadell, Cajamar y Laboral Kutxa.');
  const ctx = detectBankContext(raw, fileName);
  const headers = makeUniqueHeaders(raw[headerIdx]);
  return raw.slice(headerIdx + 1).map((arr, idx) => {
    const o = { __context: ctx, __rownum: headerIdx + idx + 2 };
    headers.forEach((h, i) => { o[h] = arr[i]; });
    return o;
  });
}
function joinedConcept(row) {
  const parts = [
    pickAny(row, ['Concepto','Descripción','Descripcion','Detalle','Movimiento','Narrativa']),
    pickAny(row, ['Más datos','Mas datos','Observaciones','Detalle ampliado']),
    pickAny(row, ['Referencia 1','Referencia 2'])
  ].map(v => String(v || '').trim()).filter(Boolean);
  return Array.from(new Set(parts)).join(' · ').replace(/\s+/g, ' ').trim();
}
function normalizeBankMovement(row, fileName) {
  const ctx = row.__context || {};
  const fecha = excelDateToISO(pickAny(row, ['Fecha','F. CONTABLE','F CONTABLE','F. Operativa','F Operativa','Fecha operación','Fecha operacion','Date']))
    || excelDateToISO(pickAny(row, ['Fecha valor','F. VALOR','F Valor']));
  const fechaValor = excelDateToISO(pickAny(row, ['Fecha valor','F. VALOR','F Valor']));
  const importeRaw = pickAny(row, ['Importe','Importe EUR','Amount','Cargo/Abono','Importe operación','Importe operacion']);
  const importe = parseNum(importeRaw);
  const saldo = parseNum(pickAny(row, ['Saldo','Balance','Saldo contable','Saldo disponible','Saldo Posterior']));
  const concepto = joinedConcept(row);
  if (!fecha || Math.abs(importe) < 0.0001 || /^total/i.test(String(concepto || ''))) return null;
  const selectedEmpresa = document.getElementById('bank-import-empresa')?.value;
  const m = {
    id: '',
    empresa: (selectedEmpresa && selectedEmpresa !== 'auto') ? selectedEmpresa : inferEmpresaMovimiento(row, fileName),
    fecha,
    fecha_valor: fechaValor || fecha,
    banco: String(ctx.banco || pickAny(row, ['Banco', 'Entidad']) || '').trim(),
    cuenta: String(ctx.alias || ctx.cuenta || pickAny(row, ['Cuenta', 'IBAN', 'Número cuenta', 'Num cuenta']) || '').trim(),
    iban_mask: ctx.cuenta ? maskIban(ctx.cuenta) : '',
    concepto,
    referencia: String(pickAny(row, ['Referencia', 'Ref', 'Factura', 'Documento', 'Remesa', 'REMESA', 'Referencia 1', 'Referencia 2']) || '').trim(),
    forma_pago: String(pickAny(row, ['Forma de pago', 'Tipo', 'Canal', 'Código', 'CODIGO', 'CÓDIGO']) || '').trim(),
    importe,
    saldo,
    estado_validacion: 'pendiente',
    validado: false,
    es_nuevo: true,
    incidencia: false,
    nota_incidencia: '',
    cuenta_asociada: '',
    categoria_asociada: '',
    tipo_movimiento: Number(importe) >= 0 ? 'ingreso' : 'gasto',
    estado_clasificacion: 'sin_clasificar',
    proveedor_asociado: '',
    regla_id: '',
    estado_conciliacion: 'sin_conciliar',
    entidad_relacionada_tipo: '',
    entidad_relacionada_id: '',
    entidad_relacionada_label: '',
    impacto_resultado: false,
    impacto_tesoreria: true,
    archivo_origen: fileName || '',
    origen: 'extracto_manual',
    formato_banco: ctx.formato || document.getElementById('bank-import-format')?.value || 'auto',
    uploaded_at: new Date().toISOString()
  };
  m.id = 'mb_' + btoa(unescape(encodeURIComponent(bankMoveKey(m)))).replace(/[^a-zA-Z0-9]/g,'').slice(0,42);
  applyBankRulesToMovement(m, false);
  applyIntercompanyToMovement(m, false);
  return m;
}

function downloadTextFile(filename, content, mime='text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
async function downloadBankTemplate(kind='csv') {
  const rows = [
    ['Fecha','Empresa','Banco','Cuenta','Concepto','Referencia','Importe','Saldo','Forma de pago'],
    ['2026-04-30','Corporacion','BBVA','BBVA Corporación','AEAT MODELO 111','REC-001','-6099','25000','Domiciliación'],
    ['2026-04-30','Corporacion','Caixa','Caixa Corporación','TPV CAIXABANK','TPV-001','3200','28200','Tarjeta'],
    ['2026-04-30','Corporacion','BBVA','BBVA Corporación','DIVIDENDO CORPORACION A BRIDGE','INT-001','-20000','8200','Transferencia'],
    ['2026-04-30','Bridge','BBVA','BBVA Bridge','PRESTAMO INTERSOCIETARIO BRIDGE A VALLECAS','INT-002','-15000','5000','Transferencia']
  ];
  if (kind === 'xlsx') {
    const XLSX = await loadXLSX();
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Movimientos');
    XLSX.writeFile(wb, 'plantilla_movimientos_bancarios.xlsx');
    return;
  }
  const csv = rows.map(r => r.map(v => '"' + String(v).replace(/"/g,'""') + '"').join(';')).join('\n');
  downloadTextFile('plantilla_movimientos_bancarios.csv', csv);
}

async function handleBankMovementsFile(file) {
  if (!file) return;
  try {
    set('bank-upload-result', '<div class="al"><div class="sp"></div> Procesando movimientos bancarios multiformato...</div>');
    const XLSX = await loadXLSX();
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true, raw: true, codepage: 65001 });
    let nuevos = [];
    let formatos = [];
    for (const shName of wb.SheetNames.slice(0, 3)) {
      const ws = wb.Sheets[shName];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true, blankrows: false });
      if (!raw || !raw.length) continue;
      let rows;
      try { rows = buildRowsFromBankSheet(raw, file.name); }
      catch(e) { continue; }
      const ctx = (rows[0] && rows[0].__context) || detectBankContext(raw, file.name);
      if (ctx.banco) formatos.push(ctx.banco);
      nuevos = nuevos.concat(rows.map(r => normalizeBankMovement(r, file.name)).filter(Boolean));
    }
    if (!nuevos.length) throw new Error('No se han detectado movimientos válidos. Revisa que el archivo sea un extracto de BBVA, Caixa, Sabadell, Cajamar o Laboral Kutxa.');
    const existing = new Map((D.movimientos || []).map(m => [bankMoveKey(m), m]));
    let added = 0;
    nuevos.forEach(m => {
      const key = bankMoveKey(m);
      if (!existing.has(key)) { existing.set(key, m); added++; }
    });
    D.movimientos = Array.from(existing.values()).sort((a,b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.uploaded_at).localeCompare(String(a.uploaded_at)));
    const detected = Array.from(new Set(formatos.filter(Boolean))).join(', ') || 'automático';
    const result = await saveBankMovementsSupabase({ archivo_nombre: file.name, banco: detected, formato_banco: detected, total: nuevos.length, added, duplicates: nuevos.length - added });
    await loadDB();
    set('bank-upload-result', `<div class="al as2">✓ ${added} movimiento(s) nuevo(s) guardado(s) en Supabase. ${nuevos.length - added} duplicado(s) descartado(s). Formato detectado: <strong>${detected}</strong>. Lote: ${result.batchId || 'sin lote'}.</div>`);
    renderMovimientos();
  } catch (err) {
    set('bank-upload-result', `<div class="al ae">❌ Error al importar movimientos: ${err.message}</div>`);
  } finally {
    const inp = document.getElementById('bank-file'); if (inp) inp.value = '';
  }
}
function getIngresoId(i) {
  const raw = [i.empresa||'', i.fecha||'', i.factura||'', i.concepto||'', i.proveedor||'', Number(i.importe)||0].join('|');
  try { return 'ing_' + btoa(unescape(encodeURIComponent(raw))).replace(/[^a-zA-Z0-9]/g,'').slice(0,48); }
  catch(e) { return 'ing_' + raw.replace(/[^a-zA-Z0-9]/g,'_').slice(0,48); }
}
function daysBetween(a,b) {
  const da = new Date(String(a||'').slice(0,10)); const db = new Date(String(b||'').slice(0,10));
  if (isNaN(da) || isNaN(db)) return 9999;
  return Math.abs(Math.round((da-db)/86400000));
}
function textScoreMove(a,b) {
  const A = normTxt(a || ''); const B = normTxt(b || '');
  if (!A || !B) return 0;
  let score = 0;
  const words = B.split(/\s+/).filter(w => w.length > 3).slice(0,8);
  words.forEach(w => { if (A.includes(w)) score += 2; });
  if (A.includes(B) || B.includes(A)) score += 8;
  return score;
}
function getMovementReconStatus(m) {
  if (!m) return 'sin_conciliar';
  if (m.es_intercompany || m.tipo_movimiento === 'intercompany') return 'conc_intercompany';
  if (m.estado_conciliacion && m.estado_conciliacion !== 'pendiente') return m.estado_conciliacion;
  if (m.entidad_relacionada_tipo === 'gasto') return 'conc_gasto';
  if (m.entidad_relacionada_tipo === 'ingreso') return 'conc_ingreso';
  if (m.tipo_movimiento === 'traspaso' || m.tipo_movimiento === 'financiacion' || m.tipo_movimiento === 'no_operativo') return 'no_operativo';
  return 'sin_conciliar';
}
function getMovementReconLabel(m) {
  const st = getMovementReconStatus(m);
  if (st === 'conc_gasto') return '<span class="pill pg">Gasto conciliado</span>';
  if (st === 'conc_ingreso') return '<span class="pill pg">Ingreso conciliado</span>';
  if (st === 'conc_intercompany') return '<span class="pill pb">Intercompany</span>';
  if (st === 'no_operativo') return '<span class="pill pz">No operativo</span>';
  return '<span class="pill pr">Sin conciliar</span>';
}
function getImpactLabel(m) {
  const st = getMovementReconStatus(m);
  if (st === 'sin_conciliar') return '<span class="pill pa">Pendiente</span>';
  if (st === 'conc_intercompany') return '<span class="pill pb">Tesorería + balance</span>';
  if (st === 'no_operativo') return '<span class="pill pz">Solo tesorería</span>';
  return '<span class="pill pg">Solo confirma pago/cobro</span>';
}
function movementReconciliationSuggestion(m) {
  if (!m) return null;
  if (getMovementReconStatus(m) !== 'sin_conciliar') return null;
  const amount = Math.abs(Number(m.importe)||0);
  if (!amount) return null;
  const emp = m.empresa || empresaActual;
  const txt = [m.concepto, m.referencia, m.banco].join(' ');
  if ((Number(m.importe)||0) < 0) {
    const candidates = filterEmpresaFor(D.gastos || [], emp, 'empresa').map(g => {
      const diff = Math.abs(Math.abs(Number(g.importe)||0) - amount);
      if (diff > 1) return null;
      const d = daysBetween(m.fecha, getGastoFechaPago(g) || g.fecha);
      if (d > 45) return null;
      const score = 30 - Math.min(d,30) + textScoreMove(txt, [g.concepto,g.proveedor,g.fuente_gasto].join(' ')) - diff;
      return { tipo:'gasto', id:gastoKey(g), item:g, score, label:`${g.proveedor || 'Proveedor'} · ${g.concepto || g.fuente_gasto || 'Gasto'} · ${fdate(g.fecha)}` };
    }).filter(Boolean).sort((a,b)=>b.score-a.score);
    return candidates[0] || null;
  }
  const candidates = filterEmpresaFor(allIngresosOperativos(), emp, 'empresa').map(i => {
    const diff = Math.abs(Math.abs(Number(i.importe)||0) - amount);
    if (diff > 1) return null;
    const d = daysBetween(m.fecha, i.fecha);
    if (d > 45) return null;
    const score = 30 - Math.min(d,30) + textScoreMove(txt, [i.factura,i.concepto,i.proveedor,i.forma_pago].join(' ')) - diff;
    return { tipo:'ingreso', id:getIngresoId(i), item:i, score, label:`${i.factura || i.concepto || 'Ingreso'} · ${i.proveedor || i.forma_pago || ''} · ${fdate(i.fecha)}` };
  }).filter(Boolean).sort((a,b)=>b.score-a.score);
  return candidates[0] || null;
}
async function reconcileMovement(id, tipo, relId='', label='') {
  const m = (D.movimientos || []).find(x => x.id === id); if (!m) return;
  if (tipo === 'gasto') Object.assign(m, { estado_conciliacion:'conc_gasto', entidad_relacionada_tipo:'gasto', entidad_relacionada_id:relId, entidad_relacionada_label:label, impacto_resultado:false, impacto_tesoreria:true, estado_validacion:'validado', validado:true, es_nuevo:false });
  else if (tipo === 'ingreso') Object.assign(m, { estado_conciliacion:'conc_ingreso', entidad_relacionada_tipo:'ingreso', entidad_relacionada_id:relId, entidad_relacionada_label:label, impacto_resultado:false, impacto_tesoreria:true, estado_validacion:'validado', validado:true, es_nuevo:false });
  else if (tipo === 'no_operativo') Object.assign(m, { estado_conciliacion:'no_operativo', entidad_relacionada_tipo:'no_operativo', entidad_relacionada_id:'', entidad_relacionada_label:label || 'No operativo / ignorado', impacto_resultado:false, impacto_tesoreria:true, estado_validacion:'validado', validado:true, es_nuevo:false, tipo_movimiento:'no_operativo' });
  else if (tipo === 'clear') Object.assign(m, { estado_conciliacion:'sin_conciliar', entidad_relacionada_tipo:'', entidad_relacionada_id:'', entidad_relacionada_label:'', impacto_resultado:false, impacto_tesoreria:true, validado:false, estado_validacion:'pendiente' });
  await saveBankMovementsSupabase(); renderMovimientos();
}
async function acceptReconSuggestion(id) {
  const m = (D.movimientos || []).find(x => x.id === id); if (!m) return;
  const sug = movementReconciliationSuggestion(m);
  if (!sug) { alert('No hay una coincidencia clara para este movimiento'); return; }
  await reconcileMovement(id, sug.tipo, sug.id, sug.label);
}
async function autoSuggestReconciliation(markOnly=false) {
  (D.movimientos || []).forEach(m => {
    if (getMovementReconStatus(m) !== 'sin_conciliar') return;
    const sug = movementReconciliationSuggestion(m);
    if (sug) { m.sugerencia_conciliacion_tipo = sug.tipo; m.sugerencia_conciliacion_id = sug.id; m.sugerencia_conciliacion_label = sug.label; }
  });
  await saveBankMovementsSupabase(); renderMovimientos();
}
function renderConciliacionTable(all) {
  const tb = document.getElementById('tb-conciliacion'); if (!tb) return;
  const rows = (all || []).slice().sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))).slice(0,120);
  tb.innerHTML = rows.map(m => {
    const st = getMovementReconStatus(m);
    const sug = movementReconciliationSuggestion(m) || (m.sugerencia_conciliacion_tipo ? { tipo:m.sugerencia_conciliacion_tipo, id:m.sugerencia_conciliacion_id, label:m.sugerencia_conciliacion_label } : null);
    const suggestion = st === 'sin_conciliar' ? (sug ? `<span class="pill pa">Sugerido ${sug.tipo}</span><br><span style="font-size:12px;color:var(--text3)">${sug.label || ''}</span>` : '<span class="pill pr">Sin coincidencia</span><br><span style="font-size:12px;color:var(--text3)">No crear gasto/ingreso automáticamente</span>') : `${getMovementReconLabel(m)}<br><span style="font-size:12px;color:var(--text3)">${m.entidad_relacionada_label || intercompanyTypeLabel(m.tipo_intercompany) || 'Validado'}</span>`;
    const actions = st === 'sin_conciliar' ? `${sug ? `<button class="eb" onclick="acceptReconSuggestion('${m.id}')">Conciliar</button>` : ''} <button class="eb" onclick="reconcileMovement('${m.id}','no_operativo','','No operativo')">No operativo</button>` : `<button class="eb" onclick="reconcileMovement('${m.id}','clear')">Deshacer</button>`;
    return `<tr><td><strong>${fdate(m.fecha)}</strong> · ${m.empresa || '—'}<br><span style="font-size:12px;color:var(--text3)">${m.concepto || '—'}</span></td><td class="tr" style="font-weight:700;color:${(Number(m.importe)||0)>=0?'var(--green)':'var(--red)'}">${eur(Number(m.importe)||0)}</td><td>${suggestion}</td><td>${getImpactLabel(m)}</td><td>${actions}</td></tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:22px">Sin movimientos para conciliar.</td></tr>';
}

function filterBankMovements() {
  const q = normTxt(document.getElementById('mb-q')?.value || '');
  const st = document.getElementById('mb-estado')?.value || 'all';
  let rows = filterEmpresaFor(D.movimientos || [], empresaActual, 'empresa');
  if (q) rows = rows.filter(m => normTxt([m.fecha,m.empresa,m.banco,m.cuenta,m.concepto,m.referencia,m.cuenta_asociada,m.categoria_asociada,m.tipo_movimiento,m.tipo_intercompany,m.empresa_origen,m.empresa_destino,m.archivo_origen].join(' ')).includes(q));
  if (st === 'pendiente') rows = rows.filter(m => !m.validado);
  if (st === 'nuevo') rows = rows.filter(m => m.es_nuevo);
  if (st === 'validado') rows = rows.filter(m => m.validado);
  if (st === 'incidencia') rows = rows.filter(m => m.incidencia);
  if (st === 'sin_clasificar') rows = rows.filter(m => !m.cuenta_asociada && m.tipo_movimiento !== 'traspaso');
  if (st === 'auto') rows = rows.filter(m => m.estado_clasificacion === 'auto');
  if (st === 'intercompany') rows = rows.filter(m => m.es_intercompany || m.tipo_movimiento === 'intercompany');
  if (st === 'dividendo') rows = rows.filter(m => m.tipo_intercompany === 'dividendo');
  if (st === 'prestamo_intercompany') rows = rows.filter(m => m.tipo_intercompany === 'prestamo_intercompany');
  if (st === 'sin_conciliar') rows = rows.filter(m => getMovementReconStatus(m) === 'sin_conciliar');
  if (st === 'conc_gasto') rows = rows.filter(m => getMovementReconStatus(m) === 'conc_gasto');
  if (st === 'conc_ingreso') rows = rows.filter(m => getMovementReconStatus(m) === 'conc_ingreso');
  if (st === 'conc_intercompany') rows = rows.filter(m => getMovementReconStatus(m) === 'conc_intercompany');
  if (st === 'no_operativo') rows = rows.filter(m => getMovementReconStatus(m) === 'no_operativo');
  return rows;
}
function setMovimientoField(id, field, value) {
  const m = (D.movimientos || []).find(x => x.id === id);
  if (!m) return;
  if (['validado','incidencia','es_nuevo'].includes(field)) m[field] = !!value;
  else m[field] = value;
  if (field === 'validado' && value) { m.estado_validacion = 'validado'; m.es_nuevo = false; }
  if (field === 'validado' && !value) m.estado_validacion = 'pendiente';
  saveBankMovementsSupabase();
  renderMovimientos();
}
function validatedBankPosition(rows) {
  const latest = new Map();
  (rows || []).filter(m => m.validado && Number.isFinite(Number(m.saldo))).forEach(m => {
    const k = `${m.empresa || ''}|${m.banco || ''}|${m.cuenta || ''}`;
    const prev = latest.get(k);
    if (!prev || String(m.fecha).localeCompare(String(prev.fecha)) >= 0) latest.set(k, m);
  });
  return Array.from(latest.values());
}

function bankIconLabel(banco) {
  const b = normTxt(banco || '');
  if (b.includes('bbva')) return 'BBVA';
  if (b.includes('caixa')) return 'CX';
  if (b.includes('sabadell')) return 'SAB';
  if (b.includes('cajamar')) return 'CAJ';
  if (b.includes('kutxa') || b.includes('laboral')) return 'LK';
  return (String(banco || 'B').trim().slice(0,3) || 'B').toUpperCase();
}
function empresaSigla(emp) {
  if (emp === 'Corporacion') return 'CORP';
  if (emp === 'Bridge') return 'BR';
  if (emp === 'Vallecas Las') return 'VL';
  if (emp === 'Global') return 'GLB';
  return String(emp || '—').slice(0,4).toUpperCase();
}
function escAttr(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escHtml(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function movementDetailHtml(m) {
  const items = [
    ['Banco completo', m.banco || '—'], ['Cuenta / IBAN', safeAccount(m.cuenta) || '—'], ['Referencia', m.referencia || '—'], ['Fecha valor', fdate(m.fecha_valor || m.fecha)],
    ['Saldo posterior', Number.isFinite(Number(m.saldo)) ? eur(Number(m.saldo)) : '—'], ['Conciliación', getMovementReconLabel(m)], ['Impacto', getImpactLabel(m)], ['Estado', m.es_nuevo ? 'Nuevo' : 'Revisado'],
    ['Origen → destino', (m.empresa_origen || '—') + ' → ' + (m.empresa_destino || '—')], ['Archivo origen', m.archivo_origen || '—'], ['Lote importación', m.import_batch_id || '—'], ['Texto bruto', m.raw_text || m.concepto || '—']
  ];
  return `<tr class="mov-detail-row" id="mov-detail-${m.id}" style="display:none"><td colspan="8"><div class="mov-detail-grid">${items.map(([k,v]) => `<div class="mov-detail-item"><div class="mov-detail-label">${k}</div><div>${v}</div></div>`).join('')}</div><div style="padding:0 4px 12px"><label style="font-size:12px;color:var(--text3)">Nota / incidencia</label><br><input value="${escAttr(m.nota_incidencia || '')}" onchange="setMovimientoField('${m.id}','nota_incidencia',this.value)" placeholder="Añadir nota" style="width:100%;max-width:520px;padding:8px 10px;border:1px solid var(--border2);border-radius:8px;background:var(--bg);font-family:'DM Sans';font-size:12px"></div></td></tr>`;
}
function toggleMovementDetail(id) {
  const el = document.getElementById('mov-detail-' + id);
  if (!el) return;
  el.style.display = el.style.display === 'none' ? 'table-row' : 'none';
}
function rowClickToggle(ev, id) {
  const tag = String(ev.target?.tagName || '').toLowerCase();
  if (['select','option','input','button','a','textarea','label'].includes(tag) || ev.target.closest('select,button,input,a,textarea')) return;
  toggleMovementDetail(id);
}

function renderMovimientos() {
  const rows = filterBankMovements();
  const all = filterEmpresaFor(D.movimientos || [], empresaActual, 'empresa');
  const pend = all.filter(m => !m.validado).length;
  const val = all.filter(m => m.validado).length;
  const inc = all.filter(m => m.incidencia).length;
  const inter = all.filter(m => m.es_intercompany || m.tipo_movimiento === 'intercompany');
  const reconOk = all.filter(m => getMovementReconStatus(m) !== 'sin_conciliar').length;
  const reconPend = all.filter(m => getMovementReconStatus(m) === 'sin_conciliar').length;
  const reconDup = all.filter(m => ['conc_gasto','conc_ingreso','conc_intercompany'].includes(getMovementReconStatus(m))).length;
  const reconNoop = all.filter(m => getMovementReconStatus(m) === 'no_operativo').length;
  const divs = inter.filter(m => m.tipo_intercompany === 'dividendo').reduce((s,m)=>s+Math.abs(Number(m.importe)||0),0);
  const loans = inter.filter(m => m.tipo_intercompany === 'prestamo_intercompany').reduce((s,m)=>s+Math.abs(Number(m.importe)||0),0);
  set('mb-total', all.length); set('mb-total-s', empresaActual === 'Global' ? 'Todas las empresas' : empresaActual);
  set('mb-pend', pend); set('mb-val', val); set('mb-inc', inc);
  set('mb-ic-total', eur(inter.reduce((s,m)=>s+Math.abs(Number(m.importe)||0),0))); set('mb-ic-s', inter.length + ' movimiento(s)');
  set('mb-ic-div', eur(divs)); set('mb-ic-loan', eur(loans));
  set('mb-recon-ok', reconOk); set('mb-recon-pend', reconPend); set('mb-recon-dup', reconDup); set('mb-recon-noop', reconNoop);
  set('mb-filter-info', `${rows.length} mostrados`);
  mkChart('c-mov-estados', 'doughnut', ['Pendientes','Validados','Incidencias'], [{ data: [pend, val, inc], backgroundColor: ['#D4502A','#1A9E72','#B87318'], borderWidth: 0 }]);
  const pos = validatedBankPosition(all);
  mkChart('c-mov-saldos', 'bar', pos.map(m => (m.empresa ? m.empresa + ' · ' : '') + (m.banco || m.cuenta || 'Cuenta')), [{ data: pos.map(m => Number(m.saldo)||0), backgroundColor:'#1B5FA8', borderRadius:5 }]);
  const tbody = document.getElementById('tb-movimientos');
  if (!tbody) return;
  const cats = gastoCategorias();
  tbody.innerHTML = rows.slice(0, 300).map(m => {
    const cls = m.estado_clasificacion === 'auto' ? '<span class="pill pg">Auto</span>' : (m.cuenta_asociada ? '<span class="pill pb">Manual</span>' : '<span class="pill pz">Sin clasificar</span>');
    const catOptions = [''].concat(cats).map(c => `<option value="${c}" ${String(m.cuenta_asociada || m.categoria_asociada || '')===c?'selected':''}>${c || 'Sin cuenta'}</option>`).join('');
    const conceptoCorto = escHtml(m.concepto || '—');
    const detalle = movementDetailHtml(m);
    const row = `<tr class="mov-row" onclick="rowClickToggle(event,'${m.id}')">
      <td>${fdate(m.fecha)}</td>
      <td><span class="sigla" title="${escAttr(m.empresa || '')}">${empresaSigla(m.empresa)}</span></td>
      <td><span class="bank-icon" title="${escAttr(m.banco || '')}">${bankIconLabel(m.banco)}</span></td>
      <td class="tr" style="font-weight:800;color:${(Number(m.importe)||0)>=0?'var(--green)':'var(--red)'}">${eur(Number(m.importe)||0)}</td>
      <td><select onchange="setMovimientoCategoria('${m.id}',this.value)" style="width:190px;padding:7px 9px;border:1px solid var(--border2);border-radius:9px;background:var(--bg);font-family:'DM Sans';font-size:12px">${catOptions}</select><br>${cls} <button class="eb" style="font-size:11px;padding:3px 7px;margin-top:4px" onclick="learnRuleFromMovimiento('${m.id}')" title="Guardar regla y aplicar a conceptos similares">Aprender</button></td>
      <td><input class="compact-check" type="checkbox" ${m.validado ? 'checked' : ''} onchange="setMovimientoField('${m.id}','validado',this.checked)"></td>
      <td><input class="compact-check" type="checkbox" ${m.incidencia ? 'checked' : ''} onchange="setMovimientoField('${m.id}','incidencia',this.checked)"></td>
      <td><strong>${conceptoCorto}</strong><br><span style="font-size:12px;color:var(--text3)">${getMovementReconLabel(m)} ${getImpactLabel(m)}</span></td>
    </tr>`;
    return row + detalle;
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:26px">Sin movimientos bancarios. Sube un Excel o CSV para empezar a validar la tesorería.</td></tr>';
  renderIntercompanyTable(all);
  renderConciliacionTable(all);
}
function exportBankMovementsCSV() {
  const rows = filterBankMovements();
  const headers = ['fecha','empresa','banco','cuenta','concepto','referencia','cuenta_asociada','tipo_movimiento','es_intercompany','tipo_intercompany','empresa_origen','empresa_destino','impacto_resultado','estado_clasificacion','importe','saldo','validado','incidencia','nota_incidencia','archivo_origen'];
  const csv = [headers.join(';'), ...rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g,'""')}"`).join(';'))].join('\n');
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'movimientos_bancarios.csv'; a.click(); URL.revokeObjectURL(a.href);
}


function gastoKey(g) {
  const raw = [g.fecha||'', g.empresa||'', g.concepto||'', g.proveedor||'', g.fuente_gasto||'', g.importe||0].join('|');
  try { return btoa(unescape(encodeURIComponent(raw))).replace(/=+$/,''); }
  catch(e) { return raw.replace(/[^a-zA-Z0-9]/g,'_').slice(0,90); }
}
function normEstadoGasto(v) { return normTxt(v || ''); }
function gastoPendiente(g) {
  const e = normEstadoGasto(g.estado);
  return e.includes('pend') || e.includes('no pag') || e.includes('sin pagar') || e.includes('por pagar');
}
function gastoPagado(g) {
  const e = normEstadoGasto(g.estado);
  return e.includes('pagad') || e === 'ok' || e.includes('abonad');
}
function getGastoFechaPago(g) { return localStorage.getItem('gasto_pago_est_' + gastoKey(g)) || g.fecha_pago || g.fecha_estimada_pago || ''; }
function setGastoFechaPago(key, value) {
  if (value) localStorage.setItem('gasto_pago_est_' + key, value);
  else localStorage.removeItem('gasto_pago_est_' + key);
  renderGastos();
  renderPrev();
}
function fechaFlujoGasto(g) {
  return gastoPendiente(g) ? (getGastoFechaPago(g) || g.fecha) : g.fecha;
}
function estadoGastoBadge(g) {
  const estado = (g.estado || '').trim() || 'Sin estado';
  if (gastoPendiente(g)) return `<span class="pill pr" style="font-size:10px">${estado}</span>`;
  if (gastoPagado(g)) return `<span class="pill pg" style="font-size:10px">${estado}</span>`;
  return `<span class="pill pz" style="font-size:10px">${estado}</span>`;
}

function ymdLocal(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return x.toISOString().slice(0,10);
}

function gastoFechaVencimiento(g) {
  return getGastoFechaPago(g) || g.fecha || '';
}

function gastoPendienteBucket(g) {
  if (!gastoPendiente(g)) return '';
  const f = gastoFechaVencimiento(g);
  if (!f) return 'sin_fecha';
  const today = new Date();
  const t0 = ymdLocal(today);
  const d15 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 15);
  const d30 = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30);
  const t15 = ymdLocal(d15);
  const t30 = ymdLocal(d30);
  if (f < t0) return 'pasado';
  if (f <= t15) return 'prox15';
  if (f <= t30) return 'prox30';
  return 'futuro';
}

function gastoPendienteResumen(gastos) {
  const out = {
    total: { rows: [], importe: 0 },
    pasado: { rows: [], importe: 0 },
    prox15: { rows: [], importe: 0 },
    prox30: { rows: [], importe: 0 },
    futuro: { rows: [], importe: 0 },
    sin_fecha: { rows: [], importe: 0 },
    resto: { rows: [], importe: 0 },
    pagado: { rows: [], importe: 0 },
  };
  gastos.forEach(g => {
    const imp = Number(g.importe) || 0;
    if (gastoPendiente(g)) {
      out.total.rows.push(g); out.total.importe += imp;
      const b = gastoPendienteBucket(g);
      if (out[b]) { out[b].rows.push(g); out[b].importe += imp; }
      if (b === 'futuro' || b === 'sin_fecha') { out.resto.rows.push(g); out.resto.importe += imp; }
    }
    if (gastoPagado(g)) { out.pagado.rows.push(g); out.pagado.importe += imp; }
  });
  return out;
}

function renderGastos() {
  const gastos = filtrarEmp(D.gastos, 'empresa');
  const tot = gastos.reduce((s, g) => s + (g.importe || 0), 0);
  const pr = gastoPendienteResumen(gastos);
  const pend = pr.total.rows;
  const pendSinFecha = pr.sin_fecha.rows.length;
  set('g-tot', eur(tot)); set('g-cnt', gastos.length + ' transacciones');
  set('g-pend', eur(pr.total.importe));
  set('g-pend-s', pend.length + ' pendientes' + (pendSinFecha ? ' · ' + pendSinFecha + ' sin fecha' : ''));
  set('g-pend-pas', eur(pr.pasado.importe));
  set('g-pend-pas-s', pr.pasado.rows.length + ' vencidos');
  set('g-pend-15', eur(pr.prox15.importe));
  set('g-pend-15-s', pr.prox15.rows.length + ' pagos previstos');
  set('g-pend-30', eur(pr.prox30.importe));
  set('g-pend-30-s', pr.prox30.rows.length + ' pagos previstos');
  set('g-pend-resto', eur(pr.resto.importe));
  set('g-pend-resto-s', pr.resto.rows.length + ' sin fecha o > 30 días');
  set('g-paid', eur(pr.pagado.importe));
  set('g-paid-s', pr.pagado.rows.length + ' pagados');
  const pc = {}; gastos.forEach(g => { if (g.fuente_gasto && g.importe) pc[g.fuente_gasto] = (pc[g.fuente_gasto] || 0) + g.importe; });
  const cats = Object.entries(pc).sort((a,b) => b[1]-a[1]);
  set('g-cat', cats[0]?.[0] || '—'); set('g-cat-v', cats[0] ? eur(cats[0][1]) : '');
  set('g-prov', new Set(gastos.map(g => g.proveedor).filter(Boolean)).size);
  mkChart('c-g-cat', 'doughnut', cats.slice(0,7).map(c => c[0]),
    [{ data: cats.slice(0,7).map(c => c[1]), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 4 }], { cutout: '60%' });
  const gm = {}; gastos.forEach(g => { if (g.fecha) { const m = String(g.fecha).slice(5,7); gm[m] = (gm[m]||0) + (g.importe||0); } });
  const gms = Object.keys(gm).sort();
  mkChart('c-g-mes', 'bar', gms.map(m => MS[+m-1]), [{ data: gms.map(m => gm[m]), backgroundColor: '#D4502A', borderRadius: 5 }]);

  // Populate filter dropdowns
  const meses = [...new Set(gastos.map(g => g.fecha ? String(g.fecha).slice(0,7) : '').filter(Boolean))].sort();
  const emprs = [...new Set(gastos.map(g => g.empresa).filter(Boolean))].sort();
  const formas = [...new Set(gastos.map(g => g.forma_pago).filter(Boolean))].sort();
  const estados = [...new Set(gastos.map(g => g.estado).filter(Boolean))].sort();
  const selM = document.getElementById('g-mes-f');
  const curM = selM.value;
  selM.innerHTML = '<option value="">Todos los meses</option>' + meses.map(m => `<option value="${m}" ${m===curM?'selected':''}>${M[+m.slice(5)-1]} ${m.slice(0,4)}</option>`).join('');
  const selE = document.getElementById('g-emp-f');
  const curE = selE.value;
  selE.innerHTML = '<option value="">Todas las empresas</option>' + emprs.map(e => `<option value="${e}" ${e===curE?'selected':''}>${e}</option>`).join('');
  document.getElementById('g-cf').innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c => `<option>${c[0]}</option>`).join('');
  const selFP = document.getElementById('g-fp-f');
  const curFP = selFP.value;
  selFP.innerHTML = '<option value="">Todas las formas de pago</option>' + formas.map(f => `<option value="${f}" ${f===curFP?'selected':''}>${f}</option>`).join('');
  const selEst = document.getElementById('g-estado-f');
  const curEst = selEst.value;
  selEst.innerHTML = '<option value="">Todos los estados</option>' + estados.map(e => `<option value="${e}" ${e===curEst?'selected':''}>${e}</option>`).join('') +
    '<option value="__pend_pasados" '+(curEst==='__pend_pasados'?'selected':'')+'>Pendientes pasados</option>' +
    '<option value="__pend_15" '+(curEst==='__pend_15'?'selected':'')+'>Pendientes próximos 15 días</option>' +
    '<option value="__pend_mes" '+(curEst==='__pend_mes'?'selected':'')+'>Pendientes próximo mes</option>' +
    '<option value="__pend_resto" '+(curEst==='__pend_resto'?'selected':'')+'>Pendiente resto</option>' +
    '<option value="__pend_sin_fecha" '+(curEst==='__pend_sin_fecha'?'selected':'')+'>Pendientes sin fecha</option>';
  filterG();
}

function filterG() {
  const q = (document.getElementById('g-q').value || '').toLowerCase();
  const cf = document.getElementById('g-cf').value;
  const mesF = document.getElementById('g-mes-f').value;
  const empF = document.getElementById('g-emp-f').value;
  const fpF = document.getElementById('g-fp-f').value;
  const estadoF = document.getElementById('g-estado-f').value;
  const base = filtrarEmp(D.gastos, 'empresa');
  const rows = base.filter(g =>
    (!q || [g.concepto,g.proveedor,g.fuente_gasto,g.empresa].some(f => f?.toLowerCase().includes(q))) &&
    (!cf || g.fuente_gasto === cf) &&
    (!mesF || (g.fecha && String(g.fecha).startsWith(mesF))) &&
    (!empF || g.empresa === empF) &&
    (!fpF || g.forma_pago === fpF) &&
    (!estadoF ||
      (estadoF === '__pend_sin_fecha' ? (gastoPendiente(g) && gastoPendienteBucket(g) === 'sin_fecha') :
       estadoF === '__pend_pasados' ? (gastoPendiente(g) && gastoPendienteBucket(g) === 'pasado') :
       estadoF === '__pend_15' ? (gastoPendiente(g) && gastoPendienteBucket(g) === 'prox15') :
       estadoF === '__pend_mes' ? (gastoPendiente(g) && gastoPendienteBucket(g) === 'prox30') :
       estadoF === '__pend_resto' ? (gastoPendiente(g) && ['futuro','sin_fecha'].includes(gastoPendienteBucket(g))) :
       g.estado === estadoF))
  );
  const totFil = rows.reduce((s,g)=>s+(g.importe||0),0);
  set('g-count-tag', rows.length + ' registros · ' + eur(totFil));
  document.getElementById('tb-g').innerHTML = rows.slice(0,500).map(g => {
    const k = gastoKey(g);
    const fechaEst = getGastoFechaPago(g);
    const disabled = gastoPendiente(g) ? '' : 'disabled';
    const title = gastoPendiente(g) ? 'Fecha estimada de pago para previsión de caja' : 'Solo editable cuando el gasto está pendiente';
    return `<tr><td style="font-size:12px;color:var(--text3)">${fdate(g.fecha)}</td><td style="font-size:12px;color:var(--text2)">${g.empresa||'—'}</td><td>${g.concepto||'—'}</td><td style="font-size:12px;color:var(--text2)">${g.proveedor||'—'}</td><td><span class="pill pb" style="font-size:10px">${g.fuente_gasto||'—'}</span></td><td style="font-size:12px;color:var(--text3)">${g.forma_pago||'—'}</td><td>${estadoGastoBadge(g)}</td><td><input type="date" value="${fechaEst}" ${disabled} title="${title}" onchange="setGastoFechaPago('${k}', this.value)" style="width:135px;padding:5px 7px;border:1px solid var(--border2);border-radius:7px;background:${gastoPendiente(g)?'var(--bg)':'var(--bg2)'};color:var(--text);font-family:'DM Sans';font-size:12px"></td><td class="tr" style="font-weight:600">${eur(g.importe)}</td></tr>`;
  }).join('');
}



function renderIngresos() {
  const ingresos = ingresosFiltradosEmpresa();
  const total = ingresos.reduce((s,i)=>s+(Number(i.importe)||0),0);
  const iva = ingresos.reduce((s,i)=>s+(Number(i.iva)||0),0);
  const pend = ingresos.filter(ingresoPendiente);
  const pendTot = pend.reduce((s,i)=>s+(Number(i.importe)||0),0);
  const meses = {};
  ingresos.forEach(i => { const m = String(i.fecha||'').slice(5,7); if (m) meses[m] = (meses[m]||0) + (Number(i.importe)||0); });
  const mk = Object.keys(meses).sort();
  const ultimoMes = mk[mk.length-1] || '';
  set('i-tot', eur(total)); set('i-cnt', ingresos.length + ' registros');
  set('i-mes', eur(ultimoMes ? meses[ultimoMes] : 0)); set('i-mes-s', ultimoMes ? M[+ultimoMes-1] : 'Sin mes');
  set('i-iva', eur(iva));
  set('i-pend', eur(pendTot)); set('i-pend-s', pend.length + ' pendiente(s)');

  mkChart('c-i-mes', 'bar', mk.map(m => MS[+m-1]), [{ data: mk.map(m=>meses[m]), backgroundColor: '#1B5FA8', borderRadius: 5 }]);
  const byEmp = {}; ingresos.forEach(i => { const e = i.empresa || 'Sin empresa'; byEmp[e] = (byEmp[e]||0) + (Number(i.importe)||0); });
  const ek = Object.keys(byEmp).sort();
  mkChart('c-i-emp', 'doughnut', ek, [{ data: ek.map(e=>byEmp[e]), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 4 }], { cutout: '60%' });
  const byIva = {}; ingresos.forEach(i => { const m = String(i.fecha||'').slice(5,7); if (m) byIva[m] = (byIva[m]||0) + (Number(i.iva)||0); });
  const ik = Object.keys(byIva).sort();
  mkChart('c-i-iva', 'bar', ik.map(m => MS[+m-1]), [{ data: ik.map(m=>byIva[m]), backgroundColor: '#B87318', borderRadius: 5 }]);
  const byFp = {}; ingresos.forEach(i => { const fp = i.forma_pago || 'Sin forma'; byFp[fp] = (byFp[fp]||0) + (Number(i.importe)||0); });
  const fk = Object.keys(byFp).sort();
  mkChart('c-i-fp', 'doughnut', fk, [{ data: fk.map(f=>byFp[f]), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 4 }], { cutout: '60%' });

  const fill = (id, vals, label) => {
    const el = document.getElementById(id); if (!el) return;
    const cur = el.value;
    el.innerHTML = `<option value="">${label}</option>` + vals.map(v => `<option value="${v}">${v}</option>`).join('');
    if (vals.includes(cur)) el.value = cur;
  };
  fill('i-mes-f', [...new Set(ingresos.map(i=>String(i.fecha||'').slice(0,7)).filter(Boolean))].sort(), 'Todos los meses');
  fill('i-emp-f', [...new Set(ingresos.map(i=>i.empresa).filter(Boolean))].sort(), 'Todas las empresas');
  fill('i-estado-f', [...new Set(ingresos.map(i=>i.estado || 'Sin estado'))].sort(), 'Todos los estados');
  fill('i-fp-f', [...new Set(ingresos.map(i=>i.forma_pago || 'Sin forma'))].sort(), 'Todas las formas de pago');
  filterI(false);
}

function filterI(updateCharts = true) {
  let rows = ingresosFiltradosEmpresa();
  const q = normTxt(document.getElementById('i-q')?.value || '');
  const mes = document.getElementById('i-mes-f')?.value || '';
  const emp = document.getElementById('i-emp-f')?.value || '';
  const estado = document.getElementById('i-estado-f')?.value || '';
  const fp = document.getElementById('i-fp-f')?.value || '';
  if (q) rows = rows.filter(i => normTxt([i.factura,i.concepto,i.proveedor,i.empresa,i.estado,i.forma_pago].join(' ')).includes(q));
  if (mes) rows = rows.filter(i => String(i.fecha||'').slice(0,7) === mes);
  if (emp) rows = rows.filter(i => (i.empresa||'') === emp);
  if (estado) rows = rows.filter(i => (i.estado || 'Sin estado') === estado);
  if (fp) rows = rows.filter(i => (i.forma_pago || 'Sin forma') === fp);
  set('i-count-tag', rows.length + ' registros · ' + eur(rows.reduce((s,i)=>s+(Number(i.importe)||0),0)));
  const tbody = document.getElementById('tb-i');
  if (!tbody) return;
  tbody.innerHTML = rows.slice(0, 500).map(i => `<tr><td style="color:var(--text3)">${i.fecha||'—'}</td><td>${i.empresa||'—'}</td><td style="font-weight:500">${i.factura||'—'}</td><td>${i.concepto||'—'}</td><td>${i.proveedor||'—'}</td><td>${estadoIngresoBadge(i)}</td><td style="font-size:12px;color:var(--text3)">${i.forma_pago||'—'}</td><td class="tr" style="font-weight:600">${eur(i.importe)}</td><td class="tr">${i.iva ? eur(i.iva) : '—'}</td></tr>`).join('');
}

const PREV_SCENARIOS = [
  { id: 'objetivo', label: 'Ventas objetivo', mult: 1 },
  { id: 'objetivo5', label: 'Objetivo + 5%', mult: 1.05 },
  { id: 'objetivo10', label: 'Objetivo + 10%', mult: 1.10 },
];
let prevScenarioId = 'objetivo';
let PREV_CONFIG = { opening: null, ventas: {}, gastos: {} };
let PREV_CONFIG_LOADED_FOR = null;
let PREV_SAVE_TIMER = null;

function prevCfgKey() { return 'prev_config_' + empresaActual + '_2026'; }
function safeNum(v) { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : null; }
function normPrevConfig(cfg) {
  cfg = cfg && typeof cfg === 'object' ? cfg : {};
  cfg.opening = cfg.opening ?? null;
  cfg.ventas = cfg.ventas && typeof cfg.ventas === 'object' ? cfg.ventas : {};
  cfg.gastos = cfg.gastos && typeof cfg.gastos === 'object' ? cfg.gastos : {};
  return cfg;
}
function setPrevStatus(msg, cls='') {
  const el = document.getElementById('prev-save-status');
  if (el) { el.innerHTML = msg || ''; el.style.color = cls === 'err' ? 'var(--red)' : cls === 'ok' ? 'var(--green)' : 'var(--text3)'; }
}
function loadPrevConfigLocal() {
  try { PREV_CONFIG = normPrevConfig(JSON.parse(localStorage.getItem(prevCfgKey()) || '{}')); }
  catch (_) { PREV_CONFIG = normPrevConfig({}); }
  PREV_CONFIG_LOADED_FOR = empresaActual;
}
async function loadPrevConfigFromSupabase() {
  loadPrevConfigLocal();
  if (!sb) { setPrevStatus('Previsión cargada localmente. Configura Supabase para compartirla.'); return; }
  const { data, error } = await sb.from('prevision_config').select('config').eq('empresa', empresaActual).eq('anio', 2026).maybeSingle();
  if (error) {
    setPrevStatus('Previsión en modo local: crea la tabla prevision_config en Supabase.', 'err');
    console.warn('No se pudo cargar prevision_config:', error.message);
    return;
  }
  if (data && data.config) {
    PREV_CONFIG = normPrevConfig(data.config);
    localStorage.setItem(prevCfgKey(), JSON.stringify(PREV_CONFIG));
  }
  PREV_CONFIG_LOADED_FOR = empresaActual;
  setPrevStatus('Previsión cargada desde Supabase.', 'ok');
}
async function savePrevConfigToSupabase(showAlert=false) {
  PREV_CONFIG = normPrevConfig(PREV_CONFIG);
  localStorage.setItem(prevCfgKey(), JSON.stringify(PREV_CONFIG));
  if (!sb) { setPrevStatus('Guardado local. Configura Supabase para compartirlo.'); return; }
  setPrevStatus('Guardando previsión en Supabase...');
  const payload = { empresa: empresaActual, anio: 2026, config: PREV_CONFIG, updated_at: new Date().toISOString() };
  const { error } = await sb.from('prevision_config').upsert(payload, { onConflict: 'empresa,anio' });
  if (error) {
    setPrevStatus('No se pudo guardar en Supabase. Revisa que exista la tabla prevision_config.', 'err');
    console.error('Error guardando prevision_config:', error);
    if (showAlert) alert('No se pudo guardar en Supabase: ' + error.message + '\n\nCrea la tabla prevision_config con el SQL indicado. De momento queda guardado localmente.');
    return;
  }
  setPrevStatus('Previsión guardada en Supabase.', 'ok');
}
function queueSavePrevConfig() {
  clearTimeout(PREV_SAVE_TIMER);
  PREV_SAVE_TIMER = setTimeout(() => savePrevConfigToSupabase(false), 500);
}
function setPrevOpening(value) {
  const n = safeNum(value);
  PREV_CONFIG.opening = n == null ? null : n;
  renderPrev();
  queueSavePrevConfig();
}
function setPrevScenario(id) { prevScenarioId = id; renderPrev(); }
function setPrevVentaBase(mes, value) {
  const n = safeNum(value);
  PREV_CONFIG.ventas[String(mes)] = n == null ? undefined : n;
  if (n == null) delete PREV_CONFIG.ventas[String(mes)];
  renderPrev();
  queueSavePrevConfig();
}
function setPrevGasto(partidaEnc, mes, value) {
  const partida = decodeURIComponent(partidaEnc);
  const n = safeNum(value);
  PREV_CONFIG.gastos[partida] = PREV_CONFIG.gastos[partida] || {};
  if (n == null) delete PREV_CONFIG.gastos[partida][String(mes)];
  else PREV_CONFIG.gastos[partida][String(mes)] = n;
  renderPrev();
  queueSavePrevConfig();
}
function getPrevOpening() {
  if (PREV_CONFIG.opening != null && Number.isFinite(Number(PREV_CONFIG.opening))) return Number(PREV_CONFIG.opening);
  const latest = latestTesRecord();
  return Number(latest.total_caja_operativa) || 0;
}
function getPrevGastosBase() {
  const all = Array.isArray(D.gastos) ? D.gastos : [];
  const filtered = filtrarEmp(all, 'empresa');
  // Si una empresa no tiene gastos propios todavía, usamos los gastos globales para que la previsión no quede vacía.
  if (filtered.length || empresaActual === 'Global') return filtered;
  return all;
}
function getPrevCategoriasGastosGenerales(gastos) {
  // Debe coincidir con el módulo Gastos: columna "Fuente de gasto" del Excel GastosGenerales.
  // Incluye todas las partidas aunque no tengan movimiento en algún mes para que el editor anual sea completo.
  return [...new Set((gastos || []).map(g => (g.fuente_gasto || 'Sin categoría').trim() || 'Sin categoría'))]
    .sort((a,b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
}

function buildPrevData() {
  if (PREV_CONFIG_LOADED_FOR !== empresaActual) loadPrevConfigLocal();
  PREV_CONFIG = normPrevConfig(PREV_CONFIG);
  const gastos = getPrevGastosBase();
  const byCat = {};
  let cats = getPrevCategoriasGastosGenerales(gastos);
  cats.forEach(cat => { byCat[cat] = {}; });

  gastos.forEach(g => {
    const cat = (g.fuente_gasto || 'Sin categoría').trim() || 'Sin categoría';
    if (!byCat[cat]) byCat[cat] = {};
    const fg = fechaFlujoGasto(g);
    if (!fg) return;
    const m = +String(fg).slice(5,7);
    if (!m || m < 1 || m > 12) return;
    byCat[cat][m] = (byCat[cat][m] || 0) + (Number(g.importe) || 0);
  });

  // Mantiene exactamente las partidas de Gastos Generales y su orden alfabético, no solo las que tienen importe.
  cats = Object.keys(byCat).sort((a,b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  if (!cats.length) {
    // Solo si todavía no hay gastos sincronizados. En cuanto haya GastosGenerales, desaparece este fallback.
    ['Banco','Deuda Proveedores','Gasto Financiacion','Impuestos','Informatica','Mantenimiento','Otros','Papeleria','Suministros'].forEach(cat => { byCat[cat] = {}; });
    cats = Object.keys(byCat).sort((a,b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }
  const expenseRows = cats.map(cat => {
    const q1avg = ((byCat[cat][1]||0) + (byCat[cat][2]||0) + (byCat[cat][3]||0)) / 3;
    const vals = Array.from({length:12}, (_,i)=>byCat[cat][i+1]||0).filter(v => v > 0);
    const fallback = vals.length ? vals.reduce((s,v)=>s+v,0) / vals.length : 0;
    const monthly = {}, source = {};
    for (let m=1; m<=12; m++) {
      let val = byCat[cat][m];
      let src = val > 0 ? 'Real' : (q1avg > 0 ? 'Media T1' : (fallback > 0 ? 'Media disponible' : 'Sin dato'));
      if (!(val > 0)) val = q1avg > 0 ? q1avg : fallback;
      const edit = PREV_CONFIG.gastos?.[cat]?.[String(m)];
      if (edit != null && Number.isFinite(Number(edit))) { val = Number(edit); src = 'Editado Supabase'; }
      monthly[m] = Math.max(0, Number(val) || 0);
      source[m] = src;
    }
    return { cat, q1avg, monthly, source, total: Array.from({length:12}, (_,i)=>monthly[i+1]||0).reduce((s,v)=>s+v,0) };
  });
  const ventasBase = {}, ventasOrigen = {};
  for (let m=1; m<=12; m++) {
    const edit = PREV_CONFIG.ventas?.[String(m)];
    ventasBase[m] = edit != null && Number.isFinite(Number(edit)) ? Number(edit) : (OBJ[m] || 0);
    ventasOrigen[m] = edit != null ? 'Editado Supabase' : 'Objetivo';
  }
  const scenario = PREV_SCENARIOS.find(s=>s.id===prevScenarioId) || PREV_SCENARIOS[0];
  const monthly = [];
  let tes = getPrevOpening();
  for (let m=1; m<=12; m++) {
    const ingresos = (ventasBase[m] || 0) * scenario.mult;
    const gastosMes = expenseRows.reduce((s,r)=>s+(r.monthly[m]||0),0);
    const balance = ingresos - gastosMes;
    tes += balance;
    monthly.push({ m, mes: M[m-1], ingresos, gastos: gastosMes, balance, tesoreria: tes });
  }
  return { scenario, opening: getPrevOpening(), ventasBase, ventasOrigen, expenseRows, monthly, totalIngresos: monthly.reduce((s,r)=>s+r.ingresos,0), totalGastos: monthly.reduce((s,r)=>s+r.gastos,0), totalBalance: monthly.reduce((s,r)=>s+r.balance,0), tesoreriaFinal: monthly[11]?.tesoreria || getPrevOpening() };
}
function renderPrev() {
  const data = buildPrevData();
  const openingEl = document.getElementById('prev-opening');
  if (openingEl && document.activeElement !== openingEl) openingEl.value = Math.round(data.opening || 0);
  const scenEl = document.getElementById('prev-scenarios');
  if (scenEl) scenEl.innerHTML = PREV_SCENARIOS.map(s => `<button class="eb ${data.scenario.id===s.id?'active':''}" onclick="setPrevScenario('${s.id}')">${s.label}</button>`).join('');
  set('pa-ing', eur(data.totalIngresos)); set('pa-ing-s', data.scenario.label);
  set('pa-gas', eur(data.totalGastos)); set('pa-gas-s', data.expenseRows.length + ' partidas de Gastos Generales' + (getPrevGastosBase().length ? '' : ' · pendiente sincronizar gastos'));
  set('pa-bal', (data.totalBalance >= 0 ? '+' : '') + eur(data.totalBalance)); setC('pa-bal', 'mv ' + (data.totalBalance >= 0 ? 'up' : 'dn')); set('pa-bal-s', 'Ingresos - gastos');
  set('pa-tes', eur(data.tesoreriaFinal)); setC('pa-tes', 'mv ' + (data.tesoreriaFinal >= 0 ? 'up' : 'dn')); set('pa-tes-s', 'Partiendo de ' + eur(data.opening));
  mkChart('c-prev-anual', 'bar', data.monthly.map(r=>MS[r.m-1]), [
    { label:'Ingresos', data:data.monthly.map(r=>Math.round(r.ingresos)), backgroundColor:'#1B5FA8', borderRadius:4, barPercentage:0.72 },
    { label:'Gastos', data:data.monthly.map(r=>Math.round(r.gastos)), backgroundColor:'#D4502A', borderRadius:4, barPercentage:0.72 },
    { label:'Tesorería prevista', type:'line', data:data.monthly.map(r=>Math.round(r.tesoreria)), borderColor:'#1A9E72', backgroundColor:'#1A9E72', tension:0.25, pointRadius:3 }
  ], { plugins:{ legend:{ display:true, labels:{ boxWidth:10, font:{ family:'DM Sans', size:11 } } }, tooltip:{ callbacks:{ label:c=>eur(c.raw) } } } });
  const sorted = data.expenseRows.slice().sort((a,b)=>b.total-a.total);
  const top = sorted.slice(0,6), rest = sorted.slice(6);
  const ds = top.map((r,i)=>({ label:r.cat, data:Array.from({length:12},(_,j)=>Math.round(r.monthly[j+1]||0)), backgroundColor:COLORS[i%COLORS.length], stack:'g' }));
  if (rest.length) ds.push({ label:'Resto', data:Array.from({length:12},(_,j)=>Math.round(rest.reduce((s,r)=>s+(r.monthly[j+1]||0),0))), backgroundColor:'#C9C6C0', stack:'g' });
  mkChart('c-prev-part', 'bar', MS, ds, { plugins:{ legend:{ display:true, labels:{ boxWidth:10, font:{ family:'DM Sans', size:11 } } }, tooltip:{ callbacks:{ label:c=>eur(c.raw) } } }, scales:{ x:{ stacked:true, grid:{ color:'rgba(0,0,0,0.04)' }, ticks:{ font:{ size:11, family:'DM Sans' }, color:'#A8A59F' } }, y:{ stacked:true, grid:{ color:'rgba(0,0,0,0.04)' }, ticks:{ font:{ size:11, family:'DM Sans' }, color:'#A8A59F', callback:v=>v>=1000?(v/1000).toFixed(0)+'k':v } } } });
  const tb = document.getElementById('tb-prev-annual');
  if (tb) tb.innerHTML = data.monthly.map(r=>`<tr><td style="font-weight:500">${r.mes}</td><td class="tr">${eur(r.ingresos)}</td><td class="tr">${eur(r.gastos)}</td><td class="tr" style="font-weight:600;color:${r.balance>=0?'var(--green)':'var(--red)'}">${r.balance>=0?'+':''}${eur(r.balance)}</td><td class="tr" style="font-weight:600;color:${r.tesoreria>=0?'var(--green)':'var(--red)'}">${eur(r.tesoreria)}</td></tr>`).join('');
  const ventasRow = `<tr><td style="font-weight:600">Ventas base</td><td style="font-size:12px;color:var(--text3)">Objetivo editable</td>${Array.from({length:12},(_,i)=>{const m=i+1;return `<td><input type="number" value="${Math.round(data.ventasBase[m]||0)}" onchange="setPrevVentaBase(${m}, this.value)" style="width:92px;padding:5px 7px;border:1px solid var(--border2);border-radius:7px;background:var(--bg);font-family:'DM Sans';font-size:12px"></td>`}).join('')}<td class="tr" style="font-weight:600">${eur(Object.values(data.ventasBase).reduce((s,v)=>s+(v||0),0))}</td></tr>`;
  const rowsHtml = data.expenseRows.map(r=>{ const enc=encodeURIComponent(r.cat); return `<tr><td style="font-weight:500">${r.cat}</td><td style="font-size:12px;color:var(--text3)">Media T1: ${eur(r.q1avg)}</td>${Array.from({length:12},(_,i)=>{const m=i+1, src=r.source[m]||''; return `<td><input type="number" value="${Math.round(r.monthly[m]||0)}" onchange="setPrevGasto('${enc}', ${m}, this.value)" title="${src}" style="width:92px;padding:5px 7px;border:1px solid var(--border2);border-radius:7px;background:${src.startsWith('Editado')?'#F4EDE2':'var(--bg)'};font-family:'DM Sans';font-size:12px"></td>`}).join('')}<td class="tr" style="font-weight:600">${eur(r.total)}</td></tr>`; }).join('');
  const editTb = document.getElementById('tb-prev-edit'); if (editTb) editTb.innerHTML = ventasRow + rowsHtml;
  const edits = (PREV_CONFIG.opening != null ? 1 : 0) + Object.keys(PREV_CONFIG.ventas||{}).length + Object.values(PREV_CONFIG.gastos||{}).reduce((s,o)=>s+Object.keys(o||{}).length,0);
  set('prev-edit-info', edits ? edits + ' ajuste' + (edits!==1?'s':'') + ' guardado' + (edits!==1?'s':'') : 'Sin ajustes manuales');
}

function renderFins() {
  const tot = D.fins.reduce((s, f) => s + (f.financiado || 0), 0);
  const coms = D.fins.reduce((s, f) => s + (f.comision || 0), 0);
  const dscs = D.fins.reduce((s, f) => s + (f.descuento || 0), 0);
  set('f-tot', eur(tot)); set('f-cnt', D.fins.length + ' operaciones');
  set('f-tkt', eur(D.fins.length ? tot / D.fins.length : 0));
  set('f-com', eur(coms)); set('f-dsc', eur(dscs));
  const bb = {}; D.fins.forEach(f => { if (f.ff) bb[f.ff] = (bb[f.ff] || 0) + (f.financiado || 0); });
  mkChart('c-bancos', 'doughnut', Object.keys(bb), [{ data: Object.values(bb), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 4 }], { cutout: '60%' });
  const bc = {}; D.fins.forEach(f => { if (f.canal) bc[f.canal] = (bc[f.canal] || 0) + 1; });
  mkChart('c-canal', 'doughnut', Object.keys(bc), [{ data: Object.values(bc), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 4 }], { cutout: '60%' });
  filterF();
}

function filterF() {
  const q = document.getElementById('f-q').value.toLowerCase();
  const rows = D.fins.filter(f => !q || [f.nombre, f.nif].some(x => x?.toLowerCase().includes(q)));
  document.getElementById('tb-fin').innerHTML = rows.slice(0,200).map(f =>
    `<tr><td style="font-size:12px;color:var(--text3)">${fdate(f.fecha)}</td><td><span class="pill pb" style="font-size:10px">${f.ff||'—'}</span></td><td style="font-size:12px">${f.nombre||'—'}</td><td style="font-size:12px">${f.canal||'—'}</td><td style="text-align:center">${f.meses||'—'}m</td><td class="tr" style="font-weight:600">${eur(f.financiado)}</td><td class="tr">${eur(f.banco)}</td><td><span class="pill ${f.estado==='PAGADA'?'pg':'pa'}" style="font-size:10px">${f.estado||'—'}</span></td></tr>`
  ).join('');
}

function renderDevs() {
  const tot = D.devs.reduce((s, d) => s + (d.euros_pagados || 0), 0);
  const dv = D.devs.reduce((s, d) => s + (d.euros_devolver || 0), 0);
  const pend = D.devs.filter(d => d.estado === 'PENDIENTE');
  set('d-tot', eur(tot)); set('d-cnt', D.devs.length + ' casos');
  set('d-dev', eur(dv));
  set('d-pend', eur(pend.reduce((s, d) => s + (d.euros_devolver||0), 0)));
  set('d-pend-s', pend.length + ' sin resolver');
  set('d-alert', pend.length > 0 ? `<div class="al aw">⚠️ <strong>${pend.length} devolución${pend.length>1?'es':''} pendiente${pend.length>1?'s':''}</strong> — ${pend.map(p=>p.paciente).join(', ')}</div>` : '');
  document.getElementById('tb-dev').innerHTML = D.devs.map(d =>
    `<tr><td style="font-size:12px;color:var(--text3)">${fdate(d.fecha_solicitud)}</td><td style="font-weight:500">${d.paciente||'—'}</td><td>${eur(d.euros_pagados)}</td><td style="font-weight:600">${eur(d.euros_devolver)}</td><td style="font-size:12px">${d.forma_pago||'—'}</td><td><span class="pill ${d.estado==='RESUELTA'?'pg':'pa'}">${d.estado||'—'}</span></td></tr>`
  ).join('');
}

function renderEquipo() {
  const pl = D.workers.filter(w => w.tipo === 'plantilla');
  const au = D.workers.filter(w => w.tipo === 'autonomo');
  set('e-pl', pl.length); set('e-au', au.length); set('e-tot', D.workers.length);
  const ini = n => n.split(' ').filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  document.getElementById('e-grid').innerHTML = pl.map((w,i) =>
    `<div style="background:var(--bg2);border-radius:11px;padding:12px 14px;display:flex;gap:10px;align-items:flex-start"><div style="width:36px;height:36px;border-radius:18px;background:${COLORS[i%COLORS.length]};display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:600;flex-shrink:0">${ini(w.nombre)}</div><div><p style="font-weight:500;font-size:13px">${w.nombre}</p><p style="font-size:12px;color:var(--text2);margin-top:1px">${w.puesto||'—'}</p>${w.contrato?`<span class="pill pg" style="font-size:10px;margin-top:5px">${w.contrato}</span>`:''}</div></div>`
  ).join('');
  document.getElementById('tb-aut').innerHTML = au.map(w =>
    `<tr><td style="font-weight:500">${w.nombre}</td><td>${w.puesto||'—'}</td><td>${w.jornada||'—'}</td><td class="tr" style="font-weight:600">${w.tarifa_consulta?eur(w.tarifa_consulta):'—'}</td></tr>`
  ).join('');
}

const OBJ = {1:86000,2:88000,3:95000,4:86000,5:90000,6:90000,7:90000,8:55000,9:85000,10:90000,11:75000,12:70000};
function renderObjs() {
  const cajas = filtrarEmp(D.cajas, 'empresa');
  const cm = {}; cajas.forEach(c => { const m = +c.fecha.slice(5,7); cm[m] = (cm[m]||0) + (c.total||0); });
  const data = M.map((mes,i) => {
    const m=i+1, real=cm[m]||null, obj=OBJ[m], diff=real!=null?real-obj:null, pct=real!=null?(real/obj)*100:null;
    return { mes, m, real, obj, diff, pct };
  });
  const cd = data.filter(d => d.real != null);
  const cum = cd.filter(d => d.diff >= 0).length;
  const tR = cd.reduce((s,d)=>s+(d.real||0),0), tO = cd.reduce((s,d)=>s+d.obj,0);
  set('o-cum', cum + ' / ' + cd.length); set('o-cum-s', 'Meses con datos');
  set('o-pct', tO > 0 ? ((tR/tO)*100).toFixed(1)+'%' : '—'); set('o-pct-s', eur(tR)+' vs '+eur(tO));
  const dv = tR - tO; set('o-dev', eur(dv)); setC('o-dev', 'mv '+(dv>=0?'up':'dn'));
  mkChart('c-obj', 'bar', MS, [
    { label: 'Real', data: data.map(d=>d.real||0), backgroundColor: '#1B5FA8', borderRadius: 5, barPercentage: 0.6 },
    { label: 'Objetivo', data: data.map(d=>d.obj), backgroundColor: 'rgba(27,95,168,0.2)', borderRadius: 5, barPercentage: 0.6 },
  ]);
  document.getElementById('tb-obj').innerHTML = data.map(d =>
    `<tr><td style="font-weight:500">${d.mes}</td><td class="tr">${eur(d.obj)}</td><td class="tr">${d.real!=null?eur(d.real):'—'}</td><td class="tr" style="font-weight:600;color:${d.diff==null?'var(--text3)':d.diff>=0?'var(--green)':'var(--red)'}">${d.diff!=null?(d.diff>=0?'+':'')+eur(d.diff):'—'}</td><td class="tr">${d.pct!=null?d.pct.toFixed(1)+'%':'—'}</td><td>${d.real==null?'<span class="pill pz">Pendiente</span>':d.diff>=0?'<span class="pill pg">✓ Cumplido</span>':'<span class="pill pr">No cumplido</span>'}</td></tr>`
  ).join('');
}

// ============================================================
// EXCEL PRIVADO
// ============================================================
function dov(e, d) { e.preventDefault(); document.getElementById('uz').classList.toggle('drag', d); }
function ddrop(e) { e.preventDefault(); document.getElementById('uz').classList.remove('drag'); handleXLS(e.dataTransfer.files[0]); }

async function handleXLS(file) {
  if (!file) return;
  if (!sb) { alert('Configura Supabase primero'); openCfg(); return; }
  if (!requireRole('admin','finanzas')) return;
  const XLSX = await loadXLSX();
  set('uz-txt', '<div style="display:flex;align-items:center;gap:10px;justify-content:center"><div class="sp"></div><span>Procesando ' + file.name + '...</span></div>');
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
      const res = {};
      const jso = name => wb.Sheets[name] ? XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null }) : [];

      // Devoluciones
      const devs = jso('Devoluciones').filter(r => r['PACIENTE']).map(r => ({
        fecha_solicitud: r['FECHA DESOLICITUD'] instanceof Date ? r['FECHA DESOLICITUD'].toISOString().split('T')[0] : null,
        paciente: r['PACIENTE'], euros_pagados: r['€ PAGADOS'], euros_devolver: r['€ A DEVOLVER'],
        forma_pago: r['FORMA DE PAGO'], motivo: r['MOTIVO'],
        fecha_devolucion: r['FECHA DEVOLUCION'] instanceof Date ? r['FECHA DEVOLUCION'].toISOString().split('T')[0] : (r['FECHA DEVOLUCION'] !== 'PENDIENTE' ? r['FECHA DEVOLUCION'] : null)
      }));
      if (devs.length) {
        await sb.from('devoluciones').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await sb.from('devoluciones').insert(devs);
        res['Devoluciones'] = { count: devs.length, error: error?.message };
        D.devs = devs; renderDevs();
      }

      // Trabajadores
      const trabs = jso('Trabajadores').filter(r => r['TRABAJADOR'] && typeof r['TRABAJADOR'] === 'string' && !['AUTÓNOMOS','EX-TRABAJADORES'].includes(r['TRABAJADOR'])).map(r => ({
        nombre: r['TRABAJADOR'], tipo: 'plantilla', puesto: r['PUESTO'], jornada: r['JORNADA'],
        inicio: r['INICIO'] instanceof Date ? r['INICIO'].toISOString().split('T')[0] : null,
        contrato: r['CONTRATO'], bruto: r['BRUTO'], dni: r['DNI'],
        tlf: String(r['TLF'] || ''), email: r['EMAIL']
      }));
      if (trabs.length) {
        await sb.from('trabajadores').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await sb.from('trabajadores').insert(trabs);
        res['Trabajadores'] = { count: trabs.length, error: error?.message };
        D.workers = trabs; renderEquipo();
      }

      set('uz-txt', '<p style="font-size:14px;font-weight:500;margin-bottom:4px">Arrastra el Excel o haz clic</p><p style="font-size:12px;color:var(--text3)">Cuentas_2026.xlsx</p>');
      set('priv-result', `<div class="al as2">✓ <strong>${file.name} procesado correctamente</strong></div><div class="card"><table><thead><tr><th>Sección</th><th class="tr">Registros</th><th>Estado</th></tr></thead><tbody>${Object.entries(res).map(([k,v])=>`<tr><td style="font-weight:500">${k}</td><td class="tr">${v.count}</td><td>${v.error?`<span class="pill pr" style="font-size:10px">${v.error.slice(0,40)}</span>`:'<span class="pill pg" style="font-size:10px">✓ OK</span>'}</td></tr>`).join('')}</tbody></table></div>`);
    } catch (err) {
      set('uz-txt', '<p style="font-size:14px;font-weight:500;margin-bottom:4px">Arrastra el Excel o haz clic</p><p style="font-size:12px;color:var(--text3)">Cuentas_2026.xlsx</p>');
      set('priv-result', `<div class="al ae">❌ Error: ${err.message}</div>`);
    }
  };
  reader.readAsArrayBuffer(file);
}

let _xlsx = null;
async function loadXLSX() {
  if (_xlsx) return _xlsx;
  await new Promise(r => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = r; document.head.appendChild(s); });
  _xlsx = window.XLSX; return _xlsx;
}

// ============================================================
// INIT
// ============================================================
if (!initSB()) { document.getElementById('authGate').classList.add('open'); setTimeout(openCfg, 600); } else { bootAuth(); }
