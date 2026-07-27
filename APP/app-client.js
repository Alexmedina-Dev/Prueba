const API_BASE = window.location.origin;
const socket = io(API_BASE);

let servicioBloqueado = false;
let user = getUserName();

function getUserName() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    return u.nombre || u.email || 'Usuario';
  } catch(e) {
    return 'Usuario';
  }
}

function mostrarSaludoUsuario() {
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    const nombre = u.nombre || 'Usuario';
    const role = u.role || 'operador';
    const roleMap = {
      'admin': { label: 'Administrador', class: 'role-admin' },
      'developer': { label: 'Developer', class: 'role-developer' },
      'operador': { label: 'Operador', class: 'role-operador' },
      'tecnico': { label: 'Técnico', class: 'role-tecnico' }
    };
    const roleInfo = roleMap[role] || roleMap['operador'];
    const greetingEl = document.getElementById('userGreeting');
    if (greetingEl) {
      greetingEl.innerHTML = `👋 Hola, <strong>${nombre}</strong> <span class="role-badge ${roleInfo.class}">${roleInfo.label}</span>`;
    }
  } catch(e) {
    console.error('Error mostrando saludo:', e);
  }
}

// Llamar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  mostrarSaludoUsuario();
  
  // Si viene del login con contraseña genérica, forzar cambio
  const params = new URLSearchParams(window.location.search);
  if (params.get('force_password_change') === 'true') {
    // Esperar un momento para que cargue la UI
    setTimeout(() => {
      mostrarModalPassword();
      // Mostrar mensaje informativo
      const msgEl = document.getElementById('pwd-mensaje');
      if (msgEl) {
        msgEl.innerText = '⚠️ Tu contraseña es genérica. Debes crear una nueva contraseña segura para continuar.';
        msgEl.className = 'pwd-msg warning';
      }
    }, 500);
  }
});

// Helper: obtener headers con JWT token
function getAuthHeaders(contentType = true) {
  const token = localStorage.getItem('token');
  const headers = {};
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (contentType) headers['Content-Type'] = 'application/json';
  return headers;
}

// Modal de validación profesional
function mostrarModal(titulo, mensaje, tipo = 'error') {
  const tituloEl = document.getElementById('modal-titulo');
  const btnEl = document.querySelector('.modal-btn');
  
  tituloEl.innerText = titulo;
  document.getElementById('modal-mensaje').innerHTML = mensaje.replace(/\n/g, '<br>');
  document.getElementById('modal-validacion').style.display = 'flex';
  
  // Color según tipo: error=rojo, success=verde
  if (tipo === 'success') {
    tituloEl.style.color = '#2e7d32';  // verde oscuro
    btnEl.style.background = '#2e7d32';
  } else {
    tituloEl.style.color = '#d32f2f';  // rojo
    btnEl.style.background = '#d32f2f';
  }
}

function cerrarModal() {
  document.getElementById('modal-validacion').style.display = 'none';
}

function mostrarConfirmModal(titulo, mensaje) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('modal-confirmar');
    document.getElementById('confirm-titulo').innerText = titulo;
    document.getElementById('confirm-mensaje').innerHTML = mensaje.replace(/\n/g, '<br>');
    overlay.style.display = 'flex';

    const btnSi = document.getElementById('btn-confirmar-si');
    const btnNo = document.getElementById('btn-confirmar-no');

    const limpiar = () => {
      overlay.style.display = 'none';
      btnSi.removeEventListener('click', onSi);
      btnNo.removeEventListener('click', onNo);
    };

    const onSi = () => { limpiar(); resolve(true); };
    const onNo = () => { limpiar(); resolve(false); };

    btnSi.addEventListener('click', onSi);
    btnNo.addEventListener('click', onNo);
  });
}

function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '../index.html';
}

// ── Modal Cambiar Contraseña ──────────────────────────────

function mostrarModalPassword() {
  // Llenar campo oculto de username para que Chrome pueda asociar la contraseña
  try {
    const u = JSON.parse(localStorage.getItem('user') || '{}');
    document.getElementById('pwd-username').value = u.email || '';
  } catch(e) {}
  
  document.getElementById('modal-password').classList.add('active');
  document.getElementById('pwd-mensaje').innerText = '';
  document.getElementById('pwd-mensaje').className = 'pwd-msg';
  document.getElementById('pwd-actual').focus();
}

function generarPasswordSegura() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  password += chars.charAt(Math.floor(Math.random() * 26)); // Mayúscula
  password += chars.charAt(Math.floor(Math.random() * 26) + 26); // Minúscula
  password += chars.charAt(Math.floor(Math.random() * 10) + 52); // Número
  password += chars.charAt(Math.floor(Math.random() * 8) + 62); // Especial
  for (let i = 4; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Mezclar
  password = password.split('').sort(() => Math.random() - 0.5).join('');
  
  document.getElementById('pwd-nueva').value = password;
  document.getElementById('pwd-confirmar').value = password;
  
  // Mostrar mensaje temporal
  const msgEl = document.getElementById('pwd-mensaje');
  msgEl.innerText = '🔑 Contraseña segura generada: ' + password;
  msgEl.className = 'pwd-msg success';
  
  // Seleccionar el texto para que el usuario pueda copiarlo
  setTimeout(() => {
    document.getElementById('pwd-nueva').select();
  }, 100);
}

