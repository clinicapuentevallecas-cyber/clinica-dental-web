
console.log("INDEX FINANCIERO v2026-05-05-43 cargado: estructura modular real completa por archivos");
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


