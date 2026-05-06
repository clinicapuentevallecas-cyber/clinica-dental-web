// Modulo Prevision - codigo productivo extraido de app.js v43
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