function cerrarModalPassword() {
  // No permitir cerrar si es cambio obligatorio
  const params = new URLSearchParams(window.location.search);
  if (params.get('force_password_change') === 'true') {
    const msgEl = document.getElementById('pwd-mensaje');
    msgEl.innerText = '⚠️ Debes cambiar tu contraseña obligatoriamente.';
    msgEl.className = 'pwd-msg warning';
    return;
  }
  
  document.getElementById('modal-password').classList.remove('active');
  document.getElementById('pwd-actual').value = '';
  document.getElementById('pwd-nueva').value = '';
  document.getElementById('pwd-confirmar').value = '';
  document.getElementById('pwd-mensaje').innerText = '';
  document.getElementById('pwd-mensaje').className = 'pwd-msg';
  document.getElementById('pwd-btn-guardar').disabled = false;
}

async function cambiarPassword(e) {
  if (e) e.preventDefault();
  
  const actual = document.getElementById('pwd-actual').value;
  const nueva = document.getElementById('pwd-nueva').value;
  const confirmar = document.getElementById('pwd-confirmar').value;
  const msgEl = document.getElementById('pwd-mensaje');
  const btnGuardar = document.getElementById('pwd-btn-guardar');

  msgEl.className = 'pwd-msg error';

  if (!actual || !nueva || !confirmar) {
    msgEl.innerText = 'Todos los campos son obligatorios.';
    return false;
  }

  if (nueva !== confirmar) {
    msgEl.innerText = 'La nueva contraseña y la confirmación no coinciden.';
    return false;
  }

  if (nueva.length < 6) {
    msgEl.innerText = 'La nueva contraseña debe tener al menos 6 caracteres.';
    return false;
  }

  btnGuardar.disabled = true;
  msgEl.innerText = 'Guardando...';
  msgEl.className = 'pwd-msg';

  try {
    const res = await fetch(`${API_BASE}/api/change-password`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ currentPassword: actual, newPassword: nueva })
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 401) {
      msgEl.className = 'pwd-msg error';
      msgEl.innerText = data.error || 'Contraseña actual incorrecta';
      btnGuardar.disabled = false;
      return false;
    }

    if (!res.ok) {
      throw new Error(data.error || 'Error del servidor');
    }

    msgEl.className = 'pwd-msg success';
    msgEl.innerText = data.mensaje || 'Contraseña actualizada correctamente';

    // Actualizar flag en localStorage
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      u.debe_cambiar_password = false;
      localStorage.setItem('user', JSON.stringify(u));
    } catch(e) {}

    setTimeout(() => {
      // Limpiar URL param y cerrar modal
      window.history.replaceState({}, document.title, window.location.pathname);
      cerrarModalPassword();
    }, 1500);
  } catch (err) {
    console.error('Error cambiando contraseña:', err);
    msgEl.className = 'pwd-msg error';
    msgEl.innerText = err.message || 'No se pudo cambiar la contraseña. Intenta de nuevo.';
    btnGuardar.disabled = false;
  }
  
  return false;
}

// Cerrar modal de password con Escape
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('modal-password');
    if (modal && modal.classList.contains('active')) {
      cerrarModalPassword();
    }
  }
});

window.onload = function () {
  cargarAbiertos();
  cargarPendientes();
  document.getElementById('fechaCierre').valueAsDate = new Date();
  setInterval(cargarAbiertos, 15000);
  setInterval(cargarPendientes, 30000);
  setupSocketListeners();
  // Placa bloqueada por defecto - solo se habilita con "Nueva Orden" o "Nueva Búsqueda"
  document.getElementById('placa').disabled = true;
};

function formatoDinero(num) {
  return new Intl.NumberFormat('es-CO').format(num || 0);
}

function parseCurrency(val) {
  if (!val) return 0;
  // Formato colombiano: punto=separador de miles, coma=decimal
  // Ej: 10.000 = 10000, 10,5 = 10.5, $ 15.000 = 15000
  let str = String(val).replace(/[$\s]/g, '');
  str = str.replace(/\./g, '');        // quitar puntos de miles
  str = str.replace(',', '.');         // convertir coma decimal a punto
  return parseFloat(str) || 0;
}

