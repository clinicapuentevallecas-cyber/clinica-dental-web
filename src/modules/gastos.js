// Modulo Gastos - codigo productivo extraido de app.js v43
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



