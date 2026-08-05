const express = require('express');
const router = express.Router();
const pool = require('../db');
const auth = require('../middleware/auth');
const syncSheets = require('../utils/sync-sheets');
const { encolarSync } = require('../utils/sheets-queue');
const { logError } = require('../utils/logger');
const { validateGuardarServicio } = require('../validators/servicioSchema');

// ── Función compartida para obtener servicios abiertos ─────
// Evita duplicación entre /abiertos y /pendientes
async function obtenerServiciosAbiertos({ incluirDetalle = true, ordenarDesc = true, incluirDias = false } = {}) {
  const selectExtra = incluirDias ? ', DATEDIFF(NOW(), s.fecha) AS dias_abierto' : '';
  const selectDetalle = incluirDetalle 
    ? 's.id, s.detalle_repuestos, s.detalle_servicios, s.fecha_salida, s.lockedBy, s.lockedAt, c.telefono AS telefono, c.correo AS correo' 
    : 's.idServicio, DATEDIFF(NOW(), s.fecha) AS dias_abierto';
  const orderBy = ordenarDesc ? 'ORDER BY s.fecha DESC' : 'ORDER BY s.fecha ASC';

  const [rows] = await pool.execute(`
    SELECT
      s.idServicio, s.fecha, s.placa, s.tecnico,
      s.diagnostico, s.total_repuestos, s.total_mano_obra, s.gran_total,
      s.estado, s.comentarios,
      ${incluirDetalle ? 's.id, s.detalle_repuestos, s.detalle_servicios, s.fecha_salida, s.lockedBy, s.lockedAt,' : 'DATEDIFF(NOW(), s.fecha) AS dias_abierto,'}
      v.idServicio AS vehiculo_idServicio, v.modelo, v.kilometraje,
      c.idServicio AS cliente_idServicio, c.nombre AS nombre, c.cedula
      ${incluirDetalle ? ', c.telefono AS telefono, c.correo AS correo' : ''}
    FROM servicios s
    LEFT JOIN vehiculos v ON s.placa = v.placa
    LEFT JOIN clientes c ON v.cedula_cliente = c.cedula
    WHERE s.estado = 'Abierto'
    ${orderBy}
  `);

  // Obtener items de detalle_servicios solo si se solicita
  if (incluirDetalle && rows.length > 0) {
    const ids = rows.map(r => r.idServicio);
    const placeholders = ids.map(() => '?').join(',');
    const [items] = await pool.execute(`
      SELECT idServicio, tipo, codigo, descripcion, cantidad, precio_unitario, subtotal as total
      FROM detalle_servicios
      WHERE idServicio IN (${placeholders})
      ORDER BY id
    `, ids);

    const itemsMap = {};
    for (const item of items) {
      if (!itemsMap[item.idServicio]) itemsMap[item.idServicio] = [];
      itemsMap[item.idServicio].push({
        tipo: item.tipo,
        codigo: item.codigo,
        desc: item.descripcion,
        cant: item.cantidad,
        precio: item.precio_unitario,
        total: item.total
      });
    }

    for (const row of rows) {
      row.items = itemsMap[row.idServicio] || [];
    }
  }

  return rows;
}

// GET /api/servicios/abiertos
router.get('/abiertos', auth, async (req, res) => {
  try {
    const rows = await obtenerServiciosAbiertos({ incluirDetalle: true, ordenarDesc: true });
    res.json(rows);
  } catch (e) {
    logError({
      tipo: 'ERROR_DB',
      ruta: '/api/servicios/abiertos',
      metodo: 'GET',
      mensaje: e.message,
      stack: e.stack,
      usuario: req.user?.email
    });
    res.status(500).json({ error: 'Error al obtener servicios abiertos' });
  }
});

// GET /api/servicios/pendientes — servicios abiertos con días de antigüedad para panel
router.get('/pendientes', auth, async (req, res) => {
  try {
    const rows = await obtenerServiciosAbiertos({ incluirDetalle: false, ordenarDesc: false });
    res.json(rows);
  } catch (e) {
    logError({
      tipo: 'ERROR_DB',
      ruta: '/api/servicios/pendientes',
      metodo: 'GET',
      mensaje: e.message,
      stack: e.stack,
      usuario: req.user?.email
    });
    res.status(500).json({ error: 'Error al obtener servicios pendientes' });
  }
});