// Validación de campos del formulario
function validarFormulario() {
  const errores = [];

  const placa = document.getElementById('placa').value.trim().toUpperCase();
  const cedula = document.getElementById('cedula').value.trim();
  const nombre = document.getElementById('nombre').value.trim();
  const telefono = document.getElementById('telefono').value.trim();
  const correo = document.getElementById('correo').value.trim();
  const modelo = document.getElementById('modelo').value.trim();

  // Placa: alfanumérica + Ñ, 5-7 caracteres (formato colombiano: AAA00A, AAA000A, etc.)
  if (!placa) {
    errores.push("La placa es obligatoria");
  } else if (!/^[A-ZÑ0-9]{5,7}$/.test(placa)) {
    errores.push("La placa debe tener entre 5 y 7 caracteres alfanuméricos (ej: ABC123, LLT25Ñ)");
  }

  // Cédula: Colombia real (5-10 dígitos, incluyendo antiguas) o CLI-XXXXXX del Excel migrado
  if (!cedula) {
    errores.push("La cédula es obligatoria");
  } else if (!/^CLI-[A-Z0-9]{8}$/.test(cedula) && !/^\d{5,10}$/.test(cedula.replace(/\./g, ''))) {
    errores.push("La cédula debe ser numérica (5-10 dígitos) o formato CLI-XXXXXX para datos migrados");
  }

  // Nombre: mínimo 3 caracteres, solo letras, espacios y tildes
  if (!nombre) {
    errores.push("El nombre del cliente es obligatorio");
  } else if (nombre.length < 3) {
    errores.push("El nombre debe tener al menos 3 caracteres");
  } else if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(nombre)) {
    errores.push("El nombre solo puede contener letras y espacios");
  }

  // Teléfono: si tiene valor, debe ser 10 dígitos (Colombia)
  if (telefono && !/^\d{10}$/.test(telefono.replace(/\s/g, ''))) {
    errores.push("El teléfono debe tener exactamente 10 dígitos (ej: 3001234567)");
  }

  // Correo: si tiene valor, formato válido
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    errores.push("El correo electrónico no tiene un formato válido");
  }

  // Marca y Modelo: obligatorio
  if (!modelo || modelo.length < 2) {
    errores.push("La marca y modelo de la moto es obligatoria (mínimo 2 caracteres)");
  }

  return errores;
}

function agregarFila(tipo, codigo = "", desc = "", cant = 1, precio = 0, total = 0) {
  const tbodyId = tipo === 'Repuesto' ? 'cuerpoRepuestos' :
                  tipo === 'Mano de Obra' ? 'cuerpoManoObra' : 'cuerpoTerceros';
  const tbody = document.getElementById(tbodyId);
  const tr = document.createElement('tr');
  tr.setAttribute('data-type', tipo);
  // Solo mostrar valor formateado si precio es realmente > 0
  const precioStr = (precio && parseFloat(precio) > 0) ? formatoDinero(precio) : '';
  // Placeholder según tipo de servicio
  const placeholderDesc = tipo === 'Repuesto' ? 'Ej: Aceite...' : 
                          tipo === 'Mano de Obra' ? 'Ej: Mano de obra...' : 
                          'Ej: Reparación externa...';
  tr.innerHTML = `
    <td data-label="Código"><input type="text" class="i-codigo" value="${codigo}" placeholder="${tipo === 'Repuesto' ? 'Ej: REF01' : '---'}"></td>
    <td data-label="Descripción"><input type="text" class="i-desc" value="${desc}" placeholder="${placeholderDesc}"></td>
    <td data-label="Cant."><input type="number" class="i-cant" value="${cant}" oninput="calcularFila(this)"></td>
    <td data-label="Precio Unit."><input type="text" class="i-precio" value="${precioStr}" placeholder="$0" oninput="calcularFila(this)" onkeydown="moverFocusPrecio(this, event)"></td>
    <td data-label="Total"><input type="text" class="i-total" value="${formatoDinero(total)}" readonly style="background:#eee; font-weight:bold;"></td>
    <td><button class="btn-del" onclick="eliminarFila(this)">X</button></td>
  `;
  tbody.appendChild(tr);
  calcularTotalesGlobales();
}

// Navegación con Enter entre precios de diferentes filas (modo Excel)
function moverFocusPrecio(input, event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const tbody = input.closest('tbody');
    const todasFilas = tbody.querySelectorAll('tr');
    const filaActual = input.closest('tr');
    let idxFila = -1;
    for (let i = 0; i < todasFilas.length; i++) {
      if (todasFilas[i] === filaActual) { idxFila = i; break; }
    }
    // Si hay siguiente fila en la misma sección, ir a su precio
    if (idxFila >= 0 && idxFila < todasFilas.length - 1) {
      const siguientePrecio = todasFilas[idxFila + 1].querySelector('.i-precio');
      if (siguientePrecio) siguientePrecio.focus();
    } else {
      // Última fila de la sección: ir al botón de agregar de esa sección
      const table = tbody.closest('table');
      const btnAdd = table ? table.nextElementSibling : null;
      if (btnAdd && btnAdd.classList.contains('btn-add')) btnAdd.focus();
    }
  }
}

