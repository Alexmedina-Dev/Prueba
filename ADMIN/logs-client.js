const API_BASE = window.location.origin;
let paginaActual = 1;
let refrescando = false;
let intervaloRefresh = null;

function authHeaders() {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

function badgeClass(tipo) {
  if (tipo === 'ERROR_SERVER') return 'badge-server';
  if (tipo === 'ERROR_CLIENT') return 'badge-client';
  if (tipo === 'ERROR_UNHANDLED') return 'badge-unhandled';
  return 'badge-fatal';
}

async function cargarStats() {
  const res = await fetch(`${API_BASE}/api/admin/logs-stats`, { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  const cont = document.getElementById('stats');
  cont.innerHTML = '';
  data.ultimas24h.forEach(s => {
    cont.innerHTML += `<div class="stat-card"><div class="num">${s.total}</div><div class="label">${s.tipo} (24h)</div></div>`;
  });
  if (data.ultimas24h.length === 0) {
    cont.innerHTML = '<div class="stat-card"><div class="num">0</div><div class="label">Sin errores en 24h 🎉</div></div>';
  }
}

async function cargarLogs(pagina) {
  paginaActual = pagina;
  const tipo = document.getElementById('filtroTipo').value;
  const ruta = document.getElementById('filtroRuta').value;
  const params = new URLSearchParams({ page: pagina, limit: 30 });
  if (tipo) params.append('tipo', tipo);
  if (ruta) params.append('ruta', ruta);

  const res = await fetch(`${API_BASE}/api/admin/logs?${params}`, { headers: authHeaders() });
  if (res.status === 401 || res.status === 403) {
    document.body.innerHTML = '<h1 style="padding:40px">🚫 Acceso restringido — iniciá sesión como administrador.</h1>';
    return;
  }
  const data = await res.json();
  const tbody = document.getElementById('tablaLogs');
  const empty = document.getElementById('empty');
  tbody.innerHTML = '';

  if (data.data.length === 0) {
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    data.data.forEach(log => {
      const fecha = new Date(log.fecha).toLocaleString('es-CO');
      tbody.innerHTML += `
        <tr onclick="verDetalle(${log.id})">
          <td>${fecha}</td>
          <td><span class="badge ${badgeClass(log.tipo)}">${log.tipo}</span></td>
          <td>${log.ruta || '-'}</td>
          <td>${log.metodo || '-'}</td>
          <td>${(log.mensaje || '').substring(0, 80)}</td>
          <td>${log.usuario || 'anonimo'}</td>
        </tr>`;
    });
  }

  const totalPaginas = Math.max(1, Math.ceil(data.total / data.limit));
  document.getElementById('paginaInfo').textContent = `Página ${data.page} de ${totalPaginas} (${data.total} errores)`;
}

async function verDetalle(id) {
  const res = await fetch(`${API_BASE}/api/admin/logs/${id}`, { headers: authHeaders() });
  const log = await res.json();
  document.getElementById('modalTitulo').textContent = `${log.tipo} — ${log.ruta || 'sin ruta'}`;
  document.getElementById('modalMeta').textContent =
    `${new Date(log.fecha).toLocaleString('es-CO')} | ${log.metodo || '-'} | Usuario: ${log.usuario || 'anonimo'} | IP: ${log.ip_cliente || '-'}`;
  document.getElementById('modalMensaje').textContent = log.mensaje || '(sin mensaje)';
  
  // Parsear stack trace si es error del frontend con detalles estructurados
  let stackHtml = '';
  if (log.stack_trace && log.tipo === 'ERROR_CLIENT_DETAIL') {
    try {
      const parsed = JSON.parse(log.stack_trace);
      stackHtml = `📁 Archivo: ${parsed.archivo || 'N/A'}\n🔧 Función: ${parsed.funcion || 'N/A'}\n📍 Línea: ${parsed.linea || 'N/A'}\n📝 Contexto: ${parsed.contexto || 'N/A'}\n\n--- Stack trace completo ---\n${parsed.stack || log.stack_trace}`;
    } catch(e) {
      stackHtml = log.stack_trace;
    }
  } else {
    stackHtml = log.stack_trace || '(sin stack trace)';
  }
  document.getElementById('modalStack').textContent = stackHtml;
  document.getElementById('modalDatos').textContent = log.datos_request || '(sin datos)';
  document.getElementById('modal').classList.add('open');
}

function cerrarModal() {
  document.getElementById('modal').classList.remove('open');
}

function cambiarPagina(delta) {
  const nueva = paginaActual + delta;
  if (nueva >= 1) cargarLogs(nueva);
}

function autoRefresh() {
  refrescando = !refrescando;
  document.getElementById('refreshState').textContent = refrescando ? 'ON' : 'OFF';
  if (refrescando) {
    intervaloRefresh = setInterval(() => { cargarStats(); cargarLogs(paginaActual); }, 15000);
  } else {
    clearInterval(intervaloRefresh);
  }
}

// Carga inicial
cargarStats();
cargarLogs(1);