// GET /api/servicios/:id — obtener servicio por ID con items
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(`
      SELECT
        s.id, s.idServicio, s.fecha, s.placa, s.tecnico,
        s.diagnostico, s.detalle_repuestos, s.detalle_servicios,
        s.total_repuestos, s.total_mano_obra, s.gran_total,
        s.estado, s.comentarios, s.fecha_salida,
        s.lockedBy, s.lockedAt,
        v.idServicio AS vehiculo_idServicio, v.modelo, v.kilometraje,
        c.idServicio AS cliente_idServicio, c.nombre AS nombre, c.telefono AS telefono, c.correo AS correo, c.cedula
      FROM servicios s
      LEFT JOIN vehiculos v ON s.placa = v.placa
      LEFT JOIN clientes c ON v.cedula_cliente = c.cedula
      WHERE s.idServicio = ?
    `, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }

    const srv = rows[0];

    // Obtener items del detalle
    const [items] = await pool.execute(`
      SELECT tipo, codigo, descripcion, cantidad, precio_unitario, subtotal as total
      FROM detalle_servicios
      WHERE idServicio = ?
      ORDER BY id
    `, [id]);

    srv.items = items;
    res.json(srv);
  } catch (e) {
    logError({
      tipo: 'ERROR_DB',
      ruta: '/api/servicios/:id',
      metodo: 'GET',
      mensaje: e.message,
      stack: e.stack,
      datos: req.params,
      usuario: req.user?.email
    });
    res.status(500).json({ error: 'Error al obtener servicio' });
  }
});

// POST /api/servicios/buscar-placa
router.post('/buscar-placa', auth, async (req, res) => {
  try {
    const { placa } = req.body;
    if (!placa) {
      return res.status(400).json({ error: 'Placa requerida' });
    }

    // Buscar vehículo y cliente
    const [vehiculo] = await pool.execute(`
      SELECT v.idServicio AS vehiculo_idServicio, v.*, c.idServicio AS cliente_idServicio, c.nombre AS cliente_nombre, c.telefono, c.correo
      FROM vehiculos v
      LEFT JOIN clientes c ON v.cedula_cliente = c.cedula
      WHERE v.placa = ?
    `, [placa]);

    if (vehiculo.length === 0) {
      return res.json({ existe: false, vehiculo: null, cliente: null, historial: [] });
    }

    const v = vehiculo[0];

    // Historial de servicios cerrados
    const [historial] = await pool.execute(`
      SELECT id, idServicio, fecha, tecnico, diagnostico,
             total_repuestos, total_mano_obra, gran_total,
             estado, fecha_salida
      FROM servicios
      WHERE placa = ? AND estado = 'Cerrado'
      ORDER BY fecha_salida DESC
      LIMIT 20
    `, [placa]);

    res.json({
      existe: true,
      vehiculo: { placa: v.placa, modelo: v.modelo, cedula_cliente: v.cedula_cliente, kilometraje: v.kilometraje },
      cliente: { cedula: v.cedula_cliente, nombre: v.cliente_nombre, telefono: v.telefono, correo: v.correo },
      historial
    });
  } catch (e) {
    logError({
      tipo: 'ERROR_DB',
      ruta: '/api/servicios/buscar-placa',
      metodo: 'POST',
      mensaje: e.message,
      stack: e.stack,
      datos: req.body,
      usuario: req.user?.email
    });
    res.status(500).json({ error: 'Error al buscar vehículo' });
  }
});

// ── Funciones auxiliares para guardarServicio ──────────────
// Separadas para cumplir SRP y facilitar testing