function eliminarFila(btn) {
  btn.closest("tr").remove();
  calcularTotalesGlobales();
}

function calcularFila(input) {
  const tr = input.closest("tr");
  const cant = parseFloat(tr.querySelector(".i-cant").value) || 0;
  const precioRaw = tr.querySelector(".i-precio").value;
  const precio = parseCurrency(precioRaw);
  tr.querySelector(".i-total").value = formatoDinero(cant * precio);
  calcularTotalesGlobales();
}

function calcularTotalesGlobales() {
  let totalRep = 0;
  let totalSrvPropios = 0;
  let totalSrvTerceros = 0;

  document.querySelectorAll("#cuerpoRepuestos tr, #cuerpoManoObra tr, #cuerpoTerceros tr").forEach(tr => {
    const tipo = tr.getAttribute('data-type') || "";
    const cant = parseFloat(tr.querySelector(".i-cant").value) || 0;
    const precio = parseCurrency(tr.querySelector(".i-precio").value);
    const totalFila = cant * precio;

    if (tipo === "Repuesto") totalRep += totalFila;
    if (tipo === "Mano de Obra") totalSrvPropios += totalFila;
    if (tipo === "MO Terceros") totalSrvTerceros += totalFila;
  });

  document.getElementById("lblTotalRepuestos").innerText = formatoDinero(totalRep);
  document.getElementById("lblTotalServicios").innerText = formatoDinero(totalSrvPropios);
  document.getElementById("lblTotalTerceros").innerText = formatoDinero(totalSrvTerceros);
  document.getElementById("lblGranTotal").innerText = formatoDinero(totalRep + totalSrvPropios + totalSrvTerceros);
}

function cargarAbiertos() {
  fetch(`${API_BASE}/api/servicios/abiertos`, {
    headers: getAuthHeaders(false)
  })
    .then(res => {
      if (!res.ok) throw new Error('Error HTTP ' + res.status);
      return res.json();
    })
    .then(servicios => {
      if (!servicios) return;
      mostrarAbiertos(servicios);
    })
    .catch(err => {
      console.error("Error cargando abiertos:", err);
    });
}

function mostrarAbiertos(servicios) {
  const contenedor = document.getElementById('motos-abiertas');
  contenedor.innerHTML = '';

  servicios.forEach(srv => {
    const bloqueadoPorOtro = srv.lockedBy && srv.lockedBy !== user;
    const div = document.createElement('div');
    div.className = 'tarjeta-moto' + (bloqueadoPorOtro ? ' bloqueada' : '');
    div.innerHTML = `
      <h4>${srv.placa}</h4>
      <p><b>Moto:</b> ${srv.modelo}</p>
      <p><b>Tec:</b> ${srv.tecnico}</p>
      ${bloqueadoPorOtro ? `<span class="lock-badge">🔒 ${srv.lockedBy}</span>` : ''}
    `;
    div.onclick = () => cargarDatosServicioAbierto(srv);
    contenedor.appendChild(div);
  });
}

function cargarDatosServicioAbierto(srv, skipLock) {
  if (servicioBloqueado) return;

  document.getElementById('idServicio').value = srv.idServicio || "";
  document.getElementById('placa').value = srv.placa || "";
  document.getElementById('tecnico').value = srv.tecnico || "";
  document.getElementById('diagnostico').value = srv.diagnostico || "";
  document.getElementById('cedula').value = srv.cedula || "";
  document.getElementById('nombre').value = srv.nombre || "";
  document.getElementById('telefono').value = srv.telefono || "";
  document.getElementById('correo').value = srv.correo || "";
  document.getElementById('modelo').value = srv.modelo || "";
  document.getElementById('comentarios').value = srv.comentarios || "";
  document.getElementById('placa').disabled = true;  // Bloquear placa - no se puede hacer click
  document.getElementById('info-vehiculo').innerText = "Editando orden abierta.";

  document.getElementById("cuerpoRepuestos").innerHTML = "";
  document.getElementById("cuerpoManoObra").innerHTML = "";
  document.getElementById("cuerpoTerceros").innerHTML = "";
  if (srv.items && srv.items.length > 0) {
    srv.items.forEach(item => agregarFila(item.tipo, item.codigo, item.desc, item.cant, item.precio, item.total));
  }
  calcularTotalesGlobales();

  // Bloquear para que nadie más edite este servicio (saltar si skipLock=true)
  if (srv.idServicio && !skipLock) {
    // Verificar si ya está bloqueado por otro usuario
    if (srv.lockedBy && srv.lockedBy !== user) {
      servicioBloqueado = true;
      document.getElementById('locked-overlay').classList.add('active');
      document.getElementById('locked-msg-text').innerText =
        `Este servicio lo está editando ${srv.lockedBy} ahora mismo, espera un momento.`;
      const btns = document.querySelectorAll('.btn-container .action-btn, .btn-add');
      btns.forEach(b => { b.disabled = true; b.style.opacity = '0.4'; });
      mostrarModal("Servicio bloqueado", `Este servicio lo está editando ${srv.lockedBy} ahora mismo.`);
      return;
    }
    socket.emit('lock-service', { idServicio: srv.idServicio, user: user });
  }
}

