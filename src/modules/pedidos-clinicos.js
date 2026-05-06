// Modulo Pedidos clinicos - v48
// Produccion clinica, catalogos, materiales, recetas, precios y pedido recomendado en modo manual sin API.
(function () {
  const VERSION = '2026-05-06-48';

  const FAMILIAS_TTO = [
    'Cirugía', 'Implantes', 'Prótesis', 'Conservadora', 'Endodoncia',
    'Periodoncia', 'Ortodoncia', 'Estética', 'Higiene', 'Radiología / Diagnóstico', 'Otros'
  ];
  const FAMILIAS_MATERIAL = [
    'Fungibles', 'Implantes', 'Biomaterial', 'Aditamentos', 'Ortodoncia',
    'Laboratorio', 'Instrumental', 'Medicamentos / anestesia', 'Equipamiento menor', 'Otros'
  ];

  let state = {
    tab: 'dashboard',
    tratamientos: [],
    materiales: [],
    recetas: [],
    produccion: [],
    precios: [],
    pedidos: [],
    doctores: [],
    filters: {
      periodo: 'mes',
      desde: '',
      hasta: '',
      familia: '',
      doctor: '',
      tratamiento: '',
      familiaMaterial: '',
      proveedor: ''
    },
    loading: false,
    error: ''
  };

  function getSB() {
    try { if (typeof sb !== 'undefined' && sb) return sb; } catch (_) {}
    try { if (window.sb) return window.sb; } catch (_) {}
    return null;
  }
  function q(sel, root = document) { return root.querySelector(sel); }
  function qa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function esc(v) { return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s])); }
  function norm(v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    let s = String(v ?? '').trim();
    if (!s) return 0;
    s = s.replace(/\s/g, '').replace(/€/g, '');
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else if (s.includes(',')) s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  function eur(v) {
    try { return Number(v || 0).toLocaleString('es-ES', { style:'currency', currency:'EUR', maximumFractionDigits:0 }); }
    catch (_) { return `${Math.round(Number(v || 0))} €`; }
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function monthStart() { return `${today().slice(0,7)}-01`; }
  function monthEnd() { const d = new Date(); return new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().slice(0,10); }
  function dateStr(v) { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().slice(0,10); }
  function tableEmpty(cols, msg) { return `<tr><td colspan="${cols}" style="color:var(--text3);padding:18px">${esc(msg)}</td></tr>`; }
  function familyOf(obj) { return obj?.familia || obj?.categoria || ''; }
  function periodoActual() { return state.filters.periodo === 'mes' ? today().slice(0,7) : `${state.filters.desde || 'inicio'}_${state.filters.hasta || 'fin'}`; }

  function options(list, selected = '', empty = 'Todos') {
    return `<option value="">${esc(empty)}</option>${list.map(x => `<option value="${esc(x)}" ${String(x)===String(selected)?'selected':''}>${esc(x)}</option>`).join('')}`;
  }
  function treatmentOptions(selected = '') {
    return `<option value="">Todos los tratamientos</option>${state.tratamientos.map(t => `<option value="${esc(t.id)}" ${String(t.id)===String(selected)?'selected':''}>${esc((t.codigo_tto ? t.codigo_tto + ' · ' : '') + (t.nombre_tto || ''))}</option>`).join('')}`;
  }
  function materialOptions(selected = '') {
    return `${state.materiales.map(m => `<option value="${esc(m.id)}" ${String(m.id)===String(selected)?'selected':''}>${esc(m.nombre || '')}</option>`).join('')}`;
  }
  function doctorOptions(selected = '', empty = 'Todos los doctores') {
    const names = state.doctores.length ? state.doctores.map(d => d.nombre) : Array.from(new Set(state.produccion.map(p => p.doctor).filter(Boolean))).sort();
    return `<option value="">${esc(empty)}</option>${names.map(d => `<option value="${esc(d)}" ${String(d)===String(selected)?'selected':''}>${esc(d)}</option>`).join('')}`;
  }
  function proveedorOptions(selected = '') {
    const provs = Array.from(new Set([
      ...state.materiales.map(m => m.proveedor_preferente).filter(Boolean),
      ...state.precios.map(p => p.proveedor).filter(Boolean),
      ...state.tratamientos.map(t => t.proveedor_laboratorio || t.laboratorio || t.proveedor).filter(Boolean)
    ])).sort((a,b)=>String(a).localeCompare(String(b),'es'));
    return options(provs, selected, 'Todos los proveedores');
  }

  async function dbSelect(table) {
    const s = getSB();
    if (!s) return [];
    const { data, error } = await s.from(table).select('*');
    if (error) throw new Error(`${table}: ${error.message}`);
    return data || [];
  }
  async function dbSafeSelect(table) {
    try { return await dbSelect(table); } catch (e) { console.warn(e.message || e); return []; }
  }
  async function dbInsert(table, payload) {
    const s = getSB();
    if (!s) throw new Error('Supabase no está conectado.');
    const { data, error } = await s.from(table).insert(payload).select();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data?.[0] || null;
  }
  async function dbUpdate(table, id, payload) {
    const s = getSB();
    if (!s) throw new Error('Supabase no está conectado.');
    const { error } = await s.from(table).update(payload).eq('id', id);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  async function dbDelete(table, id) {
    const s = getSB();
    if (!s) throw new Error('Supabase no está conectado.');
    const { error } = await s.from(table).delete().eq('id', id);
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  async function loadPedidosData() {
    const s = getSB();
    if (!s) { state.error = 'Supabase no está conectado. Configura Supabase para guardar y leer Pedidos clínicos.'; render(); return; }
    state.loading = true; state.error = ''; render();
    try {
      const [tratamientos, materiales, recetas, produccion, precios, pedidos, doctores] = await Promise.all([
        dbSelect('tratamientos_catalogo'),
        dbSelect('materiales_catalogo'),
        dbSelect('tratamiento_materiales'),
        dbSelect('ttos_realizados'),
        dbSelect('material_precios'),
        dbSelect('pedidos_recomendados'),
        dbSafeSelect('doctores_catalogo')
      ]);
      state.tratamientos = tratamientos.sort((a,b)=>String(a.nombre_tto||'').localeCompare(String(b.nombre_tto||''),'es'));
      state.materiales = materiales.sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
      state.recetas = recetas;
      state.produccion = produccion.sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
      state.precios = precios.sort((a,b)=>String(a.proveedor||'').localeCompare(String(b.proveedor||''),'es'));
      state.pedidos = pedidos.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
      state.doctores = doctores.sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
    } catch (e) { state.error = e.message || String(e); }
    finally { state.loading = false; render(); }
  }

  function tratamientoById(id) { return state.tratamientos.find(t => String(t.id) === String(id)); }
  function materialById(id) { return state.materiales.find(m => String(m.id) === String(id)); }
  function preciosByMaterial(id) { return state.precios.filter(p => String(p.material_id) === String(id)); }
  function getTratamientoForProd(p) {
    if (p.tratamiento_id) { const t = tratamientoById(p.tratamiento_id); if (t) return t; }
    const code = norm(p.codigo_tto); const name = norm(p.tratamiento);
    return state.tratamientos.find(t => (code && norm(t.codigo_tto) === code) || (name && norm(t.nombre_tto) === name) || (name && norm(t.nombre_tto).includes(name)) || (name && name.includes(norm(t.nombre_tto))));
  }
  function getMaterialFamily(m) { return m?.familia || m?.categoria || ''; }
  function bestPrice(material) {
    const prices = preciosByMaterial(material.id).map(p => ({...p, precio: num(p.precio)})).filter(p => p.precio > 0);
    if (prices.length) return prices.sort((a,b)=>a.precio-b.precio)[0];
    const fallback = num(material.coste_medio || material.coste_ultimo);
    return fallback > 0 ? { proveedor: material.proveedor_preferente || 'Coste medio', precio: fallback, referencia: material.referencia_proveedor || '' } : null;
  }
  function costeUnitarioReceta(r) {
    const mat = materialById(r.material_id);
    const price = mat ? bestPrice(mat) : null;
    return num(r.coste_estimado_unitario) || num(price?.precio) || num(mat?.coste_medio) || num(mat?.coste_ultimo);
  }
  function costeMaterialTratamiento(tratamientoId) {
    return state.recetas.filter(r => String(r.tratamiento_id) === String(tratamientoId)).reduce((s,r)=>s+num(r.cantidad_estimada)*costeUnitarioReceta(r),0);
  }
  function costeMaterialProduccion(p) {
    const t = getTratamientoForProd(p);
    if (!t) return 0;
    return costeMaterialTratamiento(t.id) * (num(p.cantidad) || 1);
  }

  function filteredProduccion() {
    const f = state.filters;
    const desde = f.periodo === 'rango' ? f.desde : monthStart();
    const hasta = f.periodo === 'rango' ? f.hasta : monthEnd();
    return state.produccion.filter(p => {
      const fecha = dateStr(p.fecha);
      if (desde && fecha && fecha < desde) return false;
      if (hasta && fecha && fecha > hasta) return false;
      const t = getTratamientoForProd(p);
      const fam = p.familia || familyOf(t);
      if (f.familia && fam !== f.familia) return false;
      if (f.doctor && String(p.doctor || '') !== f.doctor) return false;
      if (f.tratamiento && String(t?.id || p.tratamiento_id || '') !== f.tratamiento) return false;
      return true;
    });
  }
  function filteredMateriales() {
    const f = state.filters;
    return state.materiales.filter(m => {
      if (f.familiaMaterial && getMaterialFamily(m) !== f.familiaMaterial) return false;
      if (f.proveedor && String(m.proveedor_preferente || '') !== f.proveedor && !preciosByMaterial(m.id).some(p => p.proveedor === f.proveedor)) return false;
      return true;
    });
  }

  function dashboardStats() {
    const rows = filteredProduccion();
    const cantidad = rows.reduce((s,p)=>s+(num(p.cantidad)||1),0);
    const importe = rows.reduce((s,p)=>s+num(p.importe),0);
    const costeMaterial = rows.reduce((s,p)=>s+costeMaterialProduccion(p),0);
    const margen = importe - costeMaterial;
    const pedidoRows = calcularPedidoRecomendado(false);
    const pedido = pedidoRows.reduce((s,p)=>s+num(p.cantidad_recomendada)*num(p.precio_estimado),0);
    return { registros: rows.length, cantidad, importe, costeMaterial, margen, pedido, pedidoCount: pedidoRows.length, margenPct: importe ? margen/importe*100 : 0 };
  }

  function calcularConsumoMaterial() {
    const consumo = new Map();
    filteredProduccion().forEach(p => {
      const t = getTratamientoForProd(p); if (!t) return;
      state.recetas.filter(r => String(r.tratamiento_id) === String(t.id)).forEach(r => {
        const key = String(r.material_id);
        consumo.set(key, (consumo.get(key) || 0) + num(r.cantidad_estimada) * (num(p.cantidad) || 1));
      });
    });
    return consumo;
  }

  function calcularPedidoRecomendado(store = false) {
    const consumoByMat = calcularConsumoMaterial();
    const rows = filteredMateriales().map(m => {
      const consumo = consumoByMat.get(String(m.id)) || 0;
      const stock = num(m.stock_actual);
      const minimo = num(m.stock_minimo);
      const pedir = Math.max(0, consumo + minimo - stock);
      const price = bestPrice(m);
      return {
        material_id: m.id,
        material_nombre: m.nombre,
        empresa: 'corporacion',
        periodo: periodoActual(),
        consumo_previsto: consumo,
        stock_actual: stock,
        stock_minimo: minimo,
        cantidad_recomendada: pedir,
        proveedor_sugerido: price?.proveedor || m.proveedor_preferente || '',
        precio_estimado: price?.precio || num(m.coste_medio || m.coste_ultimo),
        referencia: price?.referencia || m.referencia_proveedor || ''
      };
    }).filter(x => num(x.cantidad_recomendada) > 0);
    if (store) guardarPedidoRecomendado(rows);
    return rows;
  }
  async function guardarPedidoRecomendado(rows) {
    try {
      const s = getSB(); if (!s) throw new Error('Supabase no conectado');
      const periodo = periodoActual();
      await s.from('pedidos_recomendados').delete().eq('periodo', periodo).eq('empresa', 'corporacion');
      if (rows.length) {
        const payload = rows.map(r => ({ material_id:r.material_id, empresa:r.empresa, periodo:r.periodo, consumo_previsto:r.consumo_previsto, stock_actual:r.stock_actual, stock_minimo:r.stock_minimo, cantidad_recomendada:r.cantidad_recomendada, proveedor_sugerido:r.proveedor_sugerido, precio_estimado:r.precio_estimado, estado:'pendiente' }));
        const { error } = await s.from('pedidos_recomendados').insert(payload);
        if (error) throw error;
      }
      await loadPedidosData(); toast(`Pedido recomendado generado: ${rows.length} material(es).`);
    } catch (e) { toast(`Error generando pedido: ${e.message || e}`, true); }
  }

  function toast(msg, error = false) {
    let box = q('#pedidosMsg');
    if (!box) return alert(msg);
    box.className = error ? 'ped-alert bad' : 'ped-alert ok';
    box.textContent = msg;
    setTimeout(() => { if (box) box.textContent = ''; }, 5000);
  }

  function render() {
    const el = document.getElementById('page-pedidos'); if (!el) return;
    el.innerHTML = `
      <div class="ped-head">
        <div>
          <h1>Pedidos clínicos</h1>
          <div class="sub">Producción clínica, consumo de material, pedidos recomendados y márgenes. Modo manual hasta conectar KliniKare/API clínica.</div>
        </div>
        <button class="btn" id="pedRefresh">Actualizar datos</button>
      </div>
      <div id="pedidosMsg" class="ped-alert ${state.error ? 'bad' : ''}">${esc(state.error || '')}</div>
      <div class="clinical-tabs">
        ${tabButton('dashboard','Dashboard')}
        ${tabButton('produccion','Producción')}
        ${tabButton('tratamientos','Tratamientos catálogo')}
        ${tabButton('materiales','Materiales')}
        ${tabButton('recetas','Recetas por TTO')}
        ${tabButton('precios','Precios proveedores')}
        ${tabButton('pedido','Pedido recomendado')}
      </div>
      ${state.loading ? '<div class="card"><div class="sub">Cargando Pedidos clínicos...</div></div>' : renderTab()}
    `;
    bindEvents();
  }
  function tabButton(id,label) { return `<button class="clinical-tab ${state.tab===id?'active':''}" data-ped-tab="${id}">${label}</button>`; }
  function renderTab() {
    if (state.tab === 'produccion') return renderProduccion();
    if (state.tab === 'tratamientos') return renderTratamientos();
    if (state.tab === 'materiales') return renderMateriales();
    if (state.tab === 'recetas') return renderRecetas();
    if (state.tab === 'precios') return renderPrecios();
    if (state.tab === 'pedido') return renderPedido();
    return renderDashboard();
  }

  function renderGlobalFilters(includeMaterial = false, includeProveedor = false) {
    const desdeVal = state.filters.desde || monthStart();
    const hastaVal = state.filters.hasta || monthEnd();
    return `<div class="card mb ped-filter-card"><div class="ped-filters">
      <label class="filter-field"><span>Periodo</span><select data-filter="periodo"><option value="mes" ${state.filters.periodo==='mes'?'selected':''}>Mes en curso</option><option value="rango" ${state.filters.periodo==='rango'?'selected':''}>Fecha a fecha</option></select></label>
      <label class="filter-field"><span>Desde</span><input type="date" data-filter="desde" value="${esc(desdeVal)}" title="Al cambiar esta fecha se activa Fecha a fecha"></label>
      <label class="filter-field"><span>Hasta</span><input type="date" data-filter="hasta" value="${esc(hastaVal)}" title="Al cambiar esta fecha se activa Fecha a fecha"></label>
      <label class="filter-field"><span>Familia</span><select data-filter="familia">${options(FAMILIAS_TTO, state.filters.familia, 'Todas las familias TTO')}</select></label>
      <label class="filter-field"><span>Doctor</span><select data-filter="doctor">${doctorOptions(state.filters.doctor)}</select></label>
      <label class="filter-field"><span>Tratamiento</span><select data-filter="tratamiento">${treatmentOptions(state.filters.tratamiento)}</select></label>
      ${includeMaterial ? `<label class="filter-field"><span>Familia material</span><select data-filter="familiaMaterial">${options(FAMILIAS_MATERIAL, state.filters.familiaMaterial, 'Todas las familias material')}</select></label>` : ''}
      ${includeProveedor ? `<label class="filter-field"><span>Proveedor</span><select data-filter="proveedor">${proveedorOptions(state.filters.proveedor)}</select></label>` : ''}
      <button class="btn bg2btn" id="clearPedFilters">Limpiar filtros</button>
    </div><div class="sub" style="margin-top:8px">Periodo activo: ${state.filters.periodo==='mes' ? 'mes en curso' : `${esc(desdeVal)} → ${esc(hastaVal)}`}. Puedes cambiar las fechas directamente; se activará automáticamente el modo fecha a fecha.</div></div>`;
  }

  function renderDashboard() {
    const st = dashboardStats();
    const pedidoRows = calcularPedidoRecomendado(false);
    const prod = filteredProduccion();
    const consumo = calcularConsumoMaterial();
    const topTtos = prod.slice(0,8).map(p => ({...p, coste: costeMaterialProduccion(p), margen: num(p.importe)-costeMaterialProduccion(p)}));
    return `
      ${renderGlobalFilters(true, false)}
      <div class="metrics m4 clinical-grid">
        <div class="metric"><div class="ml">Producción</div><div class="mv">${st.cantidad}</div><div class="ms">${eur(st.importe)} · ${st.registros} registro(s)</div></div>
        <div class="metric"><div class="ml">Material consumido</div><div class="mv">${Array.from(consumo.values()).reduce((a,b)=>a+b,0).toFixed(1)}</div><div class="ms">Unidades estimadas según recetas</div></div>
        <div class="metric"><div class="ml">Coste material</div><div class="mv">${eur(st.costeMaterial)}</div><div class="ms">Filtrado por familia/tratamiento</div></div>
        <div class="metric"><div class="ml">Margen bruto clínico</div><div class="mv ${st.margen>=0?'up':'dn'}">${eur(st.margen)}</div><div class="ms">${st.margenPct.toFixed(1)}%</div></div>
      </div>
      <div class="grid2">
        <div class="card"><div class="ch"><div class="ct">Pedido recomendado</div><button class="btn bg2btn" id="genPedidoDash">Generar pedido</button></div><div class="tw"><table><thead><tr><th>Material</th><th>Consumo</th><th>Stock</th><th>Pedir</th><th>Proveedor</th><th>Estimado</th></tr></thead><tbody>${pedidoRows.slice(0,10).map(r=>`<tr><td>${esc(r.material_nombre)}</td><td>${r.consumo_previsto.toFixed(1)}</td><td>${r.stock_actual}</td><td><strong>${r.cantidad_recomendada.toFixed(1)}</strong></td><td>${esc(r.proveedor_sugerido||'—')}</td><td>${eur(num(r.cantidad_recomendada)*num(r.precio_estimado))}</td></tr>`).join('') || tableEmpty(6,'Sin materiales pendientes.')}</tbody></table></div></div>
        <div class="card"><div class="ct">Última producción con margen estimado</div><div class="tw"><table><thead><tr><th>Fecha</th><th>Familia</th><th>TTO</th><th>Doctor</th><th>Ingreso</th><th>Material</th><th>Margen</th></tr></thead><tbody>${topTtos.map(p=>{ const t=getTratamientoForProd(p); return `<tr><td>${esc(dateStr(p.fecha))}</td><td>${esc(p.familia||familyOf(t))}</td><td>${esc(p.tratamiento||t?.nombre_tto||'—')}</td><td>${esc(p.doctor||'')}</td><td>${eur(p.importe)}</td><td>${eur(p.coste)}</td><td class="${p.margen>=0?'up':'dn'}">${eur(p.margen)}</td></tr>`; }).join('') || tableEmpty(7,'Sin producción registrada.')}</tbody></table></div></div>
      </div>
    `;
  }

  function renderProduccion() {
    const rows = filteredProduccion();
    return `
      ${renderGlobalFilters(false, false)}
      <div class="card mb">
        <div class="ct">Añadir producción</div>
        <div class="ped-form">
          <input id="prodFecha" type="date" value="${today()}">
          <select id="prodFamilia">${options(FAMILIAS_TTO, '', 'Familia')}</select>
          <select id="prodTratId"><option value="">Tratamiento del catálogo</option>${state.tratamientos.map(t=>`<option value="${esc(t.id)}">${esc((t.codigo_tto? t.codigo_tto+' · ':'') + t.nombre_tto)}</option>`).join('')}</select>
          <input id="prodTratNombre" placeholder="Tratamiento si no está en catálogo">
          <select id="prodDoctorSel">${doctorOptions('', 'Doctor')}</select>
          <input id="prodDoctorNuevo" placeholder="Doctor nuevo opcional">
          <input id="prodCantidad" type="number" step="1" placeholder="Cantidad" value="1">
          <input id="prodImporte" type="number" step="0.01" placeholder="Importe facturado">
          <input id="prodObs" placeholder="Observaciones">
          <button class="btn" id="addProduccion">Guardar producción</button>
        </div>
      </div>
      <div class="card"><div class="ch"><div class="ct">Producción</div><span class="sub">${rows.length} registro(s)</span></div><div class="tw"><table><thead><tr><th>Fecha</th><th>Familia</th><th>Tratamiento</th><th>Doctor</th><th>Cantidad</th><th>Importe</th><th>Material</th><th>Margen</th><th>Obs.</th><th></th></tr></thead><tbody>${rows.map(p=>{ const coste=costeMaterialProduccion(p); const margen=num(p.importe)-coste; const t=getTratamientoForProd(p); return `<tr><td>${esc(dateStr(p.fecha))}</td><td>${esc(p.familia||familyOf(t))}</td><td>${esc(p.tratamiento||t?.nombre_tto||'')}</td><td>${esc(p.doctor||'')}</td><td>${num(p.cantidad)||1}</td><td>${eur(p.importe)}</td><td>${eur(coste)}</td><td class="${margen>=0?'up':'dn'}">${eur(margen)}</td><td>${esc(p.observaciones||'')}</td><td><button class="mini danger" data-del="ttos_realizados:${p.id}">Eliminar</button></td></tr>`; }).join('') || tableEmpty(10,'Sin producción registrada.')}</tbody></table></div></div>
      <div class="card mt"><div class="ct">Doctores</div><div class="ped-form"><input id="docNombre" placeholder="Nombre doctor"><button class="btn" id="addDoctor">Guardar doctor</button></div><div class="chips">${state.doctores.map(d=>`<span class="chip">${esc(d.nombre)} <button class="mini danger" data-del="doctores_catalogo:${d.id}">×</button></span>`).join('') || '<span class="sub">Sin doctores en tabla. También puedes usar texto en Producción.</span>'}</div></div>
    `;
  }

  function renderTratamientos() {
    const fam = state.filters.familia; const prov = state.filters.proveedor;
    const rows = state.tratamientos.filter(t => (!fam || familyOf(t) === fam) && (!prov || String(t.proveedor_laboratorio||t.laboratorio||t.proveedor||'') === prov));
    return `
      <div class="card mb ped-filter-card"><div class="ped-filters"><select data-filter="familia">${options(FAMILIAS_TTO, state.filters.familia, 'Todas las familias')}</select><select data-filter="proveedor">${proveedorOptions(state.filters.proveedor)}</select><button class="btn bg2btn" id="exportTratamientos">Exportar CSV</button><label class="btn bg2btn filelabel">Importar CSV<input type="file" id="importTratamientos" accept=".csv,text/csv" hidden></label></div></div>
      <div class="card mb"><div class="ct">Añadir tratamiento al catálogo</div><div class="ped-form"><input id="tratCodigo" placeholder="Código TTO"><input id="tratNombre" placeholder="Nombre tratamiento"><select id="tratFamilia">${options(FAMILIAS_TTO, '', 'Familia')}</select><input id="tratPrecio" type="number" step="0.01" placeholder="PVP / precio base"><input id="tratLab" type="number" step="0.01" placeholder="Coste laboratorio"><input id="tratProv" placeholder="Laboratorio / proveedor asociado"><button class="btn" id="addTrat">Guardar tratamiento</button></div></div>
      <div class="card"><div class="ch"><div class="ct">Tratamientos catálogo</div><span class="sub">${rows.length} tratamiento(s)</span></div><div class="tw"><table><thead><tr><th>Código</th><th>Tratamiento</th><th>Familia</th><th>PVP</th><th>Laboratorio</th><th>Proveedor/lab</th><th>Material</th><th>Coste directo</th><th>Margen</th><th></th></tr></thead><tbody>${rows.map(t=>{ const mat=costeMaterialTratamiento(t.id); const lab=num(t.coste_laboratorio_estimado || t.coste_laboratorio); const total=mat+lab; const margen=num(t.precio_base)-total; return `<tr><td>${esc(t.codigo_tto||'')}</td><td><strong>${esc(t.nombre_tto)}</strong></td><td>${esc(familyOf(t))}</td><td>${eur(t.precio_base)}</td><td>${eur(lab)}</td><td>${esc(t.proveedor_laboratorio||t.laboratorio||t.proveedor||'')}</td><td>${eur(mat)}</td><td>${eur(total)}</td><td class="${margen>=0?'up':'dn'}">${eur(margen)}</td><td><button class="mini danger" data-del="tratamientos_catalogo:${t.id}">Eliminar</button></td></tr>`; }).join('') || tableEmpty(10,'Sin tratamientos.')}</tbody></table></div></div>
    `;
  }

  function renderMateriales() {
    const rows = filteredMateriales();
    return `
      <div class="card mb ped-filter-card"><div class="ped-filters"><select data-filter="familiaMaterial">${options(FAMILIAS_MATERIAL, state.filters.familiaMaterial, 'Todas las familias material')}</select><select data-filter="proveedor">${proveedorOptions(state.filters.proveedor)}</select><button class="btn bg2btn" id="exportMateriales">Exportar CSV</button><label class="btn bg2btn filelabel">Importar CSV<input type="file" id="importMateriales" accept=".csv,text/csv" hidden></label></div></div>
      <div class="card mb"><div class="ct">Añadir material</div><div class="ped-form"><input id="matNombre" placeholder="Nombre material"><select id="matFamilia">${options(FAMILIAS_MATERIAL, '', 'Familia')}</select><input id="matUnidad" placeholder="Unidad" value="unidad"><input id="matStock" type="number" step="0.01" placeholder="Stock actual"><input id="matMin" type="number" step="0.01" placeholder="Stock mínimo"><input id="matCoste" type="number" step="0.01" placeholder="Coste medio"><input id="matProveedor" placeholder="Proveedor preferente"><button class="btn" id="addMat">Guardar material</button></div></div>
      <div class="card"><div class="ch"><div class="ct">Catálogo de materiales</div><span class="sub">${rows.length} material(es)</span></div><div class="tw"><table><thead><tr><th>Material</th><th>Familia</th><th>Unidad</th><th>Stock</th><th>Mínimo</th><th>Coste medio</th><th>Proveedor</th><th>Comparativa precios</th><th></th></tr></thead><tbody>${rows.map(m=>{ const prices=preciosByMaterial(m.id).map(p=>`${p.proveedor}: ${eur(p.precio)}`).join(' · '); return `<tr><td><strong>${esc(m.nombre)}</strong></td><td>${esc(getMaterialFamily(m))}</td><td>${esc(m.unidad||'unidad')}</td><td><input class="mini-input" type="number" step="0.01" value="${num(m.stock_actual)}" data-update="materiales_catalogo:${m.id}:stock_actual"></td><td><input class="mini-input" type="number" step="0.01" value="${num(m.stock_minimo)}" data-update="materiales_catalogo:${m.id}:stock_minimo"></td><td>${eur(m.coste_medio)}</td><td>${esc(m.proveedor_preferente||'')}</td><td>${esc(prices || 'Sin precios')}</td><td><button class="mini danger" data-del="materiales_catalogo:${m.id}">Eliminar</button></td></tr>`; }).join('') || tableEmpty(9,'Sin materiales.')}</tbody></table></div></div>
    `;
  }

  function selectTratamientos(id) { return `<select id="${id}">${state.tratamientos.map(t=>`<option value="${esc(t.id)}">${esc((t.codigo_tto? t.codigo_tto+' · ':'') + t.nombre_tto)}</option>`).join('')}</select>`; }
  function selectMateriales(id) { return `<select id="${id}">${materialOptions()}</select>`; }

  function renderRecetas() {
    return `<div class="card mb"><div class="ch"><div><div class="ct">Recetas por TTO</div><div class="sub">Define qué materiales consume cada tratamiento.</div></div><button class="btn bg2btn" data-ped-tab="tratamientos">Ir a tratamientos</button></div></div>
      <div class="card mb"><div class="ct">Añadir material a receta</div><div class="ped-form">${selectTratamientos('recTrat')}${selectMateriales('recMat')}<input id="recCantidad" type="number" step="0.01" placeholder="Cantidad" value="1"><input id="recCoste" type="number" step="0.01" placeholder="Coste unitario opcional"><button class="btn" id="addRec">Añadir a receta</button></div></div>
      <div class="card"><div class="ct">Recetas definidas</div><div class="tw"><table><thead><tr><th>TTO</th><th>Familia</th><th>Material</th><th>Familia material</th><th>Cantidad</th><th>Coste unit.</th><th>Total</th><th></th></tr></thead><tbody>${state.recetas.map(r=>{ const t=tratamientoById(r.tratamiento_id); const m=materialById(r.material_id); const cu=costeUnitarioReceta(r); return `<tr><td>${esc(t?.nombre_tto||'—')}</td><td>${esc(familyOf(t))}</td><td>${esc(m?.nombre||'—')}</td><td>${esc(getMaterialFamily(m))}</td><td>${num(r.cantidad_estimada)} ${esc(r.unidad||m?.unidad||'')}</td><td>${eur(cu)}</td><td>${eur(cu*num(r.cantidad_estimada))}</td><td><button class="mini danger" data-del="tratamiento_materiales:${r.id}">Eliminar</button></td></tr>`; }).join('') || tableEmpty(8,'Sin recetas definidas.')}</tbody></table></div></div>`;
  }

  function renderPrecios() {
    return `<div class="card mb"><div class="ct">Añadir precio proveedor</div><div class="ped-form">${selectMateriales('precioMat')}<input id="precioProv" placeholder="Proveedor"><input id="precioRef" placeholder="Referencia"><input id="precioVal" type="number" step="0.01" placeholder="Precio"><input id="precioUnidad" placeholder="Unidad compra"><input id="precioPlazo" type="number" step="1" placeholder="Plazo días"><input id="precioUrl" placeholder="URL producto"><button class="btn" id="addPrecio">Guardar precio</button></div></div><div class="card"><div class="ct">Precios por proveedor</div><div class="tw"><table><thead><tr><th>Material</th><th>Familia</th><th>Proveedor</th><th>Referencia</th><th>Precio</th><th>Unidad compra</th><th>Plazo</th><th>Fecha</th><th></th></tr></thead><tbody>${state.precios.map(p=>{ const m=materialById(p.material_id); return `<tr><td>${esc(m?.nombre||'—')}</td><td>${esc(getMaterialFamily(m))}</td><td>${esc(p.proveedor)}</td><td>${esc(p.referencia||'')}</td><td>${eur(p.precio)}</td><td>${esc(p.unidad_compra||'')}</td><td>${p.plazo_entrega_dias ? esc(p.plazo_entrega_dias)+' días':'—'}</td><td>${esc(dateStr(p.fecha_precio))}</td><td><button class="mini danger" data-del="material_precios:${p.id}">Eliminar</button></td></tr>`; }).join('') || tableEmpty(9,'Sin precios registrados.')}</tbody></table></div></div>`;
  }

  function renderPedido() {
    const rows=calcularPedidoRecomendado(false);
    return `${renderGlobalFilters(true,true)}<div class="card mb"><div class="ch"><div><div class="ct">Pedido recomendado</div><div class="sub">Cálculo: consumo previsto por producción + stock mínimo - stock actual. Precio: mejor proveedor registrado o coste medio.</div></div><button class="btn" id="genPedido">Guardar pedido recomendado en Supabase</button></div></div><div class="card"><div class="tw"><table><thead><tr><th>Material</th><th>Familia</th><th>Consumo previsto</th><th>Stock</th><th>Mínimo</th><th>Pedir</th><th>Proveedor sugerido</th><th>Precio unit.</th><th>Total</th></tr></thead><tbody>${rows.map(r=>{ const m=materialById(r.material_id); return `<tr><td><strong>${esc(r.material_nombre)}</strong></td><td>${esc(getMaterialFamily(m))}</td><td>${num(r.consumo_previsto).toFixed(1)}</td><td>${num(r.stock_actual)}</td><td>${num(r.stock_minimo)}</td><td><strong>${num(r.cantidad_recomendada).toFixed(1)}</strong></td><td>${esc(r.proveedor_sugerido||'—')}</td><td>${eur(r.precio_estimado)}</td><td>${eur(num(r.cantidad_recomendada)*num(r.precio_estimado))}</td></tr>`; }).join('') || tableEmpty(9,'No hay pedido recomendado.')}</tbody></table></div></div>`;
  }

  let delegatedEventsBound=false;
  function bindEvents() {
    if (delegatedEventsBound) return; delegatedEventsBound=true;
    document.addEventListener('click', async ev => {
      const page=document.getElementById('page-pedidos'); if (!page || !page.contains(ev.target)) return;
      const tab=ev.target.closest('[data-ped-tab]'); if (tab) { ev.preventDefault(); state.tab=tab.dataset.pedTab; render(); return; }
      const del=ev.target.closest('[data-del]'); if (del) { ev.preventDefault(); const [table,id]=del.dataset.del.split(':'); if (!confirm('¿Eliminar este registro?')) return; try { await dbDelete(table,id); await loadPedidosData(); } catch(e){ toast(e.message||String(e),true); } return; }
      const id=ev.target?.id;
      try {
        if (id==='pedRefresh') { ev.preventDefault(); await loadPedidosData(); return; }
        if (id==='clearPedFilters') { ev.preventDefault(); state.filters={periodo:'mes',desde:'',hasta:'',familia:'',doctor:'',tratamiento:'',familiaMaterial:'',proveedor:''}; render(); return; }
        if (id==='addProduccion') { ev.preventDefault(); await addProduccion(); return; }
        if (id==='addDoctor') { ev.preventDefault(); await addDoctor(); return; }
        if (id==='addTrat') { ev.preventDefault(); await addTratamiento(); return; }
        if (id==='addMat') { ev.preventDefault(); await addMaterial(); return; }
        if (id==='addRec') { ev.preventDefault(); await addReceta(); return; }
        if (id==='addPrecio') { ev.preventDefault(); await addPrecio(); return; }
        if (id==='genPedido' || id==='genPedidoDash') { ev.preventDefault(); calcularPedidoRecomendado(true); return; }
        if (id==='exportTratamientos') { ev.preventDefault(); exportCSV('tratamientos'); return; }
        if (id==='exportMateriales') { ev.preventDefault(); exportCSV('materiales'); return; }
      } catch(e) { toast(e.message||String(e),true); }
    });
    document.addEventListener('input', ev => {
      const page=document.getElementById('page-pedidos'); if (!page || !page.contains(ev.target)) return;
      const filter=ev.target.closest('[data-filter]');
      if (!filter) return;
      const key = filter.dataset.filter;
      if (key === 'desde' || key === 'hasta') {
        state.filters[key] = filter.value;
        state.filters.periodo = 'rango';
      }
    });
    document.addEventListener('change', async ev => {
      const page=document.getElementById('page-pedidos'); if (!page || !page.contains(ev.target)) return;
      const filter=ev.target.closest('[data-filter]');
      if (filter) {
        const key = filter.dataset.filter;
        if (key === 'periodo') {
          state.filters.periodo = filter.value;
          if (filter.value === 'rango') {
            if (!state.filters.desde) state.filters.desde = monthStart();
            if (!state.filters.hasta) state.filters.hasta = monthEnd();
          }
        } else {
          state.filters[key] = filter.value;
          if (key === 'desde' || key === 'hasta') state.filters.periodo = 'rango';
        }
        render();
        return;
      }
      const input=ev.target.closest('[data-update]');
      if (input) { const [table,id,field]=input.dataset.update.split(':'); try { await dbUpdate(table,id,{[field]:num(input.value)}); toast('Dato actualizado.'); await loadPedidosData(); } catch(e){ toast(e.message||String(e),true); } return; }
      if (ev.target?.id === 'importTratamientos') { await importCSV(ev.target.files?.[0], 'tratamientos'); return; }
      if (ev.target?.id === 'importMateriales') { await importCSV(ev.target.files?.[0], 'materiales'); return; }
    });
  }

  async function addProduccion() {
    const tId=q('#prodTratId').value;
    const t=tratamientoById(tId);
    const doctor=q('#prodDoctorNuevo').value.trim() || q('#prodDoctorSel').value;
    const payload={
      fecha:q('#prodFecha').value||today(),
      empresa:'corporacion',
      familia:q('#prodFamilia').value || familyOf(t),
      tratamiento_id:tId || null,
      codigo_tto:t?.codigo_tto || null,
      tratamiento:q('#prodTratNombre').value.trim() || t?.nombre_tto || '',
      doctor,
      cantidad:num(q('#prodCantidad').value)||1,
      importe:num(q('#prodImporte').value),
      estado:'realizado',
      observaciones:q('#prodObs').value.trim(),
      origen:'manual',
      external_id:`manual-${Date.now()}-${Math.random().toString(16).slice(2)}`
    };
    if (!payload.tratamiento) throw new Error('Indica tratamiento.');
    await dbInsert('ttos_realizados', payload); await loadPedidosData(); toast('Producción guardada.');
  }
  async function addDoctor() {
    const nombre=q('#docNombre').value.trim(); if (!nombre) throw new Error('Indica nombre doctor.');
    await dbInsert('doctores_catalogo', { nombre, activo:true }); await loadPedidosData(); toast('Doctor guardado.');
  }
  async function addTratamiento() {
    const payload={ codigo_tto:q('#tratCodigo').value.trim()||null, nombre_tto:q('#tratNombre').value.trim(), familia:q('#tratFamilia').value, categoria:q('#tratFamilia').value, precio_base:num(q('#tratPrecio').value), coste_laboratorio_estimado:num(q('#tratLab').value), proveedor_laboratorio:q('#tratProv').value.trim(), activo:true };
    if (!payload.nombre_tto) throw new Error('Indica nombre del tratamiento.');
    await dbInsert('tratamientos_catalogo', payload); await loadPedidosData(); toast('Tratamiento guardado.');
  }
  async function addMaterial() {
    const payload={ nombre:q('#matNombre').value.trim(), familia:q('#matFamilia').value, categoria:q('#matFamilia').value, unidad:q('#matUnidad').value.trim()||'unidad', stock_actual:num(q('#matStock').value), stock_minimo:num(q('#matMin').value), coste_medio:num(q('#matCoste').value), coste_ultimo:num(q('#matCoste').value), proveedor_preferente:q('#matProveedor').value.trim(), activo:true };
    if (!payload.nombre) throw new Error('Indica nombre del material.');
    await dbInsert('materiales_catalogo', payload); await loadPedidosData(); toast('Material guardado.');
  }
  async function addReceta() {
    const mat=materialById(q('#recMat').value);
    const payload={ tratamiento_id:q('#recTrat').value, material_id:q('#recMat').value, cantidad_estimada:num(q('#recCantidad').value)||1, unidad:mat?.unidad||'unidad', tipo_consumo:'estimado', coste_estimado_unitario:num(q('#recCoste').value)||num(bestPrice(mat)?.precio)||num(mat?.coste_medio)||num(mat?.coste_ultimo) };
    await dbInsert('tratamiento_materiales', payload); await loadPedidosData(); toast('Material añadido a receta.');
  }
  async function addPrecio() {
    const payload={ material_id:q('#precioMat').value, proveedor:q('#precioProv').value.trim(), referencia:q('#precioRef').value.trim(), precio:num(q('#precioVal').value), unidad_compra:q('#precioUnidad').value.trim(), plazo_entrega_dias:q('#precioPlazo').value ? Number(q('#precioPlazo').value) : null, url_producto:q('#precioUrl').value.trim(), fecha_precio:today() };
    if (!payload.proveedor) throw new Error('Indica proveedor.'); if (!payload.precio) throw new Error('Indica precio.');
    await dbInsert('material_precios', payload); await loadPedidosData(); toast('Precio guardado.');
  }

  function exportCSV(type) {
    const rows = type==='materiales' ? state.materiales.map(m=>({nombre:m.nombre,familia:getMaterialFamily(m),unidad:m.unidad,stock_actual:m.stock_actual,stock_minimo:m.stock_minimo,coste_medio:m.coste_medio,proveedor_preferente:m.proveedor_preferente})) : state.tratamientos.map(t=>({codigo_tto:t.codigo_tto,nombre_tto:t.nombre_tto,familia:familyOf(t),precio_base:t.precio_base,coste_laboratorio_estimado:t.coste_laboratorio_estimado,proveedor_laboratorio:t.proveedor_laboratorio,activo:t.activo}));
    if (!rows.length) return toast('No hay datos para exportar.', true);
    const headers=Object.keys(rows[0]);
    const csv=[headers.join(';')].concat(rows.map(r=>headers.map(h=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(';'))).join('\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${type}_pedidos_clinicos.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  async function importCSV(file, type) {
    if (!file) return;
    const text=await file.text();
    const lines=text.split(/\r?\n/).filter(Boolean); if (lines.length<2) return toast('CSV vacío.', true);
    const sep=lines[0].includes(';')?';':','; const headers=lines[0].split(sep).map(h=>norm(h));
    let count=0;
    for (const line of lines.slice(1)) {
      const cells=line.split(sep).map(x=>x.replace(/^"|"$/g,'').replace(/""/g,'"'));
      const obj={}; headers.forEach((h,i)=>obj[h]=cells[i]||'');
      if (type==='materiales') {
        await dbInsert('materiales_catalogo', { nombre:obj.nombre||obj.material, familia:obj.familia, categoria:obj.familia, unidad:obj.unidad||'unidad', stock_actual:num(obj.stock_actual), stock_minimo:num(obj.stock_minimo), coste_medio:num(obj.coste_medio), coste_ultimo:num(obj.coste_medio), proveedor_preferente:obj.proveedor_preferente||obj.proveedor, activo:true });
      } else {
        await dbInsert('tratamientos_catalogo', { codigo_tto:obj.codigo_tto||obj.codigo, nombre_tto:obj.nombre_tto||obj.tratamiento||obj.nombre, familia:obj.familia, categoria:obj.familia, precio_base:num(obj.precio_base||obj.pvp), coste_laboratorio_estimado:num(obj.coste_laboratorio_estimado||obj.laboratorio), proveedor_laboratorio:obj.proveedor_laboratorio||obj.proveedor||obj.laboratorio_proveedor, activo:true });
      }
      count++;
    }
    await loadPedidosData(); toast(`Importados ${count} registro(s).`);
  }

  function injectStyles() {
    if (document.getElementById('pedidosClinicosV47Css')) return;
    const st=document.createElement('style'); st.id='pedidosClinicosV47Css'; st.textContent=`
      .ped-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
      .ped-alert{margin:10px 0 14px;padding:10px 12px;border-radius:10px;font-size:13px;min-height:0}.ped-alert:empty{display:none}.ped-alert.ok{background:var(--green-light);color:#075f43}.ped-alert.bad{background:var(--red-light);color:#8e2f19}
      .ped-form{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;align-items:center;margin-bottom:8px}.ped-form input,.ped-form select,.ped-filters input,.ped-filters select{height:36px;border:1px solid var(--border2);border-radius:8px;padding:0 10px;font-family:'DM Sans',sans-serif;background:#fff;color:var(--text)}.ped-form .btn{height:36px}
      .ped-filters{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;align-items:end}.filter-field{display:flex;flex-direction:column;gap:4px}.filter-field span{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);padding-left:2px}.mini{border:1px solid var(--border2);background:#fff;border-radius:8px;padding:5px 8px;font-family:'DM Sans',sans-serif;cursor:pointer}.mini.danger{color:var(--red)}.mini-input{width:90px;height:30px;border:1px solid var(--border2);border-radius:7px;padding:0 8px;background:#fff}.filelabel{display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{background:var(--bg2);border:1px solid var(--border);border-radius:999px;padding:6px 10px;display:inline-flex;gap:6px;align-items:center}.mt{margin-top:16px}
      @media(max-width:1100px){.ped-form,.ped-filters{grid-template-columns:1fr 1fr}.ped-head{flex-direction:column}.clinical-grid{grid-template-columns:1fr 1fr!important}}
    `; document.head.appendChild(st);
  }
  function bootPedidosClinicos() { injectStyles(); const el=document.getElementById('page-pedidos'); if (!el) return; render(); loadPedidosData(); }
  window.PEDIDOS_CLINICOS_MODULE_VERSION=VERSION;
  window.bootPedidosClinicos=bootPedidosClinicos;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(bootPedidosClinicos,100));
  console.log(`MODULO PEDIDOS CLINICOS v${VERSION} cargado: fix selector fechas dashboard, produccion, familias y comparativas`);
})();