function calcularTotales(detalle_servicios) {
  let calc_total_repuestos = 0;
  let calc_total_mano_obra = 0;

  if (detalle_servicios && Array.isArray(detalle_servicios)) {
    for (const d of detalle_servicios) {
      const subtotal = (d.cantidad || 0) * (d.precio_unitario || 0);
      if (d.tipo === 'Repuesto') {
        calc_total_repuestos += subtotal;
      } else if (d.tipo === 'Mano de Obra') {
        calc_total_mano_obra += subtotal;
      }
    }
  }

  return {
    calc_total_repuestos,
    calc_total_mano_obra,
    calc_gran_total: calc_total_repuestos + calc_total_mano_obra
  };
}

async function upsertCliente(conn, idServicio, cedula, nombre, telefono, correo) {
  await conn.execute(`
    INSERT INTO clientes (idServicio, cedula, nombre, telefono, correo)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      idServicio = VALUES(idServicio),
      nombre = VALUES(nombre),
      telefono = VALUES(telefono),
      correo = VALUES(correo)
  `, [idServicio, cedula, nombre, telefono, correo]);
}

async function upsertVehiculo(conn, idServicio, placa, cedula, modelo, kilometraje) {
  await conn.execute(`
    INSERT INTO vehiculos (idServicio, placa, cedula_cliente, modelo, kilometraje)
    VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      idServicio = VALUES(idServicio),
      cedula_cliente = VALUES(cedula_cliente),
      modelo = VALUES(modelo),
      kilometraje = VALUES(kilometraje)
  `, [idServicio, placa, cedula, modelo, kilometraje]);
}