function nuevaBusqueda() {
  const placa = document.getElementById('placa').value.trim().toUpperCase();
  if (placa.length < 3) return;
  document.getElementById('info-vehiculo').innerText = "Buscando...";

  // Buscar si hay orden ABIERTA para esta placa
  fetch(`${API_BASE}/api/servicios/abiertos`, {
    headers: getAuthHeaders(false)
  })
    .then(res => {
      if (!res.ok) throw new Error('Error HTTP ' + res.status);
      return res.json();
    })
    .then(servicios => {
      const existente = servicios.find(s => s.placa === placa);
      if (existente) {
        // Orden abierta encontrada → cargarla para editar
        cargarDatosServicioAbierto(existente);
        document.getElementById('info-vehiculo').innerText = "Orden abierta encontrada. Editando.";
      } else {
        // No hay orden abierta → informar que use "Nueva Orden" y mantener formulario limpio
        document.getElementById('info-vehiculo').innerText = "No hay orden abierta para esta placa. Use 'Nueva Orden' para crear una.";
        limpiarFormulario();
        document.getElementById('placa').value = placa;
        document.getElementById('placa').disabled = false;
      }
    })
    .catch(err => {
      console.error("Error buscando placa:", err);
      document.getElementById('info-vehiculo').innerText = "Error al buscar.";
    });
}

function procesarServicio(estado) {
  let itemsArr = [];
  let totalRepRaw = 0;
  let totalSrvRaw = 0;

  document.querySelectorAll("#cuerpoRepuestos tr, #cuerpoManoObra tr, #cuerpoTerceros tr").forEach(tr => {
    let tipo = tr.getAttribute('data-type') || "";
    let codigo = tr.querySelector(".i-codigo").value;
    let desc = tr.querySelector(".i-desc").value;
    let cant = parseFloat(tr.querySelector(".i-cant").value) || 0;
    let precio = parseCurrency(tr.querySelector(".i-precio").value);
    let totalPuro = cant * precio;

    if (tipo === "Repuesto") totalRepRaw += totalPuro;
    if (tipo === "Mano de Obra" || tipo === "MO Terceros") totalSrvRaw += totalPuro;

    itemsArr.push({ tipo, codigo, desc, cant, precio, total: totalPuro });
  });

  const datos = {
    idServicio: document.getElementById('idServicio').value,
    placa: document.getElementById('placa').value,
    cedula: document.getElementById('cedula').value,
    nombre_cliente: document.getElementById('nombre').value,
    telefono: document.getElementById('telefono').value,
    correo: document.getElementById('correo').value,
    modelo: document.getElementById('modelo').value,
    tecnico: document.getElementById('tecnico').value,
    diagnostico: document.getElementById('diagnostico').value,
    comentarios: document.getElementById('comentarios').value,
    total_repuestos: totalRepRaw,
    total_mano_obra: totalSrvRaw,
    gran_total: totalRepRaw + totalSrvRaw,
    detalle_servicios: itemsArr.map(item => ({
      tipo: item.tipo,
      codigo: item.codigo,
      descripcion: item.desc,
      cantidad: item.cant,
      precio_unitario: item.precio,
      total: item.total
    })),
    detalle_repuestos: itemsArr
      .filter(item => item.tipo === 'Repuesto')
      .map(item => ({
        codigo: item.codigo,
        descripcion: item.desc,
        cantidad: item.cant,
        precio_unitario: item.precio,
        total: item.total
      })),
    estado
  };

  // Validación profesional — solo para órdenes NUEVAS
  // Las órdenes viejas (con idServicio existente) se cierran sin validar campos incompletos
  if (!datos.idServicio) {
    const errores = validarFormulario();
    if (errores.length > 0) {
      mostrarModal("Corrige los siguientes errores", "• " + errores.join("<br>• "));
      return;
    }
  }

  // Normalizar datos antes de enviar
  datos.placa = datos.placa.trim().toUpperCase();
  datos.cedula = datos.cedula.trim().replace(/\./g, '');
  datos.nombre_cliente = datos.nombre_cliente.trim();
  datos.telefono = datos.telefono.trim().replace(/\s/g, '');
  datos.correo = datos.correo.trim();
  datos.modelo = datos.modelo.trim();

  // Solo afectar botones del formulario principal (no el de cierre diario)
  const btns = document.querySelectorAll('.btn-guardar, .btn-cerrar');
  btns.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; b.innerText = 'Procesando...'; });

  // Bloquear servicio mientras se guarda (solo si es edición)
  if (datos.idServicio) {
    socket.emit('lock-service', { idServicio: datos.idServicio, user: user });
  }

  fetch(`${API_BASE}/api/servicios/guardar`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(datos)
  })
    .then(res => {
      if (!res.ok) throw new Error('Error HTTP ' + res.status);
      return res.json();
    })
    .then(res => {
      mostrarModal("Éxito", res.mensaje || "Servicio guardado correctamente.", "success");
      if (datos.idServicio) {
        socket.emit('unlock-service', { idServicio: datos.idServicio });
      }
      limpiarFormulario();
      cargarAbiertos();
      cargarPendientes();
      habilitarBotones();
    })
    .catch(err => {
      console.error("Error guardando:", err);
      if (datos.idServicio) {
        socket.emit('unlock-service', { idServicio: datos.idServicio });
      }
      mostrarModal("Error de conexión", "No se pudo guardar el servicio. Verifica tu conexión e intenta de nuevo.");
      habilitarBotones();
    });
}

