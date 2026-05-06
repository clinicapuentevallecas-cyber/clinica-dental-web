
// Modulo Pedidos clinicos - v44 funcional sin API
// Permite trabajar manualmente con TTOs, materiales, recetas, precios y pedido recomendado
// hasta conectar la API clinica real mediante Edge Function.
(function () {
  const VERSION = '2026-05-06-44';

  const EMPRESAS = [
    ['corporacion', 'Corporación'],
    ['bridge', 'Bridge'],
    ['vallecas', 'Vallecas Las']
  ];

  let state = {
    tab: 'dashboard',
    tratamientos: [],
    materiales: [],
    recetas: [],
    ttos: [],
    precios: [],
    pedidos: [],
    loading: false,
    error: ''
  };

  function getSB() {
    try {
      if (typeof sb !== 'undefined' && sb) return sb;
    } catch (_) {}
    try {
      if (window.sb) return window.sb;
    } catch (_) {}
    return null;
  }

  function q(sel, root = document) { return root.querySelector(sel); }
  function qa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
  }
  function norm(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
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
    try {
      return Number(v || 0).toLocaleString('es-ES', { style:'currency', currency:'EUR', maximumFractionDigits:0 });
    } catch (_) {
      return `${Math.round(Number(v || 0))} €`;
    }
  }
  function dateStr(v) {
    if (!v) return '';
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toISOString().slice(0,10);
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function periodMonth() { return today().slice(0, 7); }

  function empresaOptions(selected = 'corporacion') {
    return EMPRESAS.map(([id, n]) => `<option value="${id}" ${id === selected ? 'selected' : ''}>${n}</option>`).join('');
  }

  function tableEmpty(cols, msg) {
    return `<tr><td colspan="${cols}" style="color:var(--text3);padding:18px">${esc(msg)}</td></tr>`;
  }

  async function dbSelect(table) {
    const s = getSB();
    if (!s) return [];
    const { data, error } = await s.from(table).select('*');
    if (error) throw new Error(`${table}: ${error.message}`);
    return data || [];
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
    if (!s) {
      state.error = 'Supabase no está conectado. Configura Supabase para guardar y leer Pedidos clínicos.';
      return;
    }
    state.loading = true;
    state.error = '';
    render();
    try {
      const [tratamientos, materiales, recetas, ttos, precios, pedidos] = await Promise.all([
        dbSelect('tratamientos_catalogo'),
        dbSelect('materiales_catalogo'),
        dbSelect('tratamiento_materiales'),
        dbSelect('ttos_realizados'),
        dbSelect('material_precios'),
        dbSelect('pedidos_recomendados')
      ]);
      state.tratamientos = tratamientos.sort((a,b)=>String(a.nombre_tto||'').localeCompare(String(b.nombre_tto||''),'es'));
      state.materiales = materiales.sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
      state.recetas = recetas;
      state.ttos = ttos.sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
      state.precios = precios.sort((a,b)=>String(a.proveedor||'').localeCompare(String(b.proveedor||''),'es'));
      state.pedidos = pedidos.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||'')));
    } catch (e) {
      state.error = e.message || String(e);
    } finally {
      state.loading = false;
      render();
    }
  }

  function getTratamientoForTto(tto) {
    const code = norm(tto.codigo_tto);
    const name = norm(tto.tratamiento);
    return state.tratamientos.find(t => {
      return (code && norm(t.codigo_tto) === code) ||
             (name && norm(t.nombre_tto) === name) ||
             (name && norm(t.nombre_tto).includes(name)) ||
             (name && name.includes(norm(t.nombre_tto)));
    });
  }

  function materialById(id) {
    return state.materiales.find(m => String(m.id) === String(id));
  }

  function tratamientoById(id) {
    return state.tratamientos.find(t => String(t.id) === String(id));
  }

  function preciosByMaterial(id) {
    return state.precios.filter(p => String(p.material_id) === String(id));
  }

  function bestPrice(material) {
    const prices = preciosByMaterial(material.id).map(p => ({...p, precio: num(p.precio)})).filter(p => p.precio > 0);
    if (prices.length) return prices.sort((a,b)=>a.precio-b.precio)[0];
    const fallback = num(material.coste_medio || material.coste_ultimo);
    return fallback > 0 ? { proveedor: material.proveedor_preferente || 'Coste medio', precio: fallback, referencia: material.referencia_proveedor || '' } : null;
  }

  function costeUnitarioReceta(receta) {
    const mat = materialById(receta.material_id);
    return num(receta.coste_estimado_unitario) || num(mat?.coste_medio) || num(mat?.coste_ultimo);
  }

  function costeMaterialTto(tto) {
    const tratamiento = getTratamientoForTto(tto);
    if (!tratamiento) return 0;
    const recetas = state.recetas.filter(r => String(r.tratamiento_id) === String(tratamiento.id));
    return recetas.reduce((sum, r) => sum + num(r.cantidad_estimada) * costeUnitarioReceta(r), 0);
  }

  function dashboardStats() {
    const totalTtos = state.ttos.length;
    const ingresos = state.ttos.reduce((s,t)=>s+num(t.importe),0);
    const costeMaterial = state.ttos.reduce((s,t)=>s+costeMaterialTto(t),0);
    const margen = ingresos - costeMaterial;
    const pedido = calcularPedidoRecomendado(false).reduce((s,p)=>s+num(p.cantidad_recomendada)*num(p.precio_estimado),0);
    return { totalTtos, ingresos, costeMaterial, margen, pedido, margenPct: ingresos ? margen / ingresos * 100 : 0 };
  }

  function calcularPedidoRecomendado(store = false) {
    const consumoByMat = new Map();
    state.ttos.forEach(tto => {
      const t = getTratamientoForTto(tto);
      if (!t) return;
      state.recetas.filter(r => String(r.tratamiento_id) === String(t.id)).forEach(r => {
        const current = consumoByMat.get(String(r.material_id)) || 0;
        consumoByMat.set(String(r.material_id), current + num(r.cantidad_estimada));
      });
    });

    const rows = state.materiales.map(m => {
      const consumo = consumoByMat.get(String(m.id)) || 0;
      const stock = num(m.stock_actual);
      const minimo = num(m.stock_minimo);
      const pedir = Math.max(0, consumo + minimo - stock);
      const price = bestPrice(m);
      return {
        material_id: m.id,
        material_nombre: m.nombre,
        empresa: 'global',
        periodo: periodMonth(),
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
      const s = getSB();
      if (!s) throw new Error('Supabase no conectado');
      const periodo = periodMonth();
      await s.from('pedidos_recomendados').delete().eq('periodo', periodo).eq('empresa', 'global');
      if (rows.length) {
        const payload = rows.map(r => ({
          material_id: r.material_id,
          empresa: r.empresa,
          periodo: r.periodo,
          consumo_previsto: r.consumo_previsto,
          stock_actual: r.stock_actual,
          stock_minimo: r.stock_minimo,
          cantidad_recomendada: r.cantidad_recomendada,
          proveedor_sugerido: r.proveedor_sugerido,
          precio_estimado: r.precio_estimado,
          estado: 'pendiente'
        }));
        const { error } = await s.from('pedidos_recomendados').insert(payload);
        if (error) throw error;
      }
      await loadPedidosData();
      toast(`Pedido recomendado generado: ${rows.length} material(es).`);
    } catch (e) {
      toast(`Error generando pedido: ${e.message || e}`, true);
    }
  }

  function toast(msg, error = false) {
    let box = q('#pedidosMsg');
    if (!box) return alert(msg);
    box.className = error ? 'ped-alert bad' : 'ped-alert ok';
    box.textContent = msg;
    setTimeout(() => { if (box) box.textContent = ''; }, 5000);
  }

  function render() {
    const el = document.getElementById('page-pedidos');
    if (!el) return;
    el.innerHTML = `
      <div class="ped-head">
        <div>
          <h1>Pedidos clínicos</h1>
          <div class="sub">
            Módulo operativo en modo manual hasta conectar la API clínica. Puedes crear tratamientos, materiales,
            recetas por TTO, precios y calcular pedidos recomendados desde Supabase.
          </div>
        </div>
        <button class="btn" id="pedRefresh">Actualizar datos</button>
      </div>

      <div id="pedidosMsg" class="ped-alert ${state.error ? 'bad' : ''}">${esc(state.error || '')}</div>

      <div class="clinical-tabs">
        ${tabButton('dashboard','Dashboard')}
        ${tabButton('ttos','TTOs realizados')}
        ${tabButton('materiales','Materiales')}
        ${tabButton('recetas','Recetas por TTO')}
        ${tabButton('precios','Precios proveedores')}
        ${tabButton('pedido','Pedido recomendado')}
      </div>

      ${state.loading ? '<div class="card"><div class="sub">Cargando Pedidos clínicos...</div></div>' : renderTab()}
    `;
    bindEvents();
  }

  function tabButton(id, label) {
    return `<button class="clinical-tab ${state.tab === id ? 'active' : ''}" data-ped-tab="${id}">${label}</button>`;
  }

  function renderTab() {
    if (state.tab === 'ttos') return renderTtos();
    if (state.tab === 'materiales') return renderMateriales();
    if (state.tab === 'recetas') return renderRecetas();
    if (state.tab === 'precios') return renderPrecios();
    if (state.tab === 'pedido') return renderPedido();
    return renderDashboard();
  }

  function renderDashboard() {
    const st = dashboardStats();
    const pedidoRows = calcularPedidoRecomendado(false);
    const topMargenes = state.ttos.slice(0, 8).map(t => {
      const coste = costeMaterialTto(t);
      const margen = num(t.importe) - coste;
      return { ...t, coste, margen };
    });

    return `
      <div class="metrics m4 clinical-grid">
        <div class="metric"><div class="ml">TTOs realizados</div><div class="mv">${st.totalTtos}</div><div class="ms">Registros cargados</div></div>
        <div class="metric"><div class="ml">Coste material estimado</div><div class="mv">${eur(st.costeMaterial)}</div><div class="ms">Según receta por TTO</div></div>
        <div class="metric"><div class="ml">Pedido recomendado</div><div class="mv">${eur(st.pedido)}</div><div class="ms">${pedidoRows.length} material(es)</div></div>
        <div class="metric"><div class="ml">Margen bruto clínico</div><div class="mv ${st.margen >= 0 ? 'up' : 'dn'}">${eur(st.margen)}</div><div class="ms">${st.margenPct.toFixed(1)}%</div></div>
      </div>

      <div class="grid2">
        <div class="card">
          <div class="ch"><div class="ct">Próximos materiales a pedir</div><button class="btn bg2btn" id="genPedidoDash">Generar pedido</button></div>
          <div class="tw"><table>
            <thead><tr><th>Material</th><th>Consumo</th><th>Stock</th><th>Pedir</th><th>Proveedor</th><th>Estimado</th></tr></thead>
            <tbody>${pedidoRows.slice(0,10).map(r => `
              <tr><td>${esc(r.material_nombre)}</td><td>${r.consumo_previsto}</td><td>${r.stock_actual}</td><td><strong>${r.cantidad_recomendada}</strong></td><td>${esc(r.proveedor_sugerido || '—')}</td><td>${eur(num(r.cantidad_recomendada) * num(r.precio_estimado))}</td></tr>
            `).join('') || tableEmpty(6,'Sin materiales pendientes. Añade TTOs, materiales y recetas para calcular el pedido.')}</tbody>
          </table></div>
        </div>

        <div class="card">
          <div class="ct">Últimos TTOs con margen estimado</div>
          <div class="tw"><table>
            <thead><tr><th>Fecha</th><th>TTO</th><th>Ingreso</th><th>Material</th><th>Margen</th></tr></thead>
            <tbody>${topMargenes.map(t => `
              <tr><td>${esc(dateStr(t.fecha))}</td><td>${esc(t.tratamiento || t.codigo_tto || '—')}</td><td>${eur(t.importe)}</td><td>${eur(t.coste)}</td><td class="${t.margen >= 0 ? 'up' : 'dn'}">${eur(t.margen)}</td></tr>
            `).join('') || tableEmpty(5,'Sin TTOs realizados.')}</tbody>
          </table></div>
        </div>
      </div>

      <div class="card">
        <div class="ct">Estado del módulo</div>
        <div class="placeholder-list">
          <div class="placeholder-row"><strong>1. TTOs realizados</strong><span>Manual / CSV ahora</span><span>API clínica después</span><span>Operativo</span></div>
          <div class="placeholder-row"><strong>2. Receta de material</strong><span>Tabla tratamiento_materiales</span><span>Coste estimado</span><span>Operativo</span></div>
          <div class="placeholder-row"><strong>3. Pedido recomendado</strong><span>Stock + consumo</span><span>Proveedor/precio</span><span>Operativo</span></div>
          <div class="placeholder-row"><strong>4. Márgenes</strong><span>Ingreso TTO - material</span><span>Fase 2: laboratorio/doctor</span><span>Operativo básico</span></div>
        </div>
      </div>
    `;
  }

  function renderTtos() {
    return `
      <div class="card mb">
        <div class="ct">Añadir TTO realizado</div>
        <div class="ped-form">
          <input id="ttoFecha" type="date" value="${today()}">
          <select id="ttoEmpresa">${empresaOptions('corporacion')}</select>
          <input id="ttoCodigo" placeholder="Código TTO">
          <input id="ttoNombre" placeholder="Tratamiento">
          <input id="ttoDoctor" placeholder="Doctor">
          <input id="ttoImporte" type="number" step="0.01" placeholder="Importe">
          <select id="ttoEstado"><option>realizado</option><option>presupuestado</option><option>cobrado</option><option>pendiente</option></select>
          <button class="btn" id="addTto">Guardar TTO</button>
        </div>
        <div class="sub">Sin API todavía: puedes registrar TTOs manualmente. Más adelante esta tabla se alimentará desde la plataforma clínica.</div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">TTOs realizados</div><span class="sub">${state.ttos.length} registros</span></div>
        <div class="tw"><table>
          <thead><tr><th>Fecha</th><th>Empresa</th><th>Código</th><th>Tratamiento</th><th>Doctor</th><th>Importe</th><th>Coste material</th><th>Margen</th><th></th></tr></thead>
          <tbody>${state.ttos.map(t => {
            const coste = costeMaterialTto(t);
            const margen = num(t.importe)-coste;
            return `<tr>
              <td>${esc(dateStr(t.fecha))}</td><td>${esc(t.empresa || '—')}</td><td>${esc(t.codigo_tto || '')}</td><td>${esc(t.tratamiento || '')}</td><td>${esc(t.doctor || '')}</td>
              <td>${eur(t.importe)}</td><td>${eur(coste)}</td><td class="${margen >= 0 ? 'up' : 'dn'}">${eur(margen)}</td>
              <td><button class="mini danger" data-del="ttos_realizados:${t.id}">Eliminar</button></td>
            </tr>`;
          }).join('') || tableEmpty(9,'Sin TTOs registrados.')}</tbody>
        </table></div>
      </div>
    `;
  }

  function renderMateriales() {
    return `
      <div class="card mb">
        <div class="ct">Añadir material</div>
        <div class="ped-form">
          <input id="matNombre" placeholder="Nombre material">
          <input id="matCategoria" placeholder="Categoría">
          <input id="matUnidad" placeholder="Unidad" value="unidad">
          <input id="matStock" type="number" step="0.01" placeholder="Stock actual">
          <input id="matMin" type="number" step="0.01" placeholder="Stock mínimo">
          <input id="matCoste" type="number" step="0.01" placeholder="Coste medio">
          <input id="matProveedor" placeholder="Proveedor preferente">
          <button class="btn" id="addMat">Guardar material</button>
        </div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct">Catálogo de materiales</div><span class="sub">${state.materiales.length} materiales</span></div>
        <div class="tw"><table>
          <thead><tr><th>Material</th><th>Categoría</th><th>Unidad</th><th>Stock</th><th>Mínimo</th><th>Coste medio</th><th>Proveedor</th><th></th></tr></thead>
          <tbody>${state.materiales.map(m => `
            <tr><td><strong>${esc(m.nombre)}</strong></td><td>${esc(m.categoria || '')}</td><td>${esc(m.unidad || 'unidad')}</td>
            <td><input class="mini-input" type="number" step="0.01" value="${num(m.stock_actual)}" data-update="materiales_catalogo:${m.id}:stock_actual"></td>
            <td><input class="mini-input" type="number" step="0.01" value="${num(m.stock_minimo)}" data-update="materiales_catalogo:${m.id}:stock_minimo"></td>
            <td>${eur(m.coste_medio)}</td><td>${esc(m.proveedor_preferente || '')}</td>
            <td><button class="mini danger" data-del="materiales_catalogo:${m.id}">Eliminar</button></td></tr>
          `).join('') || tableEmpty(8,'Sin materiales registrados.')}</tbody>
        </table></div>
      </div>
    `;
  }

  function selectTratamientos(id) {
    return `<select id="${id}">${state.tratamientos.map(t => `<option value="${t.id}">${esc(t.codigo_tto ? t.codigo_tto + ' · ' : '')}${esc(t.nombre_tto)}</option>`).join('')}</select>`;
  }
  function selectMateriales(id) {
    return `<select id="${id}">${state.materiales.map(m => `<option value="${m.id}">${esc(m.nombre)}</option>`).join('')}</select>`;
  }

  function renderRecetas() {
    return `
      <div class="card mb">
        <div class="ct">Añadir tratamiento al catálogo</div>
        <div class="ped-form">
          <input id="tratCodigo" placeholder="Código TTO">
          <input id="tratNombre" placeholder="Nombre TTO">
          <input id="tratCategoria" placeholder="Categoría">
          <input id="tratPrecio" type="number" step="0.01" placeholder="Precio base">
          <button class="btn" id="addTrat">Guardar tratamiento</button>
        </div>
      </div>

      <div class="card mb">
        <div class="ct">Añadir material a receta por TTO</div>
        <div class="ped-form">
          ${selectTratamientos('recTrat')}
          ${selectMateriales('recMat')}
          <input id="recCantidad" type="number" step="0.01" placeholder="Cantidad" value="1">
          <input id="recCoste" type="number" step="0.01" placeholder="Coste unitario opcional">
          <button class="btn" id="addRec">Añadir a receta</button>
        </div>
      </div>

      <div class="grid2">
        <div class="card">
          <div class="ct">Tratamientos catálogo</div>
          <div class="tw"><table><thead><tr><th>Código</th><th>TTO</th><th>Categoría</th><th>Precio base</th><th></th></tr></thead>
          <tbody>${state.tratamientos.map(t => `<tr><td>${esc(t.codigo_tto||'')}</td><td><strong>${esc(t.nombre_tto)}</strong></td><td>${esc(t.categoria||'')}</td><td>${eur(t.precio_base)}</td><td><button class="mini danger" data-del="tratamientos_catalogo:${t.id}">Eliminar</button></td></tr>`).join('') || tableEmpty(5,'Sin tratamientos.')}</tbody></table></div>
        </div>
        <div class="card">
          <div class="ct">Recetas por TTO</div>
          <div class="tw"><table><thead><tr><th>TTO</th><th>Material</th><th>Cantidad</th><th>Coste unit.</th><th>Total</th><th></th></tr></thead>
          <tbody>${state.recetas.map(r => {
            const t = tratamientoById(r.tratamiento_id);
            const m = materialById(r.material_id);
            const cu = costeUnitarioReceta(r);
            return `<tr><td>${esc(t?.nombre_tto || '—')}</td><td>${esc(m?.nombre || '—')}</td><td>${num(r.cantidad_estimada)} ${esc(r.unidad || m?.unidad || '')}</td><td>${eur(cu)}</td><td>${eur(cu*num(r.cantidad_estimada))}</td><td><button class="mini danger" data-del="tratamiento_materiales:${r.id}">Eliminar</button></td></tr>`;
          }).join('') || tableEmpty(6,'Sin recetas definidas.')}</tbody></table></div>
        </div>
      </div>
    `;
  }

  function renderPrecios() {
    return `
      <div class="card mb">
        <div class="ct">Añadir precio proveedor</div>
        <div class="ped-form">
          ${selectMateriales('precioMat')}
          <input id="precioProv" placeholder="Proveedor">
          <input id="precioRef" placeholder="Referencia">
          <input id="precioVal" type="number" step="0.01" placeholder="Precio">
          <input id="precioPlazo" type="number" step="1" placeholder="Plazo días">
          <input id="precioUrl" placeholder="URL producto">
          <button class="btn" id="addPrecio">Guardar precio</button>
        </div>
      </div>
      <div class="card">
        <div class="ct">Precios por proveedor</div>
        <div class="tw"><table>
          <thead><tr><th>Material</th><th>Proveedor</th><th>Referencia</th><th>Precio</th><th>Plazo</th><th>Fecha</th><th></th></tr></thead>
          <tbody>${state.precios.map(p => {
            const m = materialById(p.material_id);
            return `<tr><td>${esc(m?.nombre || '—')}</td><td>${esc(p.proveedor)}</td><td>${esc(p.referencia || '')}</td><td>${eur(p.precio)}</td><td>${p.plazo_entrega_dias ? esc(p.plazo_entrega_dias)+' días' : '—'}</td><td>${esc(dateStr(p.fecha_precio))}</td><td><button class="mini danger" data-del="material_precios:${p.id}">Eliminar</button></td></tr>`;
          }).join('') || tableEmpty(7,'Sin precios registrados.')}</tbody>
        </table></div>
      </div>
    `;
  }

  function renderPedido() {
    const rows = calcularPedidoRecomendado(false);
    return `
      <div class="card mb">
        <div class="ch">
          <div>
            <div class="ct">Pedido recomendado</div>
            <div class="sub">Cálculo: consumo previsto por TTOs + stock mínimo - stock actual. El precio usa el proveedor más barato registrado o el coste medio del material.</div>
          </div>
          <button class="btn" id="genPedido">Guardar pedido recomendado en Supabase</button>
        </div>
      </div>
      <div class="card">
        <div class="tw"><table>
          <thead><tr><th>Material</th><th>Consumo previsto</th><th>Stock actual</th><th>Stock mínimo</th><th>Cantidad a pedir</th><th>Proveedor sugerido</th><th>Precio unit.</th><th>Total</th></tr></thead>
          <tbody>${rows.map(r => `<tr>
            <td><strong>${esc(r.material_nombre)}</strong></td><td>${num(r.consumo_previsto)}</td><td>${num(r.stock_actual)}</td><td>${num(r.stock_minimo)}</td><td><strong>${num(r.cantidad_recomendada)}</strong></td><td>${esc(r.proveedor_sugerido || '—')}</td><td>${eur(r.precio_estimado)}</td><td>${eur(num(r.cantidad_recomendada)*num(r.precio_estimado))}</td>
          </tr>`).join('') || tableEmpty(8,'No hay pedido recomendado. Añade TTOs realizados, materiales y recetas.')}</tbody>
        </table></div>
      </div>
    `;
  }

  function bindEvents() {
    q('#pedRefresh')?.addEventListener('click', loadPedidosData);
    qa('[data-ped-tab]').forEach(b => b.addEventListener('click', () => {
      state.tab = b.dataset.pedTab;
      render();
    }));
    q('#addTto')?.addEventListener('click', addTto);
    q('#addMat')?.addEventListener('click', addMaterial);
    q('#addTrat')?.addEventListener('click', addTratamiento);
    q('#addRec')?.addEventListener('click', addReceta);
    q('#addPrecio')?.addEventListener('click', addPrecio);
    q('#genPedido')?.addEventListener('click', () => calcularPedidoRecomendado(true));
    q('#genPedidoDash')?.addEventListener('click', () => calcularPedidoRecomendado(true));

    qa('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
      const [table, id] = btn.dataset.del.split(':');
      if (!confirm('¿Eliminar este registro?')) return;
      try {
        await dbDelete(table, id);
        await loadPedidosData();
      } catch (e) { toast(e.message || String(e), true); }
    }));

    qa('[data-update]').forEach(input => input.addEventListener('change', async () => {
      const [table, id, field] = input.dataset.update.split(':');
      try {
        await dbUpdate(table, id, { [field]: num(input.value) });
        toast('Stock actualizado.');
        await loadPedidosData();
      } catch (e) { toast(e.message || String(e), true); }
    }));
  }

  async function addTto() {
    try {
      const payload = {
        fecha: q('#ttoFecha').value || today(),
        empresa: q('#ttoEmpresa').value,
        codigo_tto: q('#ttoCodigo').value.trim(),
        tratamiento: q('#ttoNombre').value.trim(),
        doctor: q('#ttoDoctor').value.trim(),
        importe: num(q('#ttoImporte').value),
        estado: q('#ttoEstado').value,
        external_id: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`
      };
      if (!payload.tratamiento && !payload.codigo_tto) throw new Error('Indica tratamiento o código TTO.');
      await dbInsert('ttos_realizados', payload);
      await loadPedidosData();
      toast('TTO guardado.');
    } catch(e) { toast(e.message || String(e), true); }
  }

  async function addMaterial() {
    try {
      const payload = {
        nombre: q('#matNombre').value.trim(),
        categoria: q('#matCategoria').value.trim(),
        unidad: q('#matUnidad').value.trim() || 'unidad',
        stock_actual: num(q('#matStock').value),
        stock_minimo: num(q('#matMin').value),
        coste_medio: num(q('#matCoste').value),
        coste_ultimo: num(q('#matCoste').value),
        proveedor_preferente: q('#matProveedor').value.trim()
      };
      if (!payload.nombre) throw new Error('Indica nombre del material.');
      await dbInsert('materiales_catalogo', payload);
      await loadPedidosData();
      toast('Material guardado.');
    } catch(e) { toast(e.message || String(e), true); }
  }

  async function addTratamiento() {
    try {
      const payload = {
        codigo_tto: q('#tratCodigo').value.trim() || null,
        nombre_tto: q('#tratNombre').value.trim(),
        categoria: q('#tratCategoria').value.trim(),
        precio_base: num(q('#tratPrecio').value),
        activo: true
      };
      if (!payload.nombre_tto) throw new Error('Indica nombre del tratamiento.');
      await dbInsert('tratamientos_catalogo', payload);
      await loadPedidosData();
      toast('Tratamiento guardado.');
    } catch(e) { toast(e.message || String(e), true); }
  }

  async function addReceta() {
    try {
      const mat = materialById(q('#recMat').value);
      const payload = {
        tratamiento_id: q('#recTrat').value,
        material_id: q('#recMat').value,
        cantidad_estimada: num(q('#recCantidad').value) || 1,
        unidad: mat?.unidad || 'unidad',
        tipo_consumo: 'estimado',
        coste_estimado_unitario: num(q('#recCoste').value) || num(mat?.coste_medio) || num(mat?.coste_ultimo)
      };
      await dbInsert('tratamiento_materiales', payload);
      await loadPedidosData();
      toast('Material añadido a receta.');
    } catch(e) { toast(e.message || String(e), true); }
  }

  async function addPrecio() {
    try {
      const payload = {
        material_id: q('#precioMat').value,
        proveedor: q('#precioProv').value.trim(),
        referencia: q('#precioRef').value.trim(),
        precio: num(q('#precioVal').value),
        plazo_entrega_dias: q('#precioPlazo').value ? Number(q('#precioPlazo').value) : null,
        url_producto: q('#precioUrl').value.trim(),
        fecha_precio: today()
      };
      if (!payload.proveedor) throw new Error('Indica proveedor.');
      if (!payload.precio) throw new Error('Indica precio.');
      await dbInsert('material_precios', payload);
      await loadPedidosData();
      toast('Precio guardado.');
    } catch(e) { toast(e.message || String(e), true); }
  }

  function injectStyles() {
    if (document.getElementById('pedidosClinicosV44Css')) return;
    const st = document.createElement('style');
    st.id = 'pedidosClinicosV44Css';
    st.textContent = `
      .ped-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:18px}
      .ped-alert{margin:10px 0 14px;padding:10px 12px;border-radius:10px;font-size:13px;min-height:0}
      .ped-alert:empty{display:none}
      .ped-alert.ok{background:var(--green-light);color:#075f43}
      .ped-alert.bad{background:var(--red-light);color:#8e2f19}
      .ped-form{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:10px;align-items:center;margin-bottom:8px}
      .ped-form input,.ped-form select{height:36px;border:1px solid var(--border2);border-radius:8px;padding:0 10px;font-family:'DM Sans',sans-serif;background:#fff;color:var(--text)}
      .ped-form .btn{height:36px}
      .mini{border:1px solid var(--border2);background:#fff;border-radius:8px;padding:5px 8px;font-family:'DM Sans',sans-serif;cursor:pointer}
      .mini.danger{color:var(--red)}
      .mini-input{width:90px;height:30px;border:1px solid var(--border2);border-radius:7px;padding:0 8px;background:#fff}
      @media(max-width:1100px){.ped-form{grid-template-columns:1fr 1fr}.ped-head{flex-direction:column}.clinical-grid{grid-template-columns:1fr 1fr!important}}
    `;
    document.head.appendChild(st);
  }

  function bootPedidosClinicos() {
    injectStyles();
    const el = document.getElementById('page-pedidos');
    if (!el) return;
    // Renderiza inmediatamente aunque no haya datos, para que las pestañas sean interactivas.
    render();
    loadPedidosData();
  }

  window.PEDIDOS_CLINICOS_MODULE_VERSION = VERSION;
  window.bootPedidosClinicos = bootPedidosClinicos;

  document.addEventListener('DOMContentLoaded', () => {
    // Espera corta para dejar que init.js/app.js active la pantalla.
    setTimeout(bootPedidosClinicos, 100);
  });

  console.log(`MODULO PEDIDOS CLINICOS v${VERSION} cargado: modo manual funcional sin API`);
})();

