require('dotenv').config();
const fs = require('fs');
const XLSX = require('xlsx');
const { google } = require('googleapis');
const pool = require('./db');

// ── Configuración ─────────────────────────────────────────────────────────────

const EXCEL_BASE = 'C:/Users/alexa/Downloads/Copia de seguimiento de servicios (2).xlsx';
const EXCEL_NUEVOS = 'C:/MotoVerso/APP/seguimiento de servicios.xlsx';
const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';

const BATCH_SIZE = 500;
const REQUEST_INTERVAL_MS = 250;
const MYSQL_BATCH_SIZE = 100;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let lastRequestTime = 0;
async function rateLimitedRequest(fn) {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < REQUEST_INTERVAL_MS) {
    await sleep(REQUEST_INTERVAL_MS - elapsed);
  }
  try {
    const result = await fn();
    lastRequestTime = Date.now();
    return result;
  } catch (err) {
    lastRequestTime = Date.now();
    throw err;
  }
}

function safeString(val) {
  if (val === null || val === undefined) return '';
  const s = String(val).trim();
  return s;
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

function excelSerialToDateTime(serial) {
  if (serial === null || serial === undefined || serial === '') return null;
  const num = Number(serial);
  if (isNaN(num)) return null;
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

function formatFechaColombia(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  let str = d.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return str.replace(/,/g, '');
}

function formatFechaCierre(dateVal) {
  if (!dateVal) return '';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return String(dateVal);
  return d.toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

function looksLikeJSON(str) {
  const s = String(str).trim();
  return s.startsWith('[{') || s.startsWith('{"') || s.startsWith('[');
}

function formatRepuestosField(value) {
  if (!value || String(value).trim() === '') return '';
  const str = String(value).trim();
  if (!looksLikeJSON(str)) return str;
  try {
    const arr = JSON.parse(str);
    if (!Array.isArray(arr)) return str;
    return arr.map(item => {
      const precio = Number(item.precio_unitario || item.total || 0).toLocaleString('es-CO');
      const prefijo = item.codigo ? `${item.codigo} - ` : '';
      const desc = (item.descripcion && item.descripcion.trim()) ? item.descripcion.trim() : '';
      return `[${item.cantidad || 1}] ${prefijo}${desc} ($${precio})`;
    }).join('\n');
  } catch {
    return str;
  }
}

function formatServiciosField(value) {
  if (!value || String(value).trim() === '') return '';
  const str = String(value).trim();
  if (!looksLikeJSON(str)) return str;
  try {
    const arr = JSON.parse(str);
    if (!Array.isArray(arr)) return str;
    const moItems = arr.filter(item => item.tipo === 'Mano de Obra' || item.tipo === 'MO Terceros');
    return moItems.map(item => {
      const precio = Number(item.precio_unitario || item.total || 0).toLocaleString('es-CO');
      const prefijo = item.codigo ? `${item.codigo} - ` : '';
      const desc = (item.descripcion && item.descripcion.trim()) ? item.descripcion.trim() : item.tipo;
      const tercero = item.tipo === 'MO Terceros' ? '(TERCERO) ' : '';
      return `[${item.cantidad || 1}] ${tercero}${prefijo}${desc} ($${precio})`;
    }).join('\n');
  } catch {
    return str;
  }
}

// ── Lectura de Excel ──────────────────────────────────────────────────────────

function leerHoja(filePath, sheetName, headers) {
  console.log(`  Leyendo ${sheetName} de ${filePath}...`);
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.warn(`  ⚠️ Hoja ${sheetName} no encontrada en ${filePath}`);
    return [];
  }
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
  if (data.length === 0) return [];
  const headerRow = data[0];
  const rows = data.slice(1);
  console.log(`  ✅ ${sheetName}: ${rows.length} filas (header: ${JSON.stringify(headerRow)})`);
  return { header: headerRow, rows };
}

// ── Fusión de datos ───────────────────────────────────────────────────────────

async function fusionarDatos() {
  console.log('\n========================================');
  console.log('📖 PASO 1: Leyendo Excels');
  console.log('========================================');

  // Leer Excel base (Downloads)
  const baseClientes = leerHoja(EXCEL_BASE, 'Clientes');
  const baseVehiculos = leerHoja(EXCEL_BASE, 'Vehículos');
  const baseServicios = leerHoja(EXCEL_BASE, 'Servicios');
  const baseDetalle = leerHoja(EXCEL_BASE, 'Detalle_Servicios');
  const baseCierres = leerHoja(EXCEL_BASE, 'Cierres Diarios');

  // Leer Excel nuevos (APP)
  const nuevosClientes = leerHoja(EXCEL_NUEVOS, 'Clientes');
  const nuevosVehiculos = leerHoja(EXCEL_NUEVOS, 'Vehículos');
  const nuevosServicios = leerHoja(EXCEL_NUEVOS, 'Servicios');
  const nuevosDetalle = leerHoja(EXCEL_NUEVOS, 'Detalle_Servicios');
  const nuevosCierres = leerHoja(EXCEL_NUEVOS, 'Cierres Diarios');

  console.log('\n========================================');
  console.log('🔍 PASO 2: Identificando datos nuevos y fusionando');
  console.log('========================================');

  // ── Servicios ──
  const serviciosMap = new Map(); // idServicio -> { source: 'base'|'nuevos', row: [] }
  for (const row of baseServicios.rows) {
    const id = safeString(row[0]);
    if (id) serviciosMap.set(id, { source: 'base', row });
  }
  let serviciosNuevosCount = 0;
  for (const row of nuevosServicios.rows) {
    const id = safeString(row[0]);
    if (!id) continue;
    if (!serviciosMap.has(id)) {
      serviciosMap.set(id, { source: 'nuevos', row });
      serviciosNuevosCount++;
    }
  }
  console.log(`✅ Servicios fusionados: ${serviciosMap.size} total (${baseServicios.rows.length} base + ${serviciosNuevosCount} nuevos)`);

  // ── Clientes ──
  // Base: [ID_Servicio, Cédula, Nombre, Teléfono, Correo]
  // Nuevos: [Cédula, Nombre, Teléfono, Correo]
  const clientesMap = new Map(); // cédula -> { source, row, idServicio }
  for (const row of baseClientes.rows) {
    const cedula = safeString(row[1]);
    if (cedula) clientesMap.set(cedula, { source: 'base', row, idServicio: safeString(row[0]) });
  }
  let clientesNuevosCount = 0;
  for (const row of nuevosClientes.rows) {
    const cedula = safeString(row[0]);
    if (!cedula) continue;
    if (!clientesMap.has(cedula)) {
      clientesMap.set(cedula, { source: 'nuevos', row, idServicio: '' });
      clientesNuevosCount++;
    }
  }
  console.log(`✅ Clientes fusionados: ${clientesMap.size} total (${baseClientes.rows.length} base + ${clientesNuevosCount} nuevos)`);

  // ── Vehículos ──
  // Base: [ID_Servicio, Placa, Cédula_Cliente, Marca_Modelo]
  // Nuevos: [Placa, Cédula_Cliente, Marca_Modelo]
  const vehiculosMap = new Map(); // placa -> { source, row, idServicio }
  for (const row of baseVehiculos.rows) {
    const placa = safeString(row[1]).toUpperCase();
    if (placa) vehiculosMap.set(placa, { source: 'base', row, idServicio: safeString(row[0]) });
  }
  let vehiculosNuevosCount = 0;
  for (const row of nuevosVehiculos.rows) {
    const placa = safeString(row[0]).toUpperCase();
    if (!placa) continue;
    if (!vehiculosMap.has(placa)) {
      vehiculosMap.set(placa, { source: 'nuevos', row, idServicio: '' });
      vehiculosNuevosCount++;
    }
  }
  console.log(`✅ Vehículos fusionados: ${vehiculosMap.size} total (${baseVehiculos.rows.length} base + ${vehiculosNuevosCount} nuevos)`);

  // ── Cierres ──
  const cierresMap = new Map(); // idCierre -> { source, row }
  for (const row of baseCierres.rows) {
    const id = safeString(row[0]);
    if (id) cierresMap.set(id, { source: 'base', row });
  }
  let cierresNuevosCount = 0;
  for (const row of nuevosCierres.rows) {
    const id = safeString(row[0]);
    if (!id) continue;
    if (!cierresMap.has(id)) {
      cierresMap.set(id, { source: 'nuevos', row });
      cierresNuevosCount++;
    }
  }
  console.log(`✅ Cierres fusionados: ${cierresMap.size} total (${baseCierres.rows.length} base + ${cierresNuevosCount} nuevos)`);

  // ── Detalle_Servicios ──
  // Agrupar por idServicio. Si el servicio está en base, usar detalles de base.
  // Si no, usar detalles de nuevos.
  const detalleBaseMap = new Map();
  for (const row of baseDetalle.rows) {
    const id = safeString(row[0]);
    if (!id) continue;
    if (!detalleBaseMap.has(id)) detalleBaseMap.set(id, []);
    detalleBaseMap.get(id).push(row);
  }
  const detalleNuevosMap = new Map();
  for (const row of nuevosDetalle.rows) {
    const id = safeString(row[0]);
    if (!id) continue;
    if (!detalleNuevosMap.has(id)) detalleNuevosMap.set(id, []);
    detalleNuevosMap.get(id).push(row);
  }

  const detalleFusionado = [];
  let detallesBase = 0;
  let detallesNuevos = 0;
  for (const [idServicio, info] of serviciosMap) {
    if (info.source === 'base' && detalleBaseMap.has(idServicio)) {
      for (const row of detalleBaseMap.get(idServicio)) {
        detalleFusionado.push({ idServicio, row });
      }
      detallesBase += detalleBaseMap.get(idServicio).length;
    } else if (info.source === 'nuevos' && detalleNuevosMap.has(idServicio)) {
      for (const row of detalleNuevosMap.get(idServicio)) {
        detalleFusionado.push({ idServicio, row });
      }
      detallesNuevos += detalleNuevosMap.get(idServicio).length;
    }
  }
  console.log(`✅ Detalle fusionado: ${detalleFusionado.length} total (${detallesBase} base + ${detallesNuevos} nuevos)`);

  // ── Asociar ID_Servicio a clientes/vehículos nuevos según servicios ──
  // Para cada servicio nuevo, buscar placa en vehículos nuevos, luego cédula en clientes nuevos.
  // Asignar el ID_Servicio del servicio al cliente/vehículo correspondiente (solo si no tienen ya uno).
  for (const [idServicio, info] of serviciosMap) {
    if (info.source !== 'nuevos') continue;
    const placa = safeString(info.row[2]).toUpperCase();
    if (placa && vehiculosMap.has(placa) && vehiculosMap.get(placa).source === 'nuevos') {
      const veh = vehiculosMap.get(placa);
      if (!veh.idServicio) veh.idServicio = idServicio;
      const cedula = safeString(veh.row[1] || veh.row[0]); // En nuevos: row[0]=placa, row[1]=cedula
      if (cedula && clientesMap.has(cedula) && clientesMap.get(cedula).source === 'nuevos') {
        const cli = clientesMap.get(cedula);
        if (!cli.idServicio) cli.idServicio = idServicio;
      }
    }
  }

  return {
    servicios: serviciosMap,
    clientes: clientesMap,
    vehiculos: vehiculosMap,
    cierres: cierresMap,
    detalle: detalleFusionado,
    stats: {
      serviciosNuevos: serviciosNuevosCount,
      clientesNuevos: clientesNuevosCount,
      vehiculosNuevos: vehiculosNuevosCount,
      cierresNuevos: cierresNuevosCount,
      detallesBase,
      detallesNuevos
    }
  };
}

// ── Google Sheets ─────────────────────────────────────────────────────────────

async function exportarAGoogleSheets(dataFusion) {
  console.log('\n========================================');
  console.log('📤 PASO 3: Exportando a Google Sheets');
  console.log('========================================');

  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  // Obtener hojas existentes
  const ssInfo = await rateLimitedRequest(() =>
    sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
  );
  const existingSheets = new Map(
    ssInfo.data.sheets.map(s => [s.properties.title, s.properties.sheetId])
  );
  console.log('Hojas existentes:', Array.from(existingSheets.keys()).join(', '));

  // Asegurar que existan las hojas necesarias
  const requiredSheets = ['Clientes', 'Vehículos', 'Servicios', 'Detalle_Servicios', 'Cierres Diarios', 'GENERAR FACTURA'];
  for (const name of requiredSheets) {
    if (!existingSheets.has(name)) {
      await rateLimitedRequest(() =>
        sheets.spreadsheets.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            requests: [{
              addSheet: {
                properties: {
                  title: name,
                  gridProperties: { rowCount: 50000, columnCount: 26 }
                }
              }
            }]
          }
        })
      );
      console.log(`✅ Hoja creada: ${name}`);
      existingSheets.set(name, true);
    }
  }

  // Helper para limpiar y escribir
  async function writeSheet(title, header, rows) {
    console.log(`\n📤 Exportando ${title} (${rows.length} registros)...`);

    // 1. Limpiar
    await rateLimitedRequest(() =>
      sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${title}!A1:Z50000`
      })
    );

    // 2. Escribir header
    await rateLimitedRequest(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${title}!A1`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [header] }
      })
    );

    // 3. Escribir datos por lotes
    const total = rows.length;
    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const startRow = i + 2;
      await rateLimitedRequest(() =>
        sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: `${title}!A${startRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: batch }
        })
      );
      console.log(`  ${title}: ${Math.min(i + batch.length, total)} / ${total}`);
    }
    console.log(`✅ ${title} completado: ${total} registros escritos`);
  }

  // ── Clientes ──
  const clientesRows = [];
  for (const [cedula, info] of dataFusion.clientes) {
    const row = info.row;
    if (info.source === 'base') {
      clientesRows.push([
        info.idServicio,
        cedula,
        safeString(row[2]),
        safeString(row[3]),
        safeString(row[4])
      ]);
    } else {
      clientesRows.push([
        info.idServicio,
        cedula,
        safeString(row[1]),
        safeString(row[2]),
        safeString(row[3])
      ]);
    }
  }
  await writeSheet('Clientes', ['ID_Servicio', 'Cédula', 'Nombre', 'Teléfono', 'Correo'], clientesRows);

  // ── Vehículos ──
  const vehiculosRows = [];
  for (const [placa, info] of dataFusion.vehiculos) {
    const row = info.row;
    if (info.source === 'base') {
      vehiculosRows.push([
        info.idServicio,
        placa,
        safeString(row[2]),
        safeString(row[3])
      ]);
    } else {
      vehiculosRows.push([
        info.idServicio,
        placa,
        safeString(row[1]),
        safeString(row[2])
      ]);
    }
  }
  await writeSheet('Vehículos', ['ID_Servicio', 'Placa', 'Cédula_Cliente', 'Marca_Modelo'], vehiculosRows);

  // ── Servicios ──
  const serviciosRows = [];
  for (const [idServicio, info] of dataFusion.servicios) {
    const row = info.row;
    const fechaRaw = row[1];
    const fecha = excelSerialToDateTime(fechaRaw) || fechaRaw;
    const fechaSalidaRaw = row[12];
    const fechaSalida = excelSerialToDateTime(fechaSalidaRaw) || fechaSalidaRaw;
    const estado = safeString(row[10]);
    const estadoNormalizado = (estado === 'Abierto' || estado === 'Cerrado') ? estado : 'Cerrado';

    serviciosRows.push([
      idServicio,
      formatFechaColombia(fecha),
      safeString(row[2]).toUpperCase(),
      safeString(row[3]),
      safeString(row[4]),
      formatRepuestosField(row[5]),
      formatServiciosField(row[6]),
      safeDecimal(row[7]),
      safeDecimal(row[8]),
      safeDecimal(row[9]),
      estadoNormalizado,
      safeString(row[11]),
      formatFechaColombia(fechaSalida),
      safeDecimal(row[13])
    ]);
  }
  // Ordenar por fecha
  serviciosRows.sort((a, b) => {
    const d1 = new Date(a[1].split(' ')[0].split('/').reverse().join('-'));
    const d2 = new Date(b[1].split(' ')[0].split('/').reverse().join('-'));
    return d1 - d2;
  });
  await writeSheet('Servicios', [
    'ID_Servicio', 'Fecha_Ingreso', 'Placa', 'ID_Técnico', 'Diagnóstico',
    'Detalle_Repuestos', 'Detalle_Servicios',
    'Total_Repuestos', 'Total_Mano_Obra', 'Gran_Total', 'Estado',
    'Comentarios', 'Fecha de Salida', 'Total Terceros'
  ], serviciosRows);

  // ── Detalle_Servicios ──
  const detalleRows = dataFusion.detalle.map(d => {
    const row = d.row;
    return [
      d.idServicio,
      safeString(row[1]),
      safeString(row[2]),
      safeString(row[3]),
      safeInt(row[4]),
      safeDecimal(row[5]),
      safeDecimal(row[6])
    ];
  });
  await writeSheet('Detalle_Servicios', [
    'ID_Servicio', 'Tipo', 'Código', 'Descripción', 'Cantidad', 'Precio_Unitario', 'Subtotal'
  ], detalleRows);

  // ── Cierres Diarios ──
  const cierresRows = [];
  for (const [idCierre, info] of dataFusion.cierres) {
    const row = info.row;
    const fechaRaw = row[1];
    const fecha = excelSerialToDate(fechaRaw) || fechaRaw;
    cierresRows.push([
      idCierre,
      formatFechaCierre(fecha),
      safeString(row[2]),
      safeInt(row[3]),
      safeDecimal(row[4])
    ]);
  }
  await writeSheet('Cierres Diarios', [
    'ID_Cierre', 'Fecha', 'ID_Técnico', 'Cantidad_Servicios', 'Total_Facturado'
  ], cierresRows);

  // ── GENERAR FACTURA ──
  // Crear fórmulas básicas o mantener la estructura
  await writeSheet('GENERAR FACTURA', ['MOTOVERSO'], []);

  // ── Verificación ──
  console.log('\n========================================');
  console.log('✅ EXPORTACIÓN A GOOGLE SHEETS COMPLETADA');
  console.log('========================================');

  const verificationRanges = [
    ['Clientes', 'Clientes!A2:E'],
    ['Vehículos', 'Vehículos!A2:D'],
    ['Servicios', 'Servicios!A2:N'],
    ['Detalle_Servicios', 'Detalle_Servicios!A2:G'],
    ['Cierres Diarios', 'Cierres Diarios!A2:E']
  ];

  for (const [name, range] of verificationRanges) {
    const res = await rateLimitedRequest(() =>
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range })
    );
    const count = (res.data.values || []).length;
    console.log(`${name}: ${count} registros en Google Sheets`);
  }
}

// ── MySQL ─────────────────────────────────────────────────────────────────────

async function actualizarMySQL(dataFusion) {
  console.log('\n========================================');
  console.log('🗄️ PASO 4: Actualizando MySQL');
  console.log('========================================');

  // ── Clientes ──
  console.log('\n📋 Actualizando Clientes...');
  let clientesInsertados = 0;
  let clientesActualizados = 0;
  let clientesErrores = 0;
  const clientesArray = Array.from(dataFusion.clientes.entries());

  for (let i = 0; i < clientesArray.length; i += MYSQL_BATCH_SIZE) {
    const batch = clientesArray.slice(i, i + MYSQL_BATCH_SIZE);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [cedula, info] of batch) {
        const row = info.row;
        let nombre, telefono, correo;
        if (info.source === 'base') {
          nombre = safeString(row[2]);
          telefono = safeString(row[3]);
          correo = safeString(row[4]);
        } else {
          nombre = safeString(row[1]);
          telefono = safeString(row[2]);
          correo = safeString(row[3]);
        }
        try {
          const [result] = await conn.execute(
            `INSERT INTO clientes (idServicio, cedula, nombre, telefono, correo)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               idServicio=VALUES(idServicio),
               nombre=VALUES(nombre),
               telefono=VALUES(telefono),
               correo=VALUES(correo)`,
            [info.idServicio || null, cedula, nombre, telefono, correo]
          );
          if (result.affectedRows === 1) clientesInsertados++;
          else if (result.changedRows > 0) clientesActualizados++;
        } catch (e) {
          clientesErrores++;
          if (clientesErrores <= 5) console.error(`  Error cliente ${cedula}:`, e.message);
        }
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    if ((i + batch.length) % 500 === 0 || i + batch.length >= clientesArray.length) {
      console.log(`  Progreso: ${Math.min(i + batch.length, clientesArray.length)} / ${clientesArray.length}`);
    }
  }
  console.log(`✅ Clientes: ${clientesInsertados} insertados, ${clientesActualizados} actualizados${clientesErrores > 0 ? `, ${clientesErrores} errores` : ''}`);

  // ── Vehículos ──
  console.log('\n🚗 Actualizando Vehículos...');
  let vehiculosInsertados = 0;
  let vehiculosActualizados = 0;
  let vehiculosErrores = 0;
  const vehiculosArray = Array.from(dataFusion.vehiculos.entries());

  for (let i = 0; i < vehiculosArray.length; i += MYSQL_BATCH_SIZE) {
    const batch = vehiculosArray.slice(i, i + MYSQL_BATCH_SIZE);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [placa, info] of batch) {
        const row = info.row;
        let cedulaCliente, modelo;
        if (info.source === 'base') {
          cedulaCliente = safeString(row[2]);
          modelo = safeString(row[3]);
        } else {
          cedulaCliente = safeString(row[1]);
          modelo = safeString(row[2]);
        }
        try {
          const [result] = await conn.execute(
            `INSERT INTO vehiculos (idServicio, placa, cedula_cliente, modelo)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               idServicio=VALUES(idServicio),
               cedula_cliente=VALUES(cedula_cliente),
               modelo=VALUES(modelo)`,
            [info.idServicio || null, placa, cedulaCliente, modelo]
          );
          if (result.affectedRows === 1) vehiculosInsertados++;
          else if (result.changedRows > 0) vehiculosActualizados++;
        } catch (e) {
          vehiculosErrores++;
          if (vehiculosErrores <= 5) console.error(`  Error vehículo ${placa}:`, e.message);
        }
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    if ((i + batch.length) % 500 === 0 || i + batch.length >= vehiculosArray.length) {
      console.log(`  Progreso: ${Math.min(i + batch.length, vehiculosArray.length)} / ${vehiculosArray.length}`);
    }
  }
  console.log(`✅ Vehículos: ${vehiculosInsertados} insertados, ${vehiculosActualizados} actualizados${vehiculosErrores > 0 ? `, ${vehiculosErrores} errores` : ''}`);

  // ── Servicios ──
  console.log('\n🔧 Actualizando Servicios...');
  let serviciosInsertados = 0;
  let serviciosActualizados = 0;
  let serviciosErrores = 0;
  const serviciosArray = Array.from(dataFusion.servicios.entries());

  for (let i = 0; i < serviciosArray.length; i += MYSQL_BATCH_SIZE) {
    const batch = serviciosArray.slice(i, i + MYSQL_BATCH_SIZE);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [idServicio, info] of batch) {
        const row = info.row;
        const fecha = excelSerialToDateTime(row[1]) || null;
        const placa = safeString(row[2]).toUpperCase();
        const tecnico = safeString(row[3]);
        const diagnostico = safeString(row[4]);
        const detalleRepuestos = safeString(row[5]);
        const detalleServicios = safeString(row[6]);
        const totalRepuestos = safeDecimal(row[7]);
        const totalManoObra = safeDecimal(row[8]);
        const granTotal = safeDecimal(row[9]);
        const estadoRaw = safeString(row[10]);
        const estado = (estadoRaw === 'Abierto' || estadoRaw === 'Cerrado') ? estadoRaw : 'Cerrado';
        const comentarios = safeString(row[11]);
        const fechaSalida = excelSerialToDateTime(row[12]) || null;

        try {
          const [result] = await conn.execute(
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
              idServicio, fecha, placa, tecnico, diagnostico,
              detalleRepuestos, detalleServicios,
              totalRepuestos, totalManoObra, granTotal,
              estado, comentarios, fechaSalida
            ]
          );
          if (result.affectedRows === 1) serviciosInsertados++;
          else if (result.changedRows > 0) serviciosActualizados++;
        } catch (e) {
          serviciosErrores++;
          if (serviciosErrores <= 5) console.error(`  Error servicio ${idServicio}:`, e.message);
        }
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    if ((i + batch.length) % 500 === 0 || i + batch.length >= serviciosArray.length) {
      console.log(`  Progreso: ${Math.min(i + batch.length, serviciosArray.length)} / ${serviciosArray.length}`);
    }
  }
  console.log(`✅ Servicios: ${serviciosInsertados} insertados, ${serviciosActualizados} actualizados${serviciosErrores > 0 ? `, ${serviciosErrores} errores` : ''}`);

  // ── Detalle_Servicios ──
  console.log('\n📦 Actualizando Detalle de Servicios...');
  // Estrategia: DELETE + INSERT por servicio para garantizar consistencia
  let detalleInsertados = 0;
  let detalleErrores = 0;

  // Agrupar por idServicio
  const detallePorServicio = new Map();
  for (const d of dataFusion.detalle) {
    if (!detallePorServicio.has(d.idServicio)) detallePorServicio.set(d.idServicio, []);
    detallePorServicio.get(d.idServicio).push(d.row);
  }
  const serviceIds = Array.from(detallePorServicio.keys());

  for (let i = 0; i < serviceIds.length; i += MYSQL_BATCH_SIZE) {
    const batchIds = serviceIds.slice(i, i + MYSQL_BATCH_SIZE);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const idServicio of batchIds) {
        try {
          await conn.execute('DELETE FROM detalle_servicios WHERE idServicio = ?', [idServicio]);
          const items = detallePorServicio.get(idServicio);
          for (const row of items) {
            const tipoRaw = safeString(row[1]);
            const tipo = (tipoRaw === 'Repuesto' || tipoRaw === 'Mano de Obra' || tipoRaw === 'MO Terceros') ? tipoRaw : 'Repuesto';
            await conn.execute(
              `INSERT INTO detalle_servicios (idServicio, tipo, codigo, descripcion, cantidad, precio_unitario, subtotal)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [idServicio, tipo, safeString(row[2]), safeString(row[3]), safeInt(row[4]), safeDecimal(row[5]), safeDecimal(row[6])]
            );
            detalleInsertados++;
          }
        } catch (e) {
          detalleErrores++;
          if (detalleErrores <= 5) console.error(`  Error detalle ${idServicio}:`, e.message);
        }
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    if ((i + batchIds.length) % 500 === 0 || i + batchIds.length >= serviceIds.length) {
      console.log(`  Progreso: ${Math.min(i + batchIds.length, serviceIds.length)} servicios procesados`);
    }
  }
  console.log(`✅ Detalle: ${detalleInsertados} registros insertados${detalleErrores > 0 ? `, ${detalleErrores} errores` : ''}`);

  // ── Cierres Diarios ──
  console.log('\n📅 Actualizando Cierres Diarios...');
  let cierresInsertados = 0;
  let cierresActualizados = 0;
  let cierresErrores = 0;
  const cierresArray = Array.from(dataFusion.cierres.entries());

  for (let i = 0; i < cierresArray.length; i += MYSQL_BATCH_SIZE) {
    const batch = cierresArray.slice(i, i + MYSQL_BATCH_SIZE);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [idCierre, info] of batch) {
        const row = info.row;
        const fecha = excelSerialToDate(row[1]) || null;
        const tecnico = safeString(row[2]);
        const cantidad = safeInt(row[3]);
        const total = safeDecimal(row[4]);
        try {
          const [result] = await conn.execute(
            `INSERT INTO cierres_diarios (idCierre, fecha, tecnico, cantidad_servicios, total_facturado)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               fecha=VALUES(fecha), tecnico=VALUES(tecnico),
               cantidad_servicios=VALUES(cantidad_servicios), total_facturado=VALUES(total_facturado)`,
            [idCierre, fecha, tecnico, cantidad, total]
          );
          if (result.affectedRows === 1) cierresInsertados++;
          else if (result.changedRows > 0) cierresActualizados++;
        } catch (e) {
          cierresErrores++;
          if (cierresErrores <= 5) console.error(`  Error cierre ${idCierre}:`, e.message);
        }
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    if ((i + batch.length) % 100 === 0 || i + batch.length >= cierresArray.length) {
      console.log(`  Progreso: ${Math.min(i + batch.length, cierresArray.length)} / ${cierresArray.length}`);
    }
  }
  console.log(`✅ Cierres: ${cierresInsertados} insertados, ${cierresActualizados} actualizados${cierresErrores > 0 ? `, ${cierresErrores} errores` : ''}`);

  // ── Verificación final de conteos ──
  console.log('\n========================================');
  console.log('📊 VERIFICACIÓN MYSQL FINAL');
  console.log('========================================');
  const tables = [
    ['clientes', 'Clientes'],
    ['vehiculos', 'Vehículos'],
    ['servicios', 'Servicios'],
    ['detalle_servicios', 'Detalle Servicios'],
    ['cierres_diarios', 'Cierres Diarios']
  ];
  for (const [table, label] of tables) {
    const [rows] = await pool.execute(`SELECT COUNT(*) as c FROM ${table}`);
    console.log(`${label}: ${rows[0].c}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('========================================');
  console.log('🚀 FUSIÓN DE EXCELS + GOOGLE SHEETS + MYSQL');
  console.log('========================================');
  console.log('Excel Base:', EXCEL_BASE);
  console.log('Excel Nuevos:', EXCEL_NUEVOS);
  console.log('');

  try {
    const dataFusion = await fusionarDatos();

    console.log('\n📈 Estadísticas de fusión:');
    console.log(`  Servicios nuevos: ${dataFusion.stats.serviciosNuevos}`);
    console.log(`  Clientes nuevos: ${dataFusion.stats.clientesNuevos}`);
    console.log(`  Vehículos nuevos: ${dataFusion.stats.vehiculosNuevos}`);
    console.log(`  Cierres nuevos: ${dataFusion.stats.cierresNuevos}`);
    console.log(`  Detalles base: ${dataFusion.stats.detallesBase}`);
    console.log(`  Detalles nuevos: ${dataFusion.stats.detallesNuevos}`);

    await exportarAGoogleSheets(dataFusion);
    await actualizarMySQL(dataFusion);

    console.log('\n========================================');
    console.log('🎉 FUSIÓN COMPLETADA EXITOSAMENTE');
    console.log('========================================');
    console.log('\nResumen:');
    console.log(`  - Servicios fusionados: ${dataFusion.servicios.size}`);
    console.log(`  - Clientes fusionados: ${dataFusion.clientes.size}`);
    console.log(`  - Vehículos fusionados: ${dataFusion.vehiculos.size}`);
    console.log(`  - Detalles fusionados: ${dataFusion.detalle.length}`);
    console.log(`  - Cierres fusionados: ${dataFusion.cierres.size}`);
    console.log('\nVerifique la app en http://localhost:3000');

    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ERROR FATAL:', err.message);
    console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