function nuevaOrden() {
  const placa = document.getElementById('placa').value.trim().toUpperCase();
  if (!placa) {
    mostrarModal("Atención", "Ingrese una placa primero");
    return;
  }

  // Limpiar cualquier bloqueo residual
  servicioBloqueado = false;
  document.getElementById('locked-overlay').classList.remove('active');

  fetch(`${API_BASE}/api/servicios/buscar-placa`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ placa })
  })
    .then(res => {
      if (!res.ok) throw new Error('Error HTTP ' + res.status);
      return res.json();
    })
    .then(res => {
      if (res.existe === true) {
        // Cliente existente → auto-llenar
        document.getElementById('cedula').value = res.cliente.cedula || '';
        document.getElementById('nombre').value = res.cliente.nombre || '';
        document.getElementById('telefono').value = res.cliente.telefono || '';
        document.getElementById('correo').value = res.cliente.correo || '';
        document.getElementById('modelo').value = res.vehiculo.modelo || '';
        document.getElementById('placa').value = placa;
        document.getElementById('idServicio').value = '';
        document.getElementById('tecnico').value = '';
        document.getElementById('diagnostico').value = '';
        document.getElementById('comentarios').value = '';
        document.getElementById("cuerpoRepuestos").innerHTML = '';
        document.getElementById("cuerpoManoObra").innerHTML = '';
        document.getElementById("cuerpoTerceros").innerHTML = '';
        calcularTotalesGlobales();
        document.getElementById('info-vehiculo').innerText = "Cliente encontrado. Datos cargados. Complete la orden.";
      } else {
        // Nuevo cliente → limpiar todo excepto placa
        document.getElementById('idServicio').value = '';
        document.getElementById('cedula').value = '';
        document.getElementById('nombre').value = '';
        document.getElementById('telefono').value = '';
        document.getElementById('correo').value = '';
        document.getElementById('modelo').value = '';
        document.getElementById('tecnico').value = '';
        document.getElementById('diagnostico').value = '';
        document.getElementById('comentarios').value = '';
        document.getElementById("cuerpoRepuestos").innerHTML = '';
        document.getElementById("cuerpoManoObra").innerHTML = '';
        document.getElementById("cuerpoTerceros").innerHTML = '';
        document.getElementById('placa').value = placa;
        calcularTotalesGlobales();
        document.getElementById('info-vehiculo').innerText = "Nuevo cliente. Complete los datos.";
      }
      // Asegurar que todo sea editable y la placa no esté disabled
      document.getElementById('placa').disabled = false;
      habilitarBotones();
    })
    .catch(err => {
      console.error("Error buscando placa:", err);
      document.getElementById('info-vehiculo').innerText = "Error al buscar cliente.";
    });
}

function limpiarFormulario() {
  // Liberar lock si estábamos editando un servicio
  const idActual = document.getElementById('idServicio').value;
  if (idActual) {
    socket.emit('unlock-service', { idServicio: idActual });
  }

  document.querySelectorAll('#form-registro input[type="text"], #form-registro input[type="email"], #form-registro textarea').forEach(el => el.value = '');
  document.getElementById('placa').value = '';
  document.getElementById('correo').value = '';
  document.getElementById('placa').disabled = false; // Habilitar para buscar por placa
  document.getElementById('info-vehiculo').innerText = '🔍 Escribe la placa y presiona Enter para buscar.';
  document.getElementById('idServicio').value = '';
  document.getElementById("cuerpoRepuestos").innerHTML = "";
  document.getElementById("cuerpoManoObra").innerHTML = "";
  document.getElementById("cuerpoTerceros").innerHTML = "";
  calcularTotalesGlobales();
}

