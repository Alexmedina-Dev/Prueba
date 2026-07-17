const API_BASE = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : `http://${window.location.hostname}:3000`;
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

function cerrarSesion() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = '../index.html';
}

window.onload = function () {
  cargarAbiertos();
  document.getElementById('fechaCierre').valueAsDate = new Date();
  setInterval(cargarAbiertos, 15000);
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

  // Placa: alfanumérica, mínimo 5 caracteres (AAA00, AAA000, AAA00A)
  if (!placa) {
    errores.push("La placa es obligatoria");
  } else if (!/^[A-Z0-9]{5,7}$/.test(placa)) {
    errores.push("La placa debe tener entre 5 y 7 caracteres alfanuméricos (ej: ABC123)");
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
  const tbody = document.getElementById('cuerpoItems');
  const tr = document.createElement('tr');
  // Solo mostrar valor formateado si precio es realmente > 0
  const precioStr = (precio && parseFloat(precio) > 0) ? formatoDinero(precio) : '';
  // Placeholder según tipo de servicio
  const placeholderDesc = tipo === 'Repuesto' ? 'Ej: Aceite...' : 
                          tipo === 'Mano de Obra' ? 'Ej: Mano de obra...' : 
                          'Ej: Reparación externa...';
  tr.innerHTML = `
    <td><input type="text" value="${tipo}" readonly style="background:#eee; font-size:12px; color:#555;"></td>
    <td><input type="text" class="i-codigo" value="${codigo}" placeholder="${tipo === 'Repuesto' ? 'Ej: REF01' : '---'}"></td>
    <td><input type="text" class="i-desc" value="${desc}" placeholder="${placeholderDesc}"></td>
    <td><input type="number" class="i-cant" value="${cant}" oninput="calcularFila(this)"></td>
    <td><input type="text" class="i-precio" value="${precioStr}" placeholder="$0" oninput="calcularFila(this)" onkeydown="moverFocusPrecio(this, event)"></td>
    <td><input type="text" class="i-total" value="${formatoDinero(total)}" readonly style="background:#eee; font-weight:bold;"></td>
    <td style="text-align:center;"><button class="btn-del" onclick="eliminarFila(this)">X</button></td>
  `;
  tbody.appendChild(tr);
  calcularTotalesGlobales();
}

// Navegación con Enter entre precios de diferentes filas (modo Excel)
function moverFocusPrecio(input, event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    const todasFilas = document.querySelectorAll('#cuerpoItems tr');
    const filaActual = input.closest('tr');
    let idxFila = -1;
    for (let i = 0; i < todasFilas.length; i++) {
      if (todasFilas[i] === filaActual) { idxFila = i; break; }
    }
    // Si hay siguiente fila, ir a su precio
    if (idxFila >= 0 && idxFila < todasFilas.length - 1) {
      const siguientePrecio = todasFilas[idxFila + 1].querySelector('.i-precio');
      if (siguientePrecio) siguientePrecio.focus();
    } else {
      // Última fila: ir al botón de agregar repuesto
      document.querySelector('.btn-add').focus();
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

  document.querySelectorAll("#cuerpoItems tr").forEach(tr => {
    const tipo = tr.querySelector("td input").value;
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
    const div = document.createElement('div');
    div.className = 'tarjeta-moto';
    div.innerHTML = `
      <h4>${srv.placa}</h4>
      <p><b>Moto:</b> ${srv.modelo}</p>
      <p><b>Tec:</b> ${srv.tecnico}</p>
    `;
    div.onclick = () => cargarDatosServicioAbierto(srv);
    contenedor.appendChild(div);
  });
}

function cargarDatosServicioAbierto(srv) {
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

  document.getElementById("cuerpoItems").innerHTML = "";
  if (srv.items && srv.items.length > 0) {
    srv.items.forEach(item => agregarFila(item.tipo, item.codigo, item.desc, item.cant, item.precio, item.total));
  }
  calcularTotalesGlobales();

  if (srv.idServicio) {
    socket.emit('lock-service', { idServicio: srv.idServicio, user: user });
  }
}

function buscarPlaca() {
  const placa = document.getElementById('placa').value.trim().toUpperCase();
  if (placa.length < 3) return;
  document.getElementById('info-vehiculo').innerText = "Buscando...";

  // 1. Buscar si hay orden ABIERTA para esta placa
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
        return;
      }
      // 2. No hay orden abierta → buscar datos del cliente/vehículo
      return fetch(`${API_BASE}/api/servicios/buscar-placa`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ placa: placa })
      });
    })
    .then(res => {
      if (!res) return; // Ya se cargó orden abierta
      return res.json();
    })
    .then(res => {
      if (!res) return;
      if (res.existe) {
        document.getElementById('cedula').value = res.cliente.cedula || "";
        document.getElementById('nombre').value = res.cliente.nombre || "";
        document.getElementById('telefono').value = res.cliente.telefono || "";
        document.getElementById('correo').value = res.cliente.correo || "";
        document.getElementById('modelo').value = res.vehiculo.modelo || "";
        document.getElementById('info-vehiculo').innerText = "Vehículo encontrado. Crear nueva orden.";
      } else {
        document.getElementById('info-vehiculo').innerText = "Vehículo nuevo. Complete los datos.";
      }
      document.getElementById('placa').disabled = true;
    })
    .catch(err => {
      console.error("Error buscando placa:", err);
      document.getElementById('info-vehiculo').innerText = "Error al buscar.";
    });
}