async function upsertServicio(conn, params) {
  const {
    idServicio, nuevoId, placa, tecnico, diagnostico,
    detalle_repuestos, detalle_servicios,
    calc_total_repuestos, calc_total_mano_obra, calc_gran_total,
    estado, comentarios
  } = params;

  const servicioId = idServicio || nuevoId;
  const esCerrado = estado === 'Cerrado';

  if (idServicio) {
    // Verificar si ya existe
    const [existing] = await conn.execute(
      'SELECT id FROM servicios WHERE idServicio = ?', [idServicio]
    );

    if (existing.length > 0) {
      // UPDATE
      if (esCerrado) {
        await conn.execute(`
          UPDATE servicios SET
            placa=?, tecnico=?, diagnostico=?,
            detalle_repuestos=?, detalle_servicios=?,
            total_repuestos=?, total_mano_obra=?, gran_total=?,
            estado=?, comentarios=?, fecha_salida=NOW(),
            lockedBy=NULL, lockedAt=NULL
          WHERE idServicio=?
        `, [placa, tecnico, diagnostico,
            JSON.stringify(detalle_repuestos), JSON.stringify(detalle_servicios),
            calc_total_repuestos, calc_total_mano_obra, calc_gran_total,
            estado, comentarios, idServicio]);
      } else {
        await conn.execute(`
          UPDATE servicios SET
            placa=?, tecnico=?, diagnostico=?,
            detalle_repuestos=?, detalle_servicios=?,
            total_repuestos=?, total_mano_obra=?, gran_total=?,
            estado=?, comentarios=?
          WHERE idServicio=?
        `, [placa, tecnico, diagnostico,
            JSON.stringify(detalle_repuestos), JSON.stringify(detalle_servicios),
            calc_total_repuestos, calc_total_mano_obra, calc_gran_total,
            estado, comentarios, idServicio]);
      }
    } else {
      // INSERT con ID proporcionado
      if (esCerrado) {
        await conn.execute(`
          INSERT INTO servicios
            (idServicio, fecha, placa, tecnico, diagnostico,
             detalle_repuestos, detalle_servicios,
             total_repuestos, total_mano_obra, gran_total,
             estado, comentarios, fecha_salida)
          VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [idServicio, placa, tecnico, diagnostico,
            JSON.stringify(detalle_repuestos), JSON.stringify(detalle_servicios),
            calc_total_repuestos, calc_total_mano_obra, calc_gran_total,
            estado, comentarios]);
      } else {
        await conn.execute(`
          INSERT INTO servicios
            (idServicio, fecha, placa, tecnico, diagnostico,
             detalle_repuestos, detalle_servicios,
             total_repuestos, total_mano_obra, gran_total,
             estado, comentarios)
          VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [idServicio, placa, tecnico, diagnostico,
            JSON.stringify(detalle_repuestos), JSON.stringify(detalle_servicios),
            calc_total_repuestos, calc_total_mano_obra, calc_gran_total,
            estado, comentarios]);
      }
    }
  } else {
    // INSERT con nuevoId generado
    if (esCerrado) {
      await conn.execute(`
        INSERT INTO servicios
          (idServicio, fecha, placa, tecnico, diagnostico,
           detalle_repuestos, detalle_servicios,
           total_repuestos, total_mano_obra, gran_total,
           estado, comentarios, fecha_salida)
        VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `, [nuevoId, placa, tecnico, diagnostico,
          JSON.stringify(detalle_repuestos), JSON.stringify(detalle_servicios),
          calc_total_repuestos, calc_total_mano_obra, calc_gran_total,
          estado, comentarios]);
    } else {
      await conn.execute(`
        INSERT INTO servicios
          (idServicio, fecha, placa, tecnico, diagnostico,
           detalle_repuestos, detalle_servicios,
           total_repuestos, total_mano_obra, gran_total,
           estado, comentarios)
        VALUES (?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [nuevoId, placa, tecnico, diagnostico,
          JSON.stringify(detalle_repuestos), JSON.stringify(detalle_servicios),
          calc_total_repuestos, calc_total_mano_obra, calc_gran_total,
          estado, comentarios]);
    }
  }
}

async function syncDetalleServicios(conn, idServicio, detalle_servicios) {
  if (!detalle_servicios || !Array.isArray(detalle_servicios)) return;

  await conn.execute('DELETE FROM detalle_servicios WHERE idServicio=?', [idServicio]);

  for (const d of detalle_servicios) {
    const subtotal = (d.cantidad || 0) * (d.precio_unitario || 0);
    await conn.execute(`
      INSERT INTO detalle_servicios
        (idServicio, tipo, codigo, descripcion, cantidad, precio_unitario, subtotal)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [idServicio, d.tipo, d.codigo, d.descripcion, d.cantidad, d.precio_unitario, subtotal]);
  }
}

// POST /api/servicios/guardar
router.post('/guardar', auth, validateGuardarServicio, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      idServicio, cedula, nombre_cliente, telefono, correo,
      placa, modelo,
      tecnico, diagnostico, detalle_repuestos, detalle_servicios,
      total_repuestos, total_mano_obra, gran_total,
      estado, comentarios
    } = req.body;

    // Pre-generar ID para nuevos servicios
    let nuevoId = null;
    if (!idServicio) {
      nuevoId = `SRV-${Date.now()}`;
    }
    const targetId = idServicio || nuevoId;

    // Validar que no exista orden abierta para esta placa al crear nuevo servicio
    if (!idServicio) {
      const [existing] = await conn.execute(
        'SELECT idServicio FROM servicios WHERE placa = ? AND estado = ? LIMIT 1',
        [placa, 'Abierto']
      );
      if (existing.length > 0) {
        await conn.rollback();
        return res.status(409).json({
          error: `La moto ${placa} ya tiene orden abierta: ${existing[0].idServicio}. Finalizala antes de crear nueva.`
        });
      }
    }

    // 1. Upsert cliente
    await upsertCliente(conn, targetId, cedula, nombre_cliente, telefono, correo);

    // 2. Upsert vehículo
    await upsertVehiculo(conn, targetId, placa, cedula, modelo, req.body.kilometraje || null);

    // 3. Calcular totales desde detalle_servicios
    const { calc_total_repuestos, calc_total_mano_obra, calc_gran_total } = calcularTotales(detalle_servicios);

    // 4. Upsert servicio
    await upsertServicio(conn, {
      idServicio, nuevoId, placa, tecnico, diagnostico,
      detalle_repuestos, detalle_servicios,
      calc_total_repuestos, calc_total_mano_obra, calc_gran_total,
      estado, comentarios
    });

    // 5. Sync detalle_servicios
    const servicioId = idServicio || nuevoId;
    await syncDetalleServicios(conn, servicioId, detalle_servicios);

    await conn.commit();

    // 6. Sync Google Sheets (fuera de transacción, si falla no revierte)
    const syncId = idServicio || nuevoId;
    const datosSheets = {
      idServicio: syncId,
      fecha: new Date().toISOString(),
      placa,
      modelo,
      kilometraje: req.body.kilometraje || '',
      cedula,
      cliente: nombre_cliente,
      telefono,
      correo,
      tecnico,
      diagnostico,
      comentarios,
      total_repuestos: calc_total_repuestos,
      total_mano_obra: calc_total_mano_obra,
      gran_total: calc_gran_total,
      estado,
      fecha_salida: estado === 'Cerrado' ? new Date().toISOString() : '',
      detalle: detalle_servicios
    };

    encolarSync(syncSheets, datosSheets, estado);

    const responseId = idServicio || nuevoId;
    res.json({ ok: true, mensaje: 'Servicio guardado correctamente.', idServicio: responseId });
  } catch (e) {
    await conn.rollback();
    console.error('POST /guardar error:', e.message);
    res.status(500).json({ error: 'Error al guardar servicio: ' + e.message });
  } finally {
    conn.release();
  }
});

