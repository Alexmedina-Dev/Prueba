require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const pool = require('./db');

const EXCEL_PATH = path.join('C:', 'MotoVerso', 'APP', 'seguimiento de servicios.xlsx');

// Helper: convertir serial de Excel a datetime string MySQL
function excelSerialToDateTime(serial) {
  if (serial === null || serial === undefined || serial === '') return null;
  const num = Number(serial);
  if (isNaN(num)) return null;
  // Excel serial: 1 = 1900-01-01. Formula para epoch: (serial - 25569) * 86400 * 1000
  const d = new Date(Math.round((num - 25569) * 86400 * 1000));
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function excelSerialToDate(serial) {
  if (serial === null || serial === undefined || serial === '') return null;
  const num = Number(serial);
  if (isNaN(num)) return null;
  const d = new Date(Math.round((num - 25569) * 86400 * 1000));
  if (isNaN(d.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function safeString(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

function safeDecimal(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = Number(val);
  return isNaN(num) ? 0 : num;
}

function safeInt(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = parseInt(val);
  return isNaN(num) ? 0 : num;
}

async function importar() {
  console.log('Leyendo Excel...');
  const wb = XLSX.readFile(EXCEL_PATH);

  // Pre-cargar Set de servicios que ya tienen detalles en DB
  const [dbDetRows] = await pool.execute('SELECT DISTINCT idServicio FROM detalle_servicios');
  const serviciosConDetallesDB = new Set(dbDetRows.map(r => r.idServicio));
  console.log('Servicios en DB con detalles:', serviciosConDetallesDB.size);

  // =====================================================================
  // 1. CLIENTES
  // =====================================================================
  const wsClientes = wb.Sheets['Clientes'];
  const clientesRaw = XLSX.utils.sheet_to_json(wsClientes);
  console.log(`Clientes en Excel: ${clientesRaw.length}`);

  let importadosClientes = 0;
  const CHUNK = 100;
  for (let i = 0; i < clientesRaw.length; i += CHUNK) {
    const chunk = clientesRaw.slice(i, i + CHUNK);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const r of chunk) {
        const cedula = safeString(r['Cédula']);
        if (!cedula) continue;
        await conn.execute(
          `INSERT INTO clientes (idServicio, cedula, nombre, telefono, correo)
           VALUES (NULL, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), telefono=VALUES(telefono), correo=VALUES(correo)`,
          [cedula, safeString(r['Nombre']), safeString(r['Teléfono']), safeString(r['Correo'])]
        );
        importadosClientes++;
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    if ((i + chunk.length) % 100 === 0 || i + chunk.length >= clientesRaw.length) {
      console.log(`  Clientes progreso: ${Math.min(i + chunk.length, clientesRaw.length)} / ${clientesRaw.length}`);
    }
  }

  // =====================================================================
  // 2. VEHICULOS
  // =====================================================================
  const wsVehiculos = wb.Sheets['Vehículos'];
  const vehiculosRaw = XLSX.utils.sheet_to_json(wsVehiculos);
  console.log(`Vehículos en Excel: ${vehiculosRaw.length}`);

  let importadosVehiculos = 0;
  for (let i = 0; i < vehiculosRaw.length; i += CHUNK) {
    const chunk = vehiculosRaw.slice(i, i + CHUNK);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const r of chunk) {
        const placa = safeString(r['Placa']);
        if (!placa) continue;
        await conn.execute(
          `INSERT INTO vehiculos (idServicio, placa, cedula_cliente, modelo)
           VALUES (NULL, ?, ?, ?)
           ON DUPLICATE KEY UPDATE cedula_cliente=VALUES(cedula_cliente), modelo=VALUES(modelo)`,
          [placa, safeString(r['Cédula_Cliente']), safeString(r['Marca_Modelo'])]
        );
        importadosVehiculos++;
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    if ((i + chunk.length) % 100 === 0 || i + chunk.length >= vehiculosRaw.length) {
      console.log(`  Vehículos progreso: ${Math.min(i + chunk.length, vehiculosRaw.length)} / ${vehiculosRaw.length}`);
    }
  }

  // =====================================================================
  // 3. SERVICIOS + DETALLE_SERVICIOS (agrupados)
  // =====================================================================
  const wsServicios = wb.Sheets['Servicios'];
  const serviciosRaw = XLSX.utils.sheet_to_json(wsServicios);
  console.log(`Servicios en Excel: ${serviciosRaw.length}`);

  // Leer detalles y agrupar por idServicio
  const wsDetalles = wb.Sheets['Detalle_Servicios'];
  const detallesRaw = XLSX.utils.sheet_to_json(wsDetalles);
  const detallesPorServicio = new Map();
  for (const r of detallesRaw) {
    const idServicio = safeString(r['ID_Servicio']);
    if (!idServicio) continue;
    if (!detallesPorServicio.has(idServicio)) detallesPorServicio.set(idServicio, []);
    detallesPorServicio.get(idServicio).push(r);
  }
  console.log(`Detalles en Excel: ${detallesRaw.length} (agrupados en ${detallesPorServicio.size} servicios)`);

  let importadosServicios = 0;
  let importadosDetalles = 0;
  let detallesOmitidos = 0;

  for (let i = 0; i < serviciosRaw.length; i += CHUNK) {
    const chunk = serviciosRaw.slice(i, i + CHUNK);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const r of chunk) {
        const idServicio = safeString(r[' ']);
        if (!idServicio) continue;

        const estado = safeString(r['Estado']);
        const estadoNormalizado = (estado === 'Abierto' || estado === 'Cerrado') ? estado : 'Cerrado';

        await conn.execute(
          `INSERT INTO servicios (
            idServicio, fecha, placa, tecnico, diagnostico,
            detalle_repuestos, detalle_servicios,
            total_repuestos, total_mano_obra, gran_total,
            estado, comentarios, fecha_salida
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
            fecha=VALUES(fecha), placa=VALUES(placa), tecnico=VALUES(tecnico),
            diagnostico=VALUES(diagnostico), detalle_repuestos=VALUES(detalle_repuestos),
            detalle_servicios=VALUES(detalle_servicios), total_repuestos=VALUES(total_repuestos),
            total_mano_obra=VALUES(total_mano_obra), gran_total=VALUES(gran_total),
            estado=VALUES(estado), comentarios=VALUES(comentarios), fecha_salida=VALUES(fecha_salida)`,
          [
            idServicio,
            excelSerialToDateTime(r['Fecha Ingreso']),
            safeString(r['Placa']),
            safeString(r['ID_Técnico']),
            safeString(r['Diagnóstico']),
            safeString(r['Detalle_Repuestos']),
            safeString(r['Detalle_Servicios']),
            safeDecimal(r['Total_Repuestos']),
            safeDecimal(r['Total_Mano_Obra']),
            safeDecimal(r['Gran_Total']),
            estadoNormalizado,
            safeString(r['Comentarios']),
            excelSerialToDateTime(r['Fecha de Salida'])
          ]
        );
        importadosServicios++;

        // Detalles: solo insertar si este servicio NO tiene detalles previos en DB
        const tieneDetallesPrevios = serviciosConDetallesDB.has(idServicio);
        const detalles = detallesPorServicio.get(idServicio) || [];
        if (tieneDetallesPrevios) {
          detallesOmitidos += detalles.length;
        } else {
          for (const d of detalles) {
            const tipo = safeString(d['Tipo']);
            const tipoNormalizado = (tipo === 'Repuesto' || tipo === 'Mano de Obra' || tipo === 'MO Terceros') ? tipo : 'Repuesto';
            await conn.execute(
              `INSERT INTO detalle_servicios (idServicio, tipo, codigo, descripcion, cantidad, precio_unitario, subtotal)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                idServicio,
                tipoNormalizado,
                safeString(d['Código']),
                safeString(d['Descripción']),
                safeInt(d['Cantidad']),
                safeDecimal(d['Precio_Unitario']),
                safeDecimal(d['Subtotal'])
              ]
            );
            importadosDetalles++;
          }
        }
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    if ((i + chunk.length) % 100 === 0 || i + chunk.length >= serviciosRaw.length) {
      console.log(`  Servicios progreso: ${Math.min(i + chunk.length, serviciosRaw.length)} / ${serviciosRaw.length}`);
    }
  }

  // =====================================================================
  // 4. CIERRES DIARIOS
  // =====================================================================
  const wsCierres = wb.Sheets['Cierres Diarios'];
  const cierresRaw = XLSX.utils.sheet_to_json(wsCierres);
  console.log(`Cierres Diarios en Excel: ${cierresRaw.length}`);

  let importadosCierres = 0;
  for (let i = 0; i < cierresRaw.length; i += CHUNK) {
    const chunk = cierresRaw.slice(i, i + CHUNK);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const r of chunk) {
        const idCierre = safeString(r['ID_Cierre']);
        if (!idCierre) continue;
        await conn.execute(
          `INSERT IGNORE INTO cierres_diarios (idCierre, fecha, tecnico, cantidad_servicios, total_facturado) VALUES (?, ?, ?, ?, ?)`,
          [
            idCierre,
            excelSerialToDate(r['Fecha']),
            safeString(r['ID_Técnico']),
            safeInt(r['Cantidad_Servicios']),
            safeDecimal(r['Total_Facturado'])
          ]
        );
        importadosCierres++;
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    if ((i + chunk.length) % 100 === 0 || i + chunk.length >= cierresRaw.length) {
      console.log(`  Cierres progreso: ${Math.min(i + chunk.length, cierresRaw.length)} / ${cierresRaw.length}`);
    }
  }

  // =====================================================================
  // REPORTE FINAL
  // =====================================================================
  console.log('\n========================================');
  console.log('IMPORTACIÓN COMPLETADA');
  console.log('========================================');
  console.log(`Clientes procesados/insertados:   ${importadosClientes}`);
  console.log(`Vehículos procesados/insertados:  ${importadosVehiculos}`);
  console.log(`Servicios procesados/insertados:  ${importadosServicios}`);
  console.log(`Detalles importados:              ${importadosDetalles}`);
  console.log(`Detalles omitidos (ya en DB):     ${detallesOmitidos}`);
  console.log(`Cierres Diarios importados:       ${importadosCierres}`);
  console.log('========================================\n');

  // Verificación rápida de conteos en DB
  const tables = [
    ['clientes', 'clientes'],
    ['vehiculos', 'vehículos'],
    ['servicios', 'servicios'],
    ['detalle_servicios', 'detalle de servicios'],
    ['cierres_diarios', 'cierres diarios']
  ];
  for (const [table, label] of tables) {
    const [rows] = await pool.execute(`SELECT COUNT(*) as c FROM ${table}`);
    console.log(`Total en tabla ${label}: ${rows[0].c}`);
  }
}

importar()
  .then(() => {
    console.log('Script finalizado correctamente.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error en importación:', err);
    process.exit(1);
  });