function procesarServicio(estado) {
  if (servicioBloqueado) {
    mostrarModal("Servicio bloqueado", "Este servicio está siendo editado por otro usuario. Espera un momento.");
    return;
  }

  let itemsArr = [];
  let totalRepRaw = 0;
  let totalSrvRaw = 0;

  document.querySelectorAll("#cuerpoItems tr").forEach(tr => {
    let tipo = tr.querySelector("td input").value;
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

  // Validación profesional de todos los campos
  const errores = validarFormulario();
  if (errores.length > 0) {
    mostrarModal("Corrige los siguientes errores", "• " + errores.join("<br>• "));
    return;
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
      habilitarBotones();
    })
    .catch(err => {
      console.error("Error guardando:", err);
      mostrarModal("Error de conexión", "No se pudo guardar el servicio. Verifica tu conexión e intenta de nuevo.");
      habilitarBotones();
    });
}

function nuevaOrden() {
  document.getElementById('idServicio').value = '';
  document.getElementById('placa').value = '';
  document.getElementById('cedula').value = '';
  document.getElementById('nombre').value = '';
  document.getElementById('telefono').value = '';
  document.getElementById('correo').value = '';
  document.getElementById('modelo').value = '';
  document.getElementById('tecnico').value = '';
  document.getElementById('diagnostico').value = '';
  document.getElementById('comentarios').value = '';
  document.getElementById('cuerpoItems').innerHTML = '';
  document.getElementById('info-vehiculo').innerText = 'Nueva orden.';
  document.getElementById('placa').disabled = false;
  calcularTotalesGlobales();
  habilitarBotones();
  document.getElementById('placa').focus();
}

function limpiarFormulario() {
  document.querySelectorAll('#form-registro input[type="text"], #form-registro input[type="email"], #form-registro textarea').forEach(el => el.value = '');
  document.getElementById('placa').value = '';
  document.getElementById('correo').value = '';
  document.getElementById('placa').disabled = false; // Habilitar para buscar por placa
  document.getElementById('info-vehiculo').innerText = '';
  document.getElementById('idServicio').value = '';
  document.getElementById("cuerpoItems").innerHTML = "";
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
}

function setupSocketListeners() {
  socket.on('connect', () => {
    console.log('Conectado al servidor:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('Desconectado del servidor');
  });

  socket.on('service-locked', (data) => {
    if (data.user === user) return;
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
    if (data && data.idServicio) {
      const idActual = document.getElementById('idServicio').value;
      if (idActual && idActual === data.idServicio) {
        cargarServicioPorId(data.idServicio);
      }
    }
  });
}

function cargarServicioPorId(idServicio) {
  fetch(`${API_BASE}/api/servicios/${idServicio}`, {
    headers: getAuthHeaders(false)
  })
    .then(res => {
      if (!res.ok) throw new Error('Error HTTP ' + res.status);
      return res.json();
    })
    .then(srv => {
      cargarDatosServicioAbierto(srv);
    })
    .catch(err => {
      console.error("Error recargando servicio:", err);
    });
}