// POST /api/servicios/cerrar-rapido — cerrar servicio directamente desde panel pendientes
router.post('/cerrar-rapido', auth, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { idServicio } = req.body;
    if (!idServicio) {
      return res.status(400).json({ error: 'idServicio requerido' });
    }

    // Verificar que exista y esté abierto — obtener datos completos para Sheets
    const [existing] = await conn.execute(`
      SELECT
        s.idServicio, s.fecha, s.placa, s.tecnico,
        s.diagnostico, s.detalle_repuestos, s.detalle_servicios,
        s.total_repuestos, s.total_mano_obra, s.gran_total,
        s.estado, s.comentarios, s.fecha_salida,
        v.modelo, v.kilometraje,
        c.nombre AS nombre, c.telefono AS telefono, c.correo AS correo, c.cedula
      FROM servicios s
      LEFT JOIN vehiculos v ON s.placa = v.placa
      LEFT JOIN clientes c ON v.cedula_cliente = c.cedula
      WHERE s.idServicio = ?
    `, [idServicio]);
    if (existing.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Servicio no encontrado' });
    }
    if (existing[0].estado === 'Cerrado') {
      await conn.rollback();
      return res.status(400).json({ error: 'El servicio ya está cerrado' });
    }

    const srvData = existing[0];

    // Cerrar servicio
    await conn.execute(`
      UPDATE servicios SET
        estado = 'Cerrado',
        fecha_salida = NOW(),
        lockedBy = NULL, lockedAt = NULL
      WHERE idServicio = ?
    `, [idServicio]);

    await conn.commit();

    // Obtener detalle_servicios para sync completo (txtRep/txtSrv en Sheets)
    const [detalleRows] = await pool.execute(
      'SELECT tipo, codigo, descripcion, cantidad, precio_unitario, subtotal FROM detalle_servicios WHERE idServicio = ?',
      [idServicio]
    );

    // Sync Google Sheets (fuera de transacción) — con datos completos
    encolarSync(syncSheets, {
      idServicio: srvData.idServicio,
      fecha: srvData.fecha,
      placa: srvData.placa,
      modelo: srvData.modelo || '',
      kilometraje: srvData.kilometraje || '',
      cedula: srvData.cedula || '',
      cliente: srvData.nombre || '',
      telefono: srvData.telefono || '',
      correo: srvData.correo || '',
      tecnico: srvData.tecnico || '',
      diagnostico: srvData.diagnostico || '',
      comentarios: srvData.comentarios || '',
      total_repuestos: srvData.total_repuestos || 0,
      total_mano_obra: srvData.total_mano_obra || 0,
      gran_total: srvData.gran_total || 0,
      estado: 'Cerrado',
      fecha_salida: new Date().toISOString(),
      detalle: detalleRows
    }, 'Cerrado');

    res.json({ ok: true, mensaje: `Servicio ${idServicio} cerrado correctamente.` });
  } catch (e) {
    await conn.rollback();
    console.error('POST /cerrar-rapido error:', e.message);
    res.status(500).json({ error: 'Error al cerrar servicio: ' + e.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
