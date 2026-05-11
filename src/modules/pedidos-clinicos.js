// Modulo Pedidos clinicos - v51
// Reorganizacion: pestanas de analisis sin insercion, Datos centraliza CRUD, Importar centraliza CSV/PDF.
(function () {
  const VERSION = '2026-05-06-51';

  const FAMILIAS_TTO = [
    'Cirugía', 'Implantes', 'Prótesis', 'Conservadora', 'Endodoncia',
    'Periodoncia', 'Ortodoncia', 'Estética', 'Higiene', 'Radiología / Diagnóstico', 'Otros'
  ];
  const FAMILIAS_MATERIAL = [
    'Fungibles', 'Implantes', 'Biomaterial', 'Aditamentos', 'Ortodoncia',
    'Laboratorio', 'Instrumental', 'Medicamentos / anestesia', 'Equipamiento menor', 'Otros'
  ];
  const FAMILIAS_FACTURA = ['Fungibles', 'Implantes', 'Aditamento', 'Biomaterial', 'Laboratorio'];

  let state = {
    tab: 'dashboard',
    dataSection: 'produccion',
    importSection: 'pdf',
    tratamientos: [], materiales: [], recetas: [], produccion: [], precios: [], pedidos: [], doctores: [],
    facturas: [], facturaLineas: [], laboratorioCostes: [],
    filters: { periodo: 'mes', desde: '', hasta: '', familia: '', doctor: '', tratamiento: '', familiaMaterial: '', proveedor: '', historial: '' },
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
  function dateStr(v) { if (!v) return ''; const d = new Date(v); return Number.isNaN(d.getTime()) ? String(v).slice(0,10) : d.toISOString().slice(0,10); }
  function tableEmpty(cols, msg) { return `<tr><td colspan="${cols}" style="color:var(--text3);padding:18px">${esc(msg)}</td></tr>`; }
  function familyOf(obj) { return obj?.familia || obj?.categoria || ''; }
  function periodoActual() { return state.filters.periodo === 'mes' ? today().slice(0,7) : `${state.filters.desde || 'inicio'}_${state.filters.hasta || 'fin'}`; }

  function options(list, selected = '', empty = 'Todos') {
    return `<option value="">${esc(empty)}</option>${list.map(x => `<option value="${esc(x)}" ${String(x)===String(selected)?'selected':''}>${esc(x)}</option>`).join('')}`;
  }
  function treatmentOptions(selected = '', empty = 'Todos los tratamientos') {
    return `<option value="">${esc(empty)}</option>${state.tratamientos.map(t => `<option value="${esc(t.id)}" ${String(t.id)===String(selected)?'selected':''}>${esc((t.codigo_tto ? t.codigo_tto + ' · ' : '') + (t.nombre_tto || ''))}</option>`).join('')}`;
  }
  function materialOptions(selected = '', empty = '') {
    const prefix = empty ? `<option value="">${esc(empty)}</option>` : '';
    return `${prefix}${state.materiales.map(m => `<option value="${esc(m.id)}" ${String(m.id)===String(selected)?'selected':''}>${esc(m.nombre || '')}</option>`).join('')}`;
  }
  function doctorOptions(selected = '', empty = 'Todos los doctores') {
    const names = state.doctores.length ? state.doctores.map(d => d.nombre) : Array.from(new Set(state.produccion.map(p => p.doctor).filter(Boolean))).sort();
    return `<option value="">${esc(empty)}</option>${names.map(d => `<option value="${esc(d)}" ${String(d)===String(selected)?'selected':''}>${esc(d)}</option>`).join('')}`;
  }
  function proveedorList() {
    return Array.from(new Set([
      ...state.materiales.map(m => m.proveedor_preferente).filter(Boolean),
      ...state.precios.map(p => p.proveedor).filter(Boolean),
      ...state.tratamientos.map(t => t.proveedor_laboratorio || t.laboratorio || t.proveedor).filter(Boolean),
      ...state.facturas.map(f => f.proveedor).filter(Boolean)
    ])).sort((a,b)=>String(a).localeCompare(String(b),'es'));
  }
  function proveedorOptions(selected = '', empty = 'Todos los proveedores') { return options(proveedorList(), selected, empty); }

  async function dbSelect(table) {
    const s = getSB(); if (!s) return [];
    const { data, error } = await s.from(table).select('*');
    if (error) throw new Error(`${table}: ${error.message}`);
    return data || [];
  }
  async function dbSafeSelect(table) { try { return await dbSelect(table); } catch (e) { console.warn(e.message || e); return []; } }
  async function dbInsert(table, payload) {
    const s = getSB(); if (!s) throw new Error('Supabase no está conectado.');
    const { data, error } = await s.from(table).insert(payload).select();
    if (error) throw new Error(`${table}: ${error.message}`);
    return data?.[0] || null;
  }
  async function dbUpdate(table, id, payload) {
    const s = getSB(); if (!s) throw new Error('Supabase no está conectado.');
    const { error } = await s.from(table).update(payload).eq('id', id);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
  async function dbDelete(table, id) {
    const s = getSB(); if (!s) throw new Error('Supabase no está conectado.');
    const { error } = await s.from(table).delete().eq('id', id);
    if (error) throw new Error(`${table}: ${error.message}`);
  }

  async function loadPedidosData() {
    const s = getSB();
    if (!s) { state.error = 'Supabase no está conectado. Configura Supabase para guardar y leer Pedidos clínicos.'; render(); return; }
    state.loading = true; state.error = ''; render();
    try {
      const [tratamientos, materiales, recetas, produccion, precios, pedidos, doctores, facturas, facturaLineas, laboratorioCostes] = await Promise.all([
        dbSelect('tratamientos_catalogo'),
        dbSelect('materiales_catalogo'),
        dbSelect('tratamiento_materiales'),
        dbSelect('ttos_realizados'),
        dbSelect('material_precios'),
        dbSafeSelect('pedidos_recomendados'),
        dbSafeSelect('doctores_catalogo'),
        dbSafeSelect('facturas_clinicas'),
        dbSafeSelect('factura_lineas_clinicas'),
        dbSafeSelect('laboratorio_costes')
      ]);
      state.tratamientos = tratamientos.sort((a,b)=>String(a.nombre_tto||'').localeCompare(String(b.nombre_tto||''),'es'));
      state.materiales = materiales.sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
      state.recetas = recetas;
      state.produccion = produccion.sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
      state.precios = precios.sort((a,b)=>String(a.proveedor||'').localeCompare(String(b.proveedor||''),'es'));
      state.pedidos = pedidos.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
      state.doctores = doctores.sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
      state.facturas = facturas.sort((a,b)=>String(b.fecha_factura||b.created_at||'').localeCompare(String(a.fecha_factura||a.created_at||'')));
      state.facturaLineas = facturaLineas;
      state.laboratorioCostes = laboratorioCostes;
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
    if (!material) return null;
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
  function labCostForProduccion(p) {
    const hist = norm(p.numero_historial || p.historial || '');
    return state.laboratorioCostes.filter(l => {
      if (l.produccion_id && String(l.produccion_id) === String(p.id)) return true;
      if (hist && norm(l.numero_historial) === hist) return true;
      return false;
    }).reduce((s,l)=>s+num(l.total || l.importe_total || l.importe_base),0);
  }
  function costeMaterialProduccion(p) {
    const t = getTratamientoForProd(p);
    if (!t) return 0;
    return costeMaterialTratamiento(t.id) * (num(p.cantidad) || 1);
  }
  function costeLaboratorioEstimadoProduccion(p) {
    const real = labCostForProduccion(p);
    if (real) return real;
    const t = getTratamientoForProd(p);
    return num(t?.coste_laboratorio_estimado) * (num(p.cantidad) || 1);
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
      if (f.historial && !norm(p.numero_historial || p.historial || '').includes(norm(f.historial))) return false;
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
  function filteredTratamientos() {
    const f = state.filters;
    return state.tratamientos.filter(t => {
      if (f.familia && familyOf(t) !== f.familia) return false;
      if (f.proveedor && String(t.proveedor_laboratorio || '') !== f.proveedor) return false;
      return true;
    });
  }

  function dashboardStats() {
    const rows = filteredProduccion();
    const cantidad = rows.reduce((s,p)=>s+(num(p.cantidad)||1),0);
    const importe = rows.reduce((s,p)=>s+num(p.importe || p.importe_facturado),0);
    const costeMaterial = rows.reduce((s,p)=>s+costeMaterialProduccion(p),0);
    const costeLab = rows.reduce((s,p)=>s+costeLaboratorioEstimadoProduccion(p),0);
    const margen = importe - costeMaterial - costeLab;
    const pedidoRows = calcularPedidoRecomendado(false);
    const pedido = pedidoRows.reduce((s,p)=>s+num(p.cantidad_recomendada)*num(p.precio_estimado),0);
    return { registros: rows.length, cantidad, importe, costeMaterial, costeLab, margen, pedido, pedidoCount: pedidoRows.length, margenPct: importe ? margen/importe*100 : 0 };
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
    setTimeout(() => { if (box) box.textContent = ''; }, 5500);
  }

  function render() {
    const el = document.getElementById('page-pedidos'); if (!el) return;
    el.innerHTML = `
      <div class="ped-head">
        <div>
          <h1>Pedidos clínicos</h1>
          <div class="sub">Análisis de producción, consumo, stock, pedidos y laboratorio. Los datos se introducen solo en Datos o Importar.</div>
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
        ${tabButton('datos','Datos')}
        ${tabButton('importar','Importar')}
      </div>
      ${state.loading ? '<div class="card"><div class="sub">Cargando Pedidos clínicos...</div></div>' : renderTab()}
    `;
    bindEvents();
  }
  function tabButton(id,label) { return `<button class="clinical-tab ${state.tab===id?'active':''}" data-ped-tab="${id}">${label}</button>`; }
  function subButton(kind, id, label, active) { return `<button class="clinical-tab small ${active===id?'active':''}" data-${kind}="${id}">${label}</button>`; }
  function renderTab() {
    if (state.tab === 'produccion') return renderProduccion();
    if (state.tab === 'tratamientos') return renderTratamientos();
    if (state.tab === 'materiales') return renderMateriales();
    if (state.tab === 'recetas') return renderRecetas();
    if (state.tab === 'precios') return renderPrecios();
    if (state.tab === 'pedido') return renderPedido();
    if (state.tab === 'datos') return renderDatos();
    if (state.tab === 'importar') return renderImportar();
    return renderDashboard();
  }

  function renderGlobalFilters(includeMaterial = false, includeProveedor = false, includeHistorial = false) {
    const desdeVal = state.filters.desde || monthStart();
    const hastaVal = state.filters.hasta || monthEnd();
    return `<div class="card mb ped-filter-card"><div class="ped-filters">
      <label class="filter-field"><span>Periodo</span><select data-filter="periodo"><option value="mes" ${state.filters.periodo==='mes'?'selected':''}>Mes en curso</option><option value="rango" ${state.filters.periodo==='rango'?'selected':''}>Fecha a fecha</option></select></label>
      <label class="filter-field"><span>Desde</span><input type="date" data-filter="desde" value="${esc(desdeVal)}"></label>
      <label class="filter-field"><span>Hasta</span><input type="date" data-filter="hasta" value="${esc(hastaVal)}"></label>
      <label class="filter-field"><span>Familia TTO</span><select data-filter="familia">${options(FAMILIAS_TTO, state.filters.familia, 'Todas las familias TTO')}</select></label>
      <label class="filter-field"><span>Doctor</span><select data-filter="doctor">${doctorOptions(state.filters.doctor)}</select></label>
      <label class="filter-field"><span>Tratamiento</span><select data-filter="tratamiento">${treatmentOptions(state.filters.tratamiento)}</select></label>
      ${includeMaterial ? `<label class="filter-field"><span>Familia material</span><select data-filter="familiaMaterial">${options(FAMILIAS_MATERIAL, state.filters.familiaMaterial, 'Todas las familias material')}</select></label>` : ''}
      ${includeProveedor ? `<label class="filter-field"><span>Proveedor</span><select data-filter="proveedor">${proveedorOptions(state.filters.proveedor, 'Todos los proveedores')}</select></label>` : ''}
      ${includeHistorial ? `<label class="filter-field"><span>Nº historial</span><input data-filter="historial" value="${esc(state.filters.historial)}" placeholder="Buscar historial"></label>` : ''}
      <button class="btn bg2btn" id="applyPedDateRange">Aplicar rango</button>
      <button class="btn bg2btn" id="usePedCurrentMonth">Mes en curso</button>
      <button class="btn bg2btn" id="clearPedFilters">Limpiar filtros</button>
    </div><div class="sub" style="margin-top:8px">Periodo activo: ${state.filters.periodo==='mes' ? `mes en curso (${esc(monthStart())} → ${esc(monthEnd())})` : `${esc(desdeVal)} → ${esc(hastaVal)}`}.</div></div>`;
  }

  function renderDashboard() {
    const st = dashboardStats();
    const pedidoRows = calcularPedidoRecomendado(false);
    const prod = filteredProduccion();
    const consumo = calcularConsumoMaterial();
    const topTtos = prod.slice(0,8).map(p => ({...p, coste: costeMaterialProduccion(p), lab: costeLaboratorioEstimadoProduccion(p), margen: num(p.importe || p.importe_facturado)-costeMaterialProduccion(p)-costeLaboratorioEstimadoProduccion(p)}));
    return `
      ${renderGlobalFilters(true, false, true)}
      <div class="metrics m4 clinical-grid">
        <div class="metric"><div class="ml">Producción</div><div class="mv">${st.cantidad}</div><div class="ms">${eur(st.importe)} · ${st.registros} registro(s)</div></div>
        <div class="metric"><div class="ml">Material consumido</div><div class="mv">${Array.from(consumo.values()).reduce((a,b)=>a+b,0).toFixed(1)}</div><div class="ms">Unidades estimadas según recetas</div></div>
        <div class="metric"><div class="ml">Coste material + laboratorio</div><div class="mv">${eur(st.costeMaterial + st.costeLab)}</div><div class="ms">Material ${eur(st.costeMaterial)} · Lab ${eur(st.costeLab)}</div></div>
        <div class="metric"><div class="ml">Margen bruto clínico</div><div class="mv ${st.margen>=0?'up':'dn'}">${eur(st.margen)}</div><div class="ms">${st.margenPct.toFixed(1)}%</div></div>
      </div>
      <div class="grid2">
        <div class="card"><div class="ch"><div class="ct">Pedido recomendado</div><button class="btn bg2btn" id="genPedidoDash">Generar pedido</button></div><div class="tw"><table><thead><tr><th>Material</th><th>Consumo</th><th>Stock</th><th>Pedir</th><th>Proveedor</th><th>Estimado</th></tr></thead><tbody>${pedidoRows.slice(0,10).map(r=>`<tr><td>${esc(r.material_nombre)}</td><td>${r.consumo_previsto.toFixed(1)}</td><td>${r.stock_actual}</td><td><strong>${r.cantidad_recomendada.toFixed(1)}</strong></td><td>${esc(r.proveedor_sugerido||'—')}</td><td>${eur(num(r.cantidad_recomendada)*num(r.precio_estimado))}</td></tr>`).join('') || tableEmpty(6,'Sin materiales pendientes.')}</tbody></table></div></div>
        <div class="card"><div class="ct">Última producción con margen estimado</div><div class="tw"><table><thead><tr><th>Fecha</th><th>Historial</th><th>Familia</th><th>TTO</th><th>Doctor</th><th>Ingreso</th><th>Coste</th><th>Margen</th></tr></thead><tbody>${topTtos.map(p=>{ const t=getTratamientoForProd(p); return `<tr><td>${esc(dateStr(p.fecha))}</td><td>${esc(p.numero_historial||'')}</td><td>${esc(p.familia||familyOf(t))}</td><td>${esc(p.tratamiento||t?.nombre_tto||'—')}</td><td>${esc(p.doctor||'')}</td><td>${eur(p.importe||p.importe_facturado)}</td><td>${eur(p.coste+p.lab)}</td><td class="${p.margen>=0?'up':'dn'}">${eur(p.margen)}</td></tr>`; }).join('') || tableEmpty(8,'Sin producción registrada.')}</tbody></table></div></div>
      </div>`;
  }

  function renderProduccion() {
    const rows = filteredProduccion();
    return `${renderGlobalFilters(false, false, true)}
      <div class="card"><div class="ct">Producción realizada</div><div class="sub mb">Vista de análisis. Para añadir o editar registros, usa la pestaña <strong>Datos</strong> o <strong>Importar</strong>.</div><div class="tw"><table><thead><tr><th>Fecha</th><th>Historial</th><th>Familia</th><th>Tratamiento</th><th>Doctor</th><th>Cant.</th><th>Importe</th><th>Material</th><th>Laboratorio</th><th>Margen</th><th>Obs.</th></tr></thead><tbody>${rows.map(p=>{ const t=getTratamientoForProd(p); const mat=costeMaterialProduccion(p); const lab=costeLaboratorioEstimadoProduccion(p); const imp=num(p.importe||p.importe_facturado); return `<tr><td>${esc(dateStr(p.fecha))}</td><td>${esc(p.numero_historial||'')}</td><td>${esc(p.familia||familyOf(t))}</td><td>${esc(p.tratamiento||t?.nombre_tto||'')}</td><td>${esc(p.doctor||'')}</td><td>${num(p.cantidad)||1}</td><td>${eur(imp)}</td><td>${eur(mat)}</td><td>${eur(lab)}</td><td class="${imp-mat-lab>=0?'up':'dn'}">${eur(imp-mat-lab)}</td><td>${esc(p.observaciones||'')}</td></tr>`; }).join('') || tableEmpty(11,'No hay producción para los filtros seleccionados.')}</tbody></table></div></div>`;
  }
  function renderTratamientos() {
    const rows = filteredTratamientos();
    return `${renderGlobalFilters(false, true, false)}
      <div class="card"><div class="ct">Tratamientos catálogo</div><div class="sub mb">Vista de consulta. Para crear o editar tratamientos, usa <strong>Datos</strong>.</div><div class="tw"><table><thead><tr><th>Código</th><th>Tratamiento</th><th>Familia</th><th>PVP</th><th>Material estimado</th><th>Laboratorio</th><th>Coste directo</th><th>Margen estimado</th><th>Proveedor/Lab.</th></tr></thead><tbody>${rows.map(t=>{ const mat=costeMaterialTratamiento(t.id); const lab=num(t.coste_laboratorio_estimado); const pvp=num(t.precio_base); return `<tr><td>${esc(t.codigo_tto||'')}</td><td>${esc(t.nombre_tto||'')}</td><td>${esc(familyOf(t))}</td><td>${eur(pvp)}</td><td>${eur(mat)}</td><td>${eur(lab)}</td><td>${eur(mat+lab)}</td><td class="${pvp-mat-lab>=0?'up':'dn'}">${eur(pvp-mat-lab)}</td><td>${esc(t.proveedor_laboratorio||'')}</td></tr>`; }).join('') || tableEmpty(9,'No hay tratamientos.')}</tbody></table></div></div>`;
  }
  function renderMateriales() {
    const rows = filteredMateriales();
    return `${renderGlobalFilters(true, true, false)}
      <div class="card"><div class="ct">Materiales</div><div class="sub mb">Vista de consulta. Para crear o editar materiales, usa <strong>Datos</strong>. Para altas por factura, usa <strong>Importar</strong>.</div><div class="tw"><table><thead><tr><th>Material</th><th>Familia</th><th>Unidad</th><th>Stock</th><th>Mín.</th><th>Coste estimado</th><th>Proveedor preferente</th><th>Mejor precio</th><th>Estado</th></tr></thead><tbody>${rows.map(m=>{ const bp=bestPrice(m); const bajo=num(m.stock_actual)<num(m.stock_minimo); return `<tr><td>${esc(m.nombre||'')}</td><td>${esc(getMaterialFamily(m))}</td><td>${esc(m.unidad||'')}</td><td>${num(m.stock_actual)}</td><td>${num(m.stock_minimo)}</td><td>${eur(num(m.coste_medio||m.coste_ultimo))}</td><td>${esc(m.proveedor_preferente||'')}</td><td>${bp?`${eur(bp.precio)} · ${esc(bp.proveedor||'')}`:'—'}</td><td class="${bajo?'dn':'up'}">${bajo?'Bajo mínimo':'OK'}</td></tr>`; }).join('') || tableEmpty(9,'No hay materiales.')}</tbody></table></div></div>`;
  }
  function renderRecetas() {
    return `<div class="card"><div class="ct">Recetas por TTO</div><div class="sub mb">Vista de consulta. Para crear o editar recetas, usa <strong>Datos</strong>.</div><div class="tw"><table><thead><tr><th>Tratamiento</th><th>Familia</th><th>Material</th><th>Familia material</th><th>Cantidad</th><th>Unidad</th><th>Coste unitario</th><th>Coste línea</th></tr></thead><tbody>${state.recetas.map(r=>{ const t=tratamientoById(r.tratamiento_id); const m=materialById(r.material_id); const cu=costeUnitarioReceta(r); return `<tr><td>${esc(t?.nombre_tto||'')}</td><td>${esc(familyOf(t))}</td><td>${esc(m?.nombre||'')}</td><td>${esc(getMaterialFamily(m))}</td><td>${num(r.cantidad_estimada)}</td><td>${esc(r.unidad||m?.unidad||'')}</td><td>${eur(cu)}</td><td>${eur(num(r.cantidad_estimada)*cu)}</td></tr>`; }).join('') || tableEmpty(8,'No hay recetas registradas.')}</tbody></table></div></div>`;
  }
  function renderPrecios() {
    return `${renderGlobalFilters(true, true, false)}
      <div class="card"><div class="ct">Precios proveedores</div><div class="sub mb">Vista de comparación. Para añadir precios, usa <strong>Datos</strong> o <strong>Importar</strong>.</div><div class="tw"><table><thead><tr><th>Material</th><th>Familia</th><th>Proveedor</th><th>Referencia</th><th>Precio</th><th>Unidad compra</th><th>Plazo</th><th>Fecha precio</th></tr></thead><tbody>${state.precios.filter(p=>{ const m=materialById(p.material_id); if (state.filters.familiaMaterial && getMaterialFamily(m)!==state.filters.familiaMaterial) return false; if (state.filters.proveedor && p.proveedor!==state.filters.proveedor) return false; return true; }).map(p=>{ const m=materialById(p.material_id); return `<tr><td>${esc(m?.nombre||'')}</td><td>${esc(getMaterialFamily(m))}</td><td>${esc(p.proveedor||'')}</td><td>${esc(p.referencia||'')}</td><td>${eur(p.precio)}</td><td>${esc(p.unidad_compra||'')}</td><td>${p.plazo_entrega_dias?esc(p.plazo_entrega_dias)+' días':'—'}</td><td>${esc(dateStr(p.fecha_precio))}</td></tr>`; }).join('') || tableEmpty(8,'No hay precios registrados.')}</tbody></table></div></div>`;
  }
  function renderPedido() {
    const rows = calcularPedidoRecomendado(false);
    return `${renderGlobalFilters(true, true, false)}
      <div class="card"><div class="ch"><div><div class="ct">Pedido recomendado</div><div class="sub">Cálculo: consumo previsto + stock mínimo - stock actual. Generar pedido guarda una foto del cálculo.</div></div><button class="btn" id="genPedido">Generar pedido</button></div><div class="tw"><table><thead><tr><th>Material</th><th>Consumo previsto</th><th>Stock</th><th>Mínimo</th><th>Cantidad a pedir</th><th>Proveedor</th><th>Precio</th><th>Coste estimado</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.material_nombre)}</td><td>${r.consumo_previsto.toFixed(2)}</td><td>${r.stock_actual}</td><td>${r.stock_minimo}</td><td><strong>${r.cantidad_recomendada.toFixed(2)}</strong></td><td>${esc(r.proveedor_sugerido||'')}</td><td>${eur(r.precio_estimado)}</td><td>${eur(num(r.cantidad_recomendada)*num(r.precio_estimado))}</td></tr>`).join('') || tableEmpty(8,'No hay materiales a pedir con los filtros actuales.')}</tbody></table></div></div>`;
  }

  function renderDatos() {
    return `<div class="card mb"><div class="ct">Datos</div><div class="sub">Zona única para introducir y editar datos manuales. Las demás pestañas son solo análisis.</div></div>
      <div class="clinical-tabs sub-tabs">
        ${subButton('data-section','produccion','Producción',state.dataSection)}
        ${subButton('data-section','tratamientos','Tratamientos',state.dataSection)}
        ${subButton('data-section','materiales','Materiales',state.dataSection)}
        ${subButton('data-section','recetas','Recetas',state.dataSection)}
        ${subButton('data-section','precios','Precios',state.dataSection)}
        ${subButton('data-section','stock','Stock',state.dataSection)}
      </div>
      ${renderDatosSection()}`;
  }
  function renderDatosSection() {
    if (state.dataSection === 'tratamientos') return renderDatosTratamientos();
    if (state.dataSection === 'materiales') return renderDatosMateriales();
    if (state.dataSection === 'recetas') return renderDatosRecetas();
    if (state.dataSection === 'precios') return renderDatosPrecios();
    if (state.dataSection === 'stock') return renderDatosStock();
    return renderDatosProduccion();
  }
  function renderDatosProduccion() {
    return `<div class="card mb"><div class="ct">Añadir producción manual</div><div class="ped-form wide">
      <input id="prodFecha" type="date" value="${today()}">
      <input id="prodHistorial" placeholder="Nº historial paciente">
      <select id="prodFamilia">${options(FAMILIAS_TTO, '', 'Familia')}</select>
      <select id="prodTratId"><option value="">Tratamiento catálogo</option>${state.tratamientos.map(t=>`<option value="${esc(t.id)}">${esc((t.codigo_tto? t.codigo_tto+' · ':'') + t.nombre_tto)}</option>`).join('')}</select>
      <input id="prodTratNombre" placeholder="Tratamiento libre si no está en catálogo">
      <select id="prodDoctorSel">${doctorOptions('', 'Doctor desde KliniKare/importación')}</select>
      <input id="prodCantidad" type="number" step="0.01" value="1" placeholder="Cantidad">
      <input id="prodImporte" inputmode="decimal" placeholder="Importe facturado">
      <input id="prodObs" placeholder="Observaciones">
      <button class="btn" id="addProd">Guardar producción</button>
    </div></div>
    <div class="card"><div class="ct">Últimos registros de producción</div><div class="tw"><table><thead><tr><th>Fecha</th><th>Historial</th><th>Familia</th><th>Tratamiento</th><th>Doctor</th><th>Cant.</th><th>Importe</th><th></th></tr></thead><tbody>${state.produccion.slice(0,25).map(p=>`<tr><td>${esc(dateStr(p.fecha))}</td><td>${esc(p.numero_historial||'')}</td><td>${esc(p.familia||'')}</td><td>${esc(p.tratamiento||'')}</td><td>${esc(p.doctor||'')}</td><td>${num(p.cantidad)||1}</td><td>${eur(p.importe||p.importe_facturado)}</td><td><button class="mini danger" data-del="ttos_realizados:${esc(p.id)}">Eliminar</button></td></tr>`).join('') || tableEmpty(8,'Sin producción.')}</tbody></table></div></div>`;
  }
  function renderDatosTratamientos() {
    return `<div class="card mb"><div class="ct">Añadir tratamiento catálogo</div><div class="ped-form">
      <input id="tratCodigo" placeholder="Código TTO">
      <input id="tratNombre" placeholder="Nombre tratamiento">
      <select id="tratFamilia">${options(FAMILIAS_TTO, '', 'Familia')}</select>
      <input id="tratPrecio" inputmode="decimal" placeholder="PVP / precio base">
      <input id="tratLab" inputmode="decimal" placeholder="Coste laboratorio estimado">
      <input id="tratProv" list="proveedoresList" placeholder="Proveedor / laboratorio">
      <button class="btn" id="addTrat">Guardar tratamiento</button>
    </div></div><div class="card"><div class="ct">Tratamientos registrados</div><div class="tw"><table><thead><tr><th>Código</th><th>Nombre</th><th>Familia</th><th>PVP</th><th>Lab.</th><th>Proveedor</th><th></th></tr></thead><tbody>${state.tratamientos.map(t=>`<tr><td>${esc(t.codigo_tto||'')}</td><td>${esc(t.nombre_tto||'')}</td><td>${esc(familyOf(t))}</td><td>${eur(t.precio_base)}</td><td>${eur(t.coste_laboratorio_estimado)}</td><td>${esc(t.proveedor_laboratorio||'')}</td><td><button class="mini danger" data-del="tratamientos_catalogo:${esc(t.id)}">Eliminar</button></td></tr>`).join('') || tableEmpty(7,'Sin tratamientos.')}</tbody></table></div></div>`;
  }
  function renderDatosMateriales() {
    return `<div class="card mb"><div class="ct">Añadir material</div><div class="ped-form">
      <input id="matNombre" placeholder="Nombre material">
      <select id="matFamilia">${options(FAMILIAS_MATERIAL, '', 'Familia')}</select>
      <input id="matUnidad" placeholder="Unidad" value="unidad">
      <input id="matStock" inputmode="decimal" placeholder="Stock actual">
      <input id="matMin" inputmode="decimal" placeholder="Stock mínimo">
      <input id="matCoste" inputmode="decimal" placeholder="Coste estimado">
      <input id="matProveedor" list="proveedoresList" placeholder="Proveedor preferente">
      <button class="btn" id="addMat">Guardar material</button>
    </div></div><div class="card"><div class="ct">Materiales registrados</div><div class="tw"><table><thead><tr><th>Material</th><th>Familia</th><th>Unidad</th><th>Stock</th><th>Mín.</th><th>Coste</th><th>Proveedor</th><th></th></tr></thead><tbody>${state.materiales.map(m=>`<tr><td>${esc(m.nombre||'')}</td><td>${esc(getMaterialFamily(m))}</td><td>${esc(m.unidad||'')}</td><td>${num(m.stock_actual)}</td><td>${num(m.stock_minimo)}</td><td>${eur(m.coste_medio||m.coste_ultimo)}</td><td>${esc(m.proveedor_preferente||'')}</td><td><button class="mini danger" data-del="materiales_catalogo:${esc(m.id)}">Eliminar</button></td></tr>`).join('') || tableEmpty(8,'Sin materiales.')}</tbody></table></div></div>`;
  }
  function renderDatosRecetas() {
    return `<div class="card mb"><div class="ct">Crear receta por TTO</div><div class="ped-form">
      <select id="recTrat">${treatmentOptions('', 'Tratamiento')}</select>
      <select id="recMat">${materialOptions('', 'Material')}</select>
      <input id="recCantidad" inputmode="decimal" placeholder="Cantidad por TTO" value="1">
      <input id="recCoste" inputmode="decimal" placeholder="Coste unitario opcional">
      <button class="btn" id="addRec">Añadir receta</button>
    </div></div><div class="card"><div class="ct">Recetas registradas</div><div class="tw"><table><thead><tr><th>Tratamiento</th><th>Material</th><th>Cantidad</th><th>Coste unitario</th><th></th></tr></thead><tbody>${state.recetas.map(r=>`<tr><td>${esc(tratamientoById(r.tratamiento_id)?.nombre_tto||'')}</td><td>${esc(materialById(r.material_id)?.nombre||'')}</td><td>${num(r.cantidad_estimada)}</td><td>${eur(costeUnitarioReceta(r))}</td><td><button class="mini danger" data-del="tratamiento_materiales:${esc(r.id)}">Eliminar</button></td></tr>`).join('') || tableEmpty(5,'Sin recetas.')}</tbody></table></div></div>`;
  }
  function renderDatosPrecios() {
    return `<div class="card mb"><div class="ct">Añadir precio proveedor</div><div class="ped-form">
      <select id="precioMat">${materialOptions('', 'Material')}</select>
      <input id="precioProv" list="proveedoresList" placeholder="Proveedor">
      <input id="precioRef" placeholder="Referencia">
      <input id="precioVal" inputmode="decimal" placeholder="Precio">
      <input id="precioUnidad" placeholder="Unidad compra">
      <input id="precioPlazo" type="number" placeholder="Plazo días">
      <input id="precioUrl" placeholder="URL producto">
      <button class="btn" id="addPrecio">Guardar precio</button>
    </div></div><div class="card"><div class="ct">Precios registrados</div><div class="tw"><table><thead><tr><th>Material</th><th>Proveedor</th><th>Referencia</th><th>Precio</th><th>Unidad</th><th></th></tr></thead><tbody>${state.precios.map(p=>`<tr><td>${esc(materialById(p.material_id)?.nombre||'')}</td><td>${esc(p.proveedor||'')}</td><td>${esc(p.referencia||'')}</td><td>${eur(p.precio)}</td><td>${esc(p.unidad_compra||'')}</td><td><button class="mini danger" data-del="material_precios:${esc(p.id)}">Eliminar</button></td></tr>`).join('') || tableEmpty(6,'Sin precios.')}</tbody></table></div></div>`;
  }
  function renderDatosStock() {
    return `<div class="card"><div class="ct">Ajuste rápido de stock</div><div class="sub mb">Usa este bloque para correcciones manuales. Las facturas de compra se deben cargar en Importar.</div><div class="tw"><table><thead><tr><th>Material</th><th>Familia</th><th>Stock actual</th><th>Nuevo stock</th><th></th></tr></thead><tbody>${state.materiales.map(m=>`<tr><td>${esc(m.nombre||'')}</td><td>${esc(getMaterialFamily(m))}</td><td>${num(m.stock_actual)}</td><td><input class="mini-input" id="stock-${esc(m.id)}" inputmode="decimal" value="${num(m.stock_actual)}"></td><td><button class="mini" data-stock-save="${esc(m.id)}">Guardar</button></td></tr>`).join('') || tableEmpty(5,'Sin materiales.')}</tbody></table></div></div>`;
  }

  function renderImportar() {
    return `<div class="card mb"><div class="ct">Importar</div><div class="sub">Carga masiva y facturas PDF. Las facturas quedan pendientes de validar; laboratorio se cruza por número de historial y no suma stock.</div></div>
      <div class="clinical-tabs sub-tabs">
        ${subButton('import-section','pdf','Facturas PDF',state.importSection)}
        ${subButton('import-section','csv','CSV / Excel estructurado',state.importSection)}
        ${subButton('import-section','facturas','Facturas importadas',state.importSection)}
      </div>
      ${state.importSection === 'csv' ? renderImportCSV() : state.importSection === 'facturas' ? renderFacturasImportadas() : renderImportPDF()}`;
  }
  function renderImportPDF() {
    return `<div class="card mb"><div class="ct">Subir factura PDF</div><div class="sub mb">Selecciona familia y proveedor antes de subirla. Esto simplifica la clasificación y reduce errores.</div>
      <div class="ped-form wide">
        <select id="factFamilia">${options(FAMILIAS_FACTURA, '', 'Familia de factura')}</select>
        <input id="factProveedor" list="proveedoresList" placeholder="Proveedor concreto">
        <input id="factNumero" placeholder="Nº factura">
        <input id="factFecha" type="date" value="${today()}">
        <input id="factHistorial" placeholder="Nº historial paciente (clave en laboratorio)">
        <input id="factPaciente" placeholder="Paciente ref. opcional / anonimizado">
        <input id="factConcepto" placeholder="Concepto / tratamiento / material principal">
        <input id="factBase" inputmode="decimal" placeholder="Base imponible">
        <input id="factIva" inputmode="decimal" placeholder="IVA">
        <input id="factTotal" inputmode="decimal" placeholder="Total factura">
        <input id="factPdf" type="file" accept="application/pdf">
        <input id="factObs" placeholder="Observaciones">
        <button class="btn" id="guardarFacturaPdf">Guardar factura pendiente</button>
      </div>
      <div class="sub mt"><strong>Regla:</strong> Fungibles/Implantes/Aditamento/Biomaterial alimentan stock y precios cuando valides líneas. Laboratorio crea coste directo por historial para cruzarlo con Producción, Ingresos y Gastos.</div>
    </div>
    <div class="grid2">
      <div class="card"><div class="ct">Líneas manuales opcionales</div><div class="sub mb">En v51 la lectura automática del PDF queda preparada para v52. Ahora puedes registrar la factura y luego validar líneas manualmente.</div><div class="ped-form"><input disabled placeholder="Se activará al abrir una factura"><select disabled><option>Material sugerido</option></select><input disabled placeholder="Cantidad"><input disabled placeholder="Precio"><button class="btn bg2btn" disabled>Añadir línea</button></div></div>
      <div class="card"><div class="ct">Cruce de laboratorio</div><div class="tw"><table><thead><tr><th>Historial</th><th>Producción encontrada</th><th>Coste lab.</th><th>Estado</th></tr></thead><tbody>${state.laboratorioCostes.slice(0,8).map(l=>{ const match = state.produccion.find(p=>norm(p.numero_historial)===norm(l.numero_historial)); return `<tr><td>${esc(l.numero_historial||'')}</td><td>${match?esc(match.tratamiento||'Producción encontrada'):'—'}</td><td>${eur(l.total||l.importe_total||l.importe_base)}</td><td class="${match?'up':'dn'}">${match?'Cruzado':'Pendiente'}</td></tr>`; }).join('') || tableEmpty(4,'Sin costes de laboratorio importados.')}</tbody></table></div></div>
    </div>`;
  }
  function renderImportCSV() {
    return `<div class="grid2">
      <div class="card"><div class="ct">Importar datos estructurados</div><div class="sub mb">Sube CSV separados por punto y coma o coma. Se recomienda exportar primero cada plantilla desde Datos.</div>
        <div class="ped-form"><label class="btn bg2btn filelabel">Importar tratamientos<input id="importTratamientos" type="file" accept=".csv" hidden></label><label class="btn bg2btn filelabel">Importar materiales<input id="importMateriales" type="file" accept=".csv" hidden></label></div>
      </div>
      <div class="card"><div class="ct">Exportar plantillas</div><div class="sub mb">Descarga estructura actual para usar como plantilla.</div><div class="ped-form"><button class="btn bg2btn" id="expTrat">Exportar tratamientos</button><button class="btn bg2btn" id="expMat">Exportar materiales</button></div></div>
    </div>`;
  }
  function renderFacturasImportadas() {
    return `<div class="card"><div class="ct">Facturas importadas</div><div class="tw"><table><thead><tr><th>Fecha</th><th>Familia</th><th>Proveedor</th><th>Nº factura</th><th>Historial</th><th>Concepto</th><th>Total</th><th>Estado</th><th>Impacto</th></tr></thead><tbody>${state.facturas.map(f=>`<tr><td>${esc(dateStr(f.fecha_factura))}</td><td>${esc(f.familia_factura||f.familia||'')}</td><td>${esc(f.proveedor||'')}</td><td>${esc(f.numero_factura||'')}</td><td>${esc(f.numero_historial||'')}</td><td>${esc(f.tratamiento_texto||f.concepto||'')}</td><td>${eur(f.total)}</td><td>${esc(f.estado||'pendiente')}</td><td>${esc(f.tipo_impacto||'')}</td></tr>`).join('') || tableEmpty(9,'No hay facturas importadas.')}</tbody></table></div></div>`;
  }

  function bindEvents() {
    const page = document.getElementById('page-pedidos'); if (!page) return;
    if (page.dataset.boundV51 === '1') return;
    page.dataset.boundV51 = '1';
    page.addEventListener('click', async ev => {
      const tab = ev.target.closest('[data-ped-tab]');
      if (tab) { state.tab = tab.dataset.pedTab; render(); return; }
      const ds = ev.target.closest('[data-data-section]');
      if (ds) { state.dataSection = ds.dataset.dataSection; render(); return; }
      const is = ev.target.closest('[data-import-section]');
      if (is) { state.importSection = is.dataset.importSection; render(); return; }
      if (ev.target.id === 'pedRefresh') { await loadPedidosData(); return; }
      if (ev.target.id === 'applyPedDateRange') { state.filters.periodo='rango'; state.filters.desde=q('[data-filter="desde"]')?.value||monthStart(); state.filters.hasta=q('[data-filter="hasta"]')?.value||monthEnd(); render(); return; }
      if (ev.target.id === 'usePedCurrentMonth') { state.filters.periodo='mes'; state.filters.desde=''; state.filters.hasta=''; render(); return; }
      if (ev.target.id === 'clearPedFilters') { state.filters = { periodo:'mes', desde:'', hasta:'', familia:'', doctor:'', tratamiento:'', familiaMaterial:'', proveedor:'', historial:'' }; render(); return; }
      if (ev.target.id === 'genPedido' || ev.target.id === 'genPedidoDash') { calcularPedidoRecomendado(true); return; }
      if (ev.target.id === 'addProd') { try { await addProduccion(); } catch(e){ toast(e.message||String(e),true); } return; }
      if (ev.target.id === 'addTrat') { try { await addTratamiento(); } catch(e){ toast(e.message||String(e),true); } return; }
      if (ev.target.id === 'addMat') { try { await addMaterial(); } catch(e){ toast(e.message||String(e),true); } return; }
      if (ev.target.id === 'addRec') { try { await addReceta(); } catch(e){ toast(e.message||String(e),true); } return; }
      if (ev.target.id === 'addPrecio') { try { await addPrecio(); } catch(e){ toast(e.message||String(e),true); } return; }
      if (ev.target.id === 'guardarFacturaPdf') { try { await guardarFacturaPdf(); } catch(e){ toast(e.message||String(e),true); } return; }
      if (ev.target.id === 'expTrat') { exportCSV('tratamientos'); return; }
      if (ev.target.id === 'expMat') { exportCSV('materiales'); return; }
      const del = ev.target.closest('[data-del]');
      if (del) { const [table,id] = del.dataset.del.split(':'); if (confirm('¿Eliminar registro?')) { try { await dbDelete(table,id); await loadPedidosData(); toast('Registro eliminado.'); } catch(e){ toast(e.message||String(e),true); } } return; }
      const stock = ev.target.closest('[data-stock-save]');
      if (stock) { const id = stock.dataset.stockSave; const input = q(`#stock-${CSS.escape(id)}`); try { await dbUpdate('materiales_catalogo', id, { stock_actual: num(input.value) }); await loadPedidosData(); toast('Stock actualizado.'); } catch(e){ toast(e.message||String(e),true); } return; }
    });
    page.addEventListener('input', ev => {
      const filter = ev.target.closest('[data-filter]');
      if (filter) {
        const key = filter.dataset.filter;
        state.filters[key] = filter.value;
        if (key === 'desde' || key === 'hasta') state.filters.periodo = 'rango';
      }
    });
    page.addEventListener('change', async ev => {
      const filter = ev.target.closest('[data-filter]');
      if (filter) {
        const key = filter.dataset.filter;
        if (key === 'periodo') {
          state.filters.periodo = filter.value;
          if (filter.value === 'rango') { if (!state.filters.desde) state.filters.desde = monthStart(); if (!state.filters.hasta) state.filters.hasta = monthEnd(); }
        } else {
          state.filters[key] = filter.value;
          if (key === 'desde' || key === 'hasta') state.filters.periodo = 'rango';
        }
        render(); return;
      }
      if (ev.target?.id === 'importTratamientos') { await importCSV(ev.target.files?.[0], 'tratamientos'); return; }
      if (ev.target?.id === 'importMateriales') { await importCSV(ev.target.files?.[0], 'materiales'); return; }
    });
  }

  async function addProduccion() {
    const tId = q('#prodTratId').value;
    const t = tratamientoById(tId);
    const payload = {
      fecha: q('#prodFecha').value || today(),
      empresa: 'corporacion',
      numero_historial: q('#prodHistorial').value.trim(),
      familia: q('#prodFamilia').value || familyOf(t),
      tratamiento_id: tId || null,
      codigo_tto: t?.codigo_tto || null,
      tratamiento: q('#prodTratNombre').value.trim() || t?.nombre_tto || '',
      doctor: q('#prodDoctorSel').value,
      cantidad: num(q('#prodCantidad').value) || 1,
      importe: num(q('#prodImporte').value),
      importe_facturado: num(q('#prodImporte').value),
      estado: 'realizado',
      observaciones: q('#prodObs').value.trim(),
      origen: 'manual',
      external_id: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`
    };
    if (!payload.tratamiento) throw new Error('Indica tratamiento.');
    await dbInsert('ttos_realizados', payload); await loadPedidosData(); toast('Producción guardada.');
  }
  async function addTratamiento() {
    const payload = { codigo_tto:q('#tratCodigo').value.trim()||null, nombre_tto:q('#tratNombre').value.trim(), familia:q('#tratFamilia').value, categoria:q('#tratFamilia').value, precio_base:num(q('#tratPrecio').value), coste_laboratorio_estimado:num(q('#tratLab').value), proveedor_laboratorio:q('#tratProv').value.trim(), activo:true };
    if (!payload.nombre_tto) throw new Error('Indica nombre del tratamiento.');
    await dbInsert('tratamientos_catalogo', payload); await loadPedidosData(); toast('Tratamiento guardado.');
  }
  async function addMaterial() {
    const payload = { nombre:q('#matNombre').value.trim(), familia:q('#matFamilia').value, categoria:q('#matFamilia').value, unidad:q('#matUnidad').value.trim()||'unidad', stock_actual:num(q('#matStock').value), stock_minimo:num(q('#matMin').value), coste_medio:num(q('#matCoste').value), coste_ultimo:num(q('#matCoste').value), proveedor_preferente:q('#matProveedor').value.trim(), activo:true };
    if (!payload.nombre) throw new Error('Indica nombre del material.');
    await dbInsert('materiales_catalogo', payload); await loadPedidosData(); toast('Material guardado.');
  }
  async function addReceta() {
    const mat = materialById(q('#recMat').value);
    const payload = { tratamiento_id:q('#recTrat').value, material_id:q('#recMat').value, cantidad_estimada:num(q('#recCantidad').value)||1, unidad:mat?.unidad||'unidad', tipo_consumo:'estimado', coste_estimado_unitario:num(q('#recCoste').value)||num(bestPrice(mat)?.precio)||num(mat?.coste_medio)||num(mat?.coste_ultimo) };
    if (!payload.tratamiento_id || !payload.material_id) throw new Error('Selecciona tratamiento y material.');
    await dbInsert('tratamiento_materiales', payload); await loadPedidosData(); toast('Material añadido a receta.');
  }
  async function addPrecio() {
    const payload = { material_id:q('#precioMat').value, proveedor:q('#precioProv').value.trim(), referencia:q('#precioRef').value.trim(), precio:num(q('#precioVal').value), unidad_compra:q('#precioUnidad').value.trim(), plazo_entrega_dias:q('#precioPlazo').value ? Number(q('#precioPlazo').value) : null, url_producto:q('#precioUrl').value.trim(), fecha_precio:today() };
    if (!payload.material_id) throw new Error('Selecciona material.'); if (!payload.proveedor) throw new Error('Indica proveedor.'); if (!payload.precio) throw new Error('Indica precio.');
    await dbInsert('material_precios', payload); await loadPedidosData(); toast('Precio guardado.');
  }
  async function guardarFacturaPdf() {
    const familia = q('#factFamilia').value;
    const proveedor = q('#factProveedor').value.trim();
    if (!familia) throw new Error('Selecciona familia de factura.');
    if (!proveedor) throw new Error('Indica proveedor.');
    const file = q('#factPdf').files?.[0];
    let archivo_pdf_url = '';
    if (file) {
      try {
        const s = getSB();
        const path = `${new Date().getFullYear()}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9_.-]/g,'_')}`;
        const { error } = await s.storage.from('facturas-clinicas').upload(path, file, { upsert:false, contentType:file.type || 'application/pdf' });
        if (!error) archivo_pdf_url = path;
        else console.warn('No se pudo subir PDF a storage, se guardará metadata:', error.message);
      } catch (e) { console.warn('Storage no disponible:', e.message || e); }
    }
    const payload = {
      familia_factura: familia,
      proveedor,
      fecha_factura: q('#factFecha').value || today(),
      numero_factura: q('#factNumero').value.trim(),
      numero_historial: q('#factHistorial').value.trim(),
      paciente_referencia: q('#factPaciente').value.trim(),
      tratamiento_texto: q('#factConcepto').value.trim(),
      importe_base: num(q('#factBase').value),
      iva: num(q('#factIva').value),
      total: num(q('#factTotal').value) || (num(q('#factBase').value) + num(q('#factIva').value)),
      archivo_pdf_url,
      archivo_nombre: file?.name || '',
      estado: 'pendiente_validacion',
      tipo_impacto: familia === 'Laboratorio' ? 'laboratorio_historial' : 'stock_precio',
      observaciones: q('#factObs').value.trim()
    };
    const factura = await dbInsert('facturas_clinicas', payload);
    if (familia === 'Laboratorio') {
      const prod = state.produccion.find(p => norm(p.numero_historial) && norm(p.numero_historial) === norm(payload.numero_historial));
      await dbInsert('laboratorio_costes', {
        factura_id: factura?.id || null,
        proveedor,
        fecha_factura: payload.fecha_factura,
        numero_factura: payload.numero_factura,
        numero_historial: payload.numero_historial,
        paciente_referencia: payload.paciente_referencia,
        tratamiento_texto: payload.tratamiento_texto,
        produccion_id: prod?.id || null,
        importe_base: payload.importe_base,
        iva: payload.iva,
        total: payload.total,
        estado_conciliacion: prod ? 'cruzado_historial' : 'pendiente_cruce',
        observaciones: payload.observaciones
      });
    }
    await loadPedidosData(); toast(familia === 'Laboratorio' ? 'Factura de laboratorio guardada y coste creado para cruce por historial.' : 'Factura guardada pendiente de validar líneas y stock.');
  }

  function exportCSV(type) {
    const rows = type==='materiales' ? state.materiales.map(m=>({nombre:m.nombre,familia:getMaterialFamily(m),unidad:m.unidad,stock_actual:m.stock_actual,stock_minimo:m.stock_minimo,coste_medio:m.coste_medio,proveedor_preferente:m.proveedor_preferente})) : state.tratamientos.map(t=>({codigo_tto:t.codigo_tto,nombre_tto:t.nombre_tto,familia:familyOf(t),precio_base:t.precio_base,coste_laboratorio_estimado:t.coste_laboratorio_estimado,proveedor_laboratorio:t.proveedor_laboratorio,activo:t.activo}));
    if (!rows.length) return toast('No hay datos para exportar.', true);
    const headers = Object.keys(rows[0]);
    const csv = [headers.join(';')].concat(rows.map(r=>headers.map(h=>`"${String(r[h]??'').replace(/"/g,'""')}"`).join(';'))).join('\n');
    const blob = new Blob([csv],{type:'text/csv;charset=utf-8'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${type}_pedidos_clinicos.csv`; a.click(); URL.revokeObjectURL(a.href);
  }
  async function importCSV(file, type) {
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean); if (lines.length < 2) return toast('CSV vacío.', true);
    const sep = lines[0].includes(';') ? ';' : ','; const headers = lines[0].split(sep).map(h=>norm(h));
    let count = 0;
    for (const line of lines.slice(1)) {
      const cells = line.split(sep).map(x=>x.replace(/^"|"$/g,'').replace(/""/g,'"'));
      const obj = {}; headers.forEach((h,i)=>obj[h]=cells[i]||'');
      if (type === 'materiales') {
        await dbInsert('materiales_catalogo', { nombre:obj.nombre||obj.material, familia:obj.familia, categoria:obj.familia, unidad:obj.unidad||'unidad', stock_actual:num(obj.stock_actual), stock_minimo:num(obj.stock_minimo), coste_medio:num(obj.coste_medio), coste_ultimo:num(obj.coste_medio), proveedor_preferente:obj.proveedor_preferente||obj.proveedor, activo:true });
      } else {
        await dbInsert('tratamientos_catalogo', { codigo_tto:obj.codigo_tto||obj.codigo, nombre_tto:obj.nombre_tto||obj.tratamiento||obj.nombre, familia:obj.familia, categoria:obj.familia, precio_base:num(obj.precio_base||obj.pvp), coste_laboratorio_estimado:num(obj.coste_laboratorio_estimado||obj.laboratorio), proveedor_laboratorio:obj.proveedor_laboratorio||obj.proveedor||obj.laboratorio_proveedor, activo:true });
      }
      count++;
    }
    await loadPedidosData(); toast(`Importados ${count} registro(s).`);
  }

  function injectStyles() {
    if (document.getElementById('pedidosClinicosV51Css')) return;
    const st = document.createElement('style'); st.id = 'pedidosClinicosV51Css'; st.textContent = `
      .ped-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
      .ped-alert{margin:10px 0 14px;padding:10px 12px;border-radius:10px;font-size:13px;min-height:0}.ped-alert:empty{display:none}.ped-alert.ok{background:var(--green-light);color:#075f43}.ped-alert.bad{background:var(--red-light);color:#8e2f19}
      .ped-form{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;align-items:center;margin-bottom:8px}.ped-form.wide{grid-template-columns:repeat(4,minmax(150px,1fr))}.ped-form input,.ped-form select,.ped-filters input,.ped-filters select{height:36px;border:1px solid var(--border2);border-radius:8px;padding:0 10px;font-family:'DM Sans',sans-serif;background:#fff;color:var(--text)}.ped-form .btn{height:36px}
      .ped-filters{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;align-items:end}.filter-field{display:flex;flex-direction:column;gap:4px}.filter-field span{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);padding-left:2px}.mini{border:1px solid var(--border2);background:#fff;border-radius:8px;padding:5px 8px;font-family:'DM Sans',sans-serif;cursor:pointer}.mini.danger{color:var(--red)}.mini-input{width:90px;height:30px;border:1px solid var(--border2);border-radius:7px;padding:0 8px;background:#fff}.filelabel{display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.chips{display:flex;flex-wrap:wrap;gap:8px}.chip{background:var(--bg2);border:1px solid var(--border);border-radius:999px;padding:6px 10px;display:inline-flex;gap:6px;align-items:center}.mt{margin-top:16px}.sub-tabs{margin-top:-4px;margin-bottom:14px}.clinical-tab.small{font-size:12px;padding:7px 10px}
      @media(max-width:1100px){.ped-form,.ped-form.wide,.ped-filters{grid-template-columns:1fr 1fr}.ped-head{flex-direction:column}.clinical-grid{grid-template-columns:1fr 1fr!important}}
    `; document.head.appendChild(st);
  }
  function injectDatalists() {
    if (document.getElementById('proveedoresList')) return;
    const dl = document.createElement('datalist'); dl.id = 'proveedoresList'; dl.innerHTML = proveedorList().map(p=>`<option value="${esc(p)}"></option>`).join(''); document.body.appendChild(dl);
  }
  function bootPedidosClinicos() { injectStyles(); injectDatalists(); const el=document.getElementById('page-pedidos'); if (!el) return; render(); loadPedidosData(); }
  window.PEDIDOS_CLINICOS_MODULE_VERSION = VERSION;
  window.bootPedidosClinicos = bootPedidosClinicos;
  document.addEventListener('DOMContentLoaded',()=>setTimeout(bootPedidosClinicos,100));
  console.log(`MODULO PEDIDOS CLINICOS v${VERSION} cargado: analisis separado de datos, importacion PDF con familia/proveedor y laboratorio por historial`);
})();