function ejecutarCierre() {
  const fecha = document.getElementById('fechaCierre').value;
  const tecnico = document.getElementById('tecnicoCierre').value;
  if (!fecha) return;
  
  const btn = document.querySelector('.cierre-section .action-btn');
  const originalText = btn.innerText;
  btn.disabled = true;
  btn.innerText = 'Procesando...';
  document.getElementById('resultadoCierre').innerText = "Calculando...";

  fetch(`${API_BASE}/api/cierres/generar`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ fecha, tecnico })
  })
    .then(res => {
      if (!res.ok) throw new Error('Error HTTP ' + res.status);
      return res.json();
    })
    .then(res => {
      const totalFmt = Number(res.total_facturado || 0).toLocaleString('es-CO');
      const msg = `✅ Cierre de MANO DE OBRA para ${res.tecnico}:
- Motos entregadas: ${res.cantidad_servicios}
- Total Taller: $${totalFmt}
(Terceros Excluidos)`;
      document.getElementById('resultadoCierre').innerText = msg;
      btn.disabled = false;
      btn.innerText = originalText;
    })
    .catch(err => {
      console.error("Error en cierre:", err);
      document.getElementById('resultadoCierre').innerText = "Error al generar cierre.";
      btn.disabled = false;
      btn.innerText = originalText;
    });
}

function habilitarBotones() {
  const btns = document.querySelectorAll('.btn-guardar, .btn-cerrar');
  btns.forEach(b => { b.disabled = false; b.style.opacity = '1'; });
  const btnGuardar = document.querySelector('.btn-guardar');
  const btnCerrar = document.querySelector('.btn-cerrar');
  if (btnGuardar) btnGuardar.innerText = 'Guardar Avance';
  if (btnCerrar) btnCerrar.innerText = 'Finalizar';
  // También restaurar botones de agregar items
  const addBtns = document.querySelectorAll('.btn-add');
  addBtns.forEach(b => { b.disabled = false; b.style.opacity = '1'; });
}

