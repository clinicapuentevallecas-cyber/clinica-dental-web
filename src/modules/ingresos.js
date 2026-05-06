// Modulo Ingresos - codigo productivo extraido de app.js v43
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
