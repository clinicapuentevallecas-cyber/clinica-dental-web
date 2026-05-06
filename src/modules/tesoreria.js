// Modulo Tesoreria - codigo productivo extraido de app.js v43
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

