// Modulo Resumen - codigo productivo extraido de app.js v43
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