function setupSocketListeners() {
  socket.on('connect', () => {
    console.log('Conectado al servidor:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('Desconectado del servidor');
  });

  socket.on('service-locked', (data) => {
    cargarAbiertos();
    if (data.user === user) return;
    // Solo bloquear si estamos viendo el MISMO servicio
    const idActual = document.getElementById('idServicio').value;
    if (!idActual || idActual !== data.idServicio) return;
    servicioBloqueado = true;
    document.getElementById('locked-msg-text').innerText =
      `Este servicio lo está editando ${data.user} ahora mismo, espera un momento.`;
    document.getElementById('locked-overlay').classList.add('active');
    const btns = document.querySelectorAll('.btn-container .action-btn, .btn-add');
    btns.forEach(b => { b.disabled = true; b.style.opacity = '0.4'; });
  });

  socket.on('service-unlocked', (data) => {
    servicioBloqueado = false;
    document.getElementById('locked-overlay').classList.remove('active');
    habilitarBotones();
    // Refrescar datos de abiertos por si cambió el lockedBy
    cargarAbiertos();
    // Si estamos viendo el servicio que se liberó, recargar datos (sin re-bloquear)
    if (data && data.idServicio) {
      const idActual = document.getElementById('idServicio').value;
      if (idActual && idActual === data.idServicio) {
        cargarServicioPorId(data.idServicio, true);
      }
    }
  });

  socket.on('lock-rejected', (data) => {
    // Otro usuario ya lo tenía bloqueado → limpiamos el formulario
    servicioBloqueado = true;
    document.getElementById('locked-overlay').classList.add('active');
    document.getElementById('locked-msg-text').innerText =
      data.message || `Este servicio lo está editando ${data.lockedBy} ahora mismo.`;
    const btns = document.querySelectorAll('.btn-container .action-btn, .btn-add');
    btns.forEach(b => { b.disabled = true; b.style.opacity = '0.4'; });
    mostrarModal("Servicio bloqueado", data.message || `Este servicio lo está editando ${data.lockedBy} ahora mismo.`);
  });
}

function cargarServicioPorId(idServicio, skipLock) {
  fetch(`${API_BASE}/api/servicios/${idServicio}`, {
    headers: getAuthHeaders(false)
  })
    .then(res => {
      if (!res.ok) throw new Error('Error HTTP ' + res.status);
      return res.json();
    })
    .then(srv => {
      cargarDatosServicioAbierto(srv, skipLock);
    })
    .catch(err => {
      console.error("Error recargando servicio:", err);
    });
}

// ── Panel de Servicios Pendientes ──────────────────────────────

function cargarPendientes() {
  fetch(`${API_BASE}/api/servicios/pendientes`, {
    headers: getAuthHeaders(false)
  })
    .then(res => {
      if (!res.ok) throw new Error('Error HTTP ' + res.status);
      return res.json();
    })
    .then(servicios => {
      renderPendientes(servicios);
    })
    .catch(err => {
      console.error("Error cargando pendientes:", err);
    });
}

function renderPendientes(servicios) {
  const dd = document.getElementById('dropdown-pendientes');
  const body = document.getElementById('pendientes-body');
  const badge = document.getElementById('pendientes-badge');
  const footer = document.getElementById('pendientes-footer');

  if (!servicios || servicios.length === 0) {
    badge.style.display = 'none';
    if (body) body.innerHTML = '<div class="dd-vacio">No hay servicios abiertos</div>';
    if (footer) footer.style.display = 'none';
    return;
  }

  // Agrupar por urgencia
  const vencidos = servicios.filter(s => s.dias_abierto > 3);
  const riesgo = servicios.filter(s => s.dias_abierto >= 1 && s.dias_abierto <= 3);
  const recientes = servicios.filter(s => s.dias_abierto < 1);

  badge.textContent = servicios.length;
  badge.style.display = 'inline';
  if (body) body.innerHTML = '';

  // 🔴 Vencidos (>3 días)
  if (vencidos.length > 0) {
    const grupo = document.createElement('div');
    grupo.className = 'pendiente-grupo';
    grupo.innerHTML = `<h4 class="vencido">🔴 VENCIDOS (más de 3 días): ${vencidos.length}</h4>`;
    vencidos.forEach(s => grupo.appendChild(crearItemPendiente(s)));
    body.appendChild(grupo);
  }

  // 🟡 Riesgo (1-3 días)
  if (riesgo.length > 0) {
    const grupo = document.createElement('div');
    grupo.className = 'pendiente-grupo';
    grupo.innerHTML = `<h4 class="riesgo">🟡 RIESGO (1-3 días): ${riesgo.length}</h4>`;
    riesgo.forEach(s => grupo.appendChild(crearItemPendiente(s)));
    body.appendChild(grupo);
  }

  // 🟢 Recientes (<1 día)
  if (recientes.length > 0) {
    const grupo = document.createElement('div');
    grupo.className = 'pendiente-grupo';
    grupo.innerHTML = `<h4 class="reciente">🟢 HOY: ${recientes.length}</h4>`;
    recientes.forEach(s => grupo.appendChild(crearItemPendiente(s)));
    body.appendChild(grupo);
  }

  if (footer) footer.style.display = servicios.length > 1 ? 'block' : 'none';
}

function togglePendientes(e) {
  e.stopPropagation();
  const dd = document.getElementById('dropdown-pendientes');
  const isOpen = dd.classList.contains('open');
  
  if (isOpen) {
    dd.classList.remove('open');
  } else {
    dd.innerHTML = '<div class="dd-header"><h3>Servicios Abiertos</h3><button onclick="cargarPendientes()" style="background:none;border:none;cursor:pointer;font-size:16px;" title="Actualizar">🔄</button></div><div class="dd-body" id="pendientes-body"><div class="dd-vacio">Cargando...</div></div><div class="dd-footer" id="pendientes-footer" style="display:none;"><button onclick="cerrarTodosPendientes()">Cerrar todos</button></div>';
    dd.classList.add('open');
    cargarPendientes();
  }
}

// Cerrar dropdown al hacer clic fuera
document.addEventListener('click', (e) => {
  const dd = document.getElementById('dropdown-pendientes');
  const wrap = document.querySelector('.pendientes-wrap');
  if (dd && wrap && !dd.contains(e.target) && !wrap.contains(e.target)) {
    dd.classList.remove('open');
  }
});

function crearItemPendiente(srv) {
  const div = document.createElement('div');
  div.className = 'pendiente-item';
  div.innerHTML = `
    <div class="info">
      <span class="placa-tag">${srv.placa}</span>
      <span class="meta"> | ${srv.modelo || 'N/A'} | ${srv.tecnico} | ${srv.dias_abierto}d</span>
    </div>
    <button class="btn-entregar" onclick="cerrarServicioRapido('${srv.idServicio}', this)">Confirmar entrega</button>
  `;
  return div;
}

async function cerrarServicioRapido(idServicio, btn) {
  const ok = await mostrarConfirmModal("Cerrar servicio", `¿Cerrar servicio <b>${idServicio}</b>? Se marcará como entregado.`);
  if (!ok) return;

  btn.disabled = true;
  btn.innerText = 'Cerrando...';

  fetch(`${API_BASE}/api/servicios/cerrar-rapido`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ idServicio })
  })
    .then(res => {
      if (!res.ok) throw new Error('Error HTTP ' + res.status);
      return res.json();
    })
    .then(res => {
      mostrarModal("Servicio cerrado", res.mensaje || `${idServicio} marcado como entregado.`, "success");
      cargarPendientes();
      cargarAbiertos();
    })
    .catch(err => {
      console.error("Error cerrando rápido:", err);
      mostrarModal("Error", "No se pudo cerrar el servicio. Intenta de nuevo.");
      btn.disabled = false;
      btn.innerText = 'Confirmar entrega';
    });
}

async function cerrarTodosPendientes() {
  const items = document.querySelectorAll('.pendiente-item .btn-entregar:not(:disabled)');
  if (items.length === 0) return;

  const ok = await mostrarConfirmModal("Cerrar todos", `¿Cerrar TODOS los <b>${items.length}</b> servicios pendientes?`);
  if (!ok) return;

  items.forEach(btn => btn.click());
}
