require('dotenv').config();
const { google } = require('googleapis');
const pool = require('./db');

const SPREADSHEET_ID = '1AnfdoRTW_BG5ZHAqjMsdKCXjPsr0lHQREPwMLIQZ-7Q';
const BATCH_SIZE = 500;
const REQUEST_INTERVAL_MS = 250; // ~400 req/100s, safe under 500 limit

// ── Helpers ──

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
  // Remove comma to get "DD/MM/YYYY HH:mm:ss"
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

function toNum(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

// ── Sheet helpers ──

const REQUIRED_ROWS = 50000;
const REQUIRED_COLS = 26;

async function ensureSheet(sheets, title, existingSheets) {
  const sheetId = existingSheets.get(title);
  if (!sheetId) {
    // Crear nueva hoja con suficiente espacio
    await rateLimitedRequest(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: [{
            addSheet: {
              properties: {
                title,
                gridProperties: { rowCount: REQUIRED_ROWS, columnCount: REQUIRED_COLS }
              }
            }
          }]
        }
      })
    );
    console.log(`✅ Hoja creada: ${title} (${REQUIRED_ROWS} filas)`);
    existingSheets.set(title, true);
  } else {
    // Extender hoja existente si tiene pocas filas
    const ssInfo = await rateLimitedRequest(() =>
      sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
    );
    const sheet = ssInfo.data.sheets.find(s => s.properties.title === title);
    if (sheet && sheet.properties.gridProperties) {
      const { rowCount, columnCount } = sheet.properties.gridProperties;
      if (rowCount < REQUIRED_ROWS || columnCount < REQUIRED_COLS) {
        await rateLimitedRequest(() =>
          sheets.spreadsheets.batchUpdate({
            spreadsheetId: SPREADSHEET_ID,
            requestBody: {
              requests: [{
                updateSheetProperties: {
                  properties: {
                    sheetId: sheet.properties.sheetId,
                    gridProperties: {
                      rowCount: Math.max(rowCount, REQUIRED_ROWS),
                      columnCount: Math.max(columnCount, REQUIRED_COLS)
                    }
                  },
                  fields: 'gridProperties.rowCount,gridProperties.columnCount'
                }
              }]
            }
          })
        );
        console.log(`📏 Hoja extendida: ${title} → ${Math.max(rowCount, REQUIRED_ROWS)} filas`);
      }
    }
  }
}

async function writeSheet(sheets, title, header, rows) {
  console.log(`\n📤 Exportando ${title} (${rows.length} registros)...`);

  // 1. Clear existing data
  await rateLimitedRequest(() =>
    sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1:Z50000`
    })
  );

  // 2. Write header
  await rateLimitedRequest(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${title}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [header] }
    })
  );

  // 3. Write data in batches
  const total = rows.length;
  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const startRow = i + 2; // header is row 1
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

// ── Main ──

async function main() {
  console.log('========================================');
  console.log('🚀 EXPORTAR DATOS HISTORICOS A GOOGLE SHEETS');
  console.log('========================================\n');

  // Auth
  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  const sheets = google.sheets({ version: 'v4', auth });

  // Get existing sheets
  const ssInfo = await rateLimitedRequest(() =>
    sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID })
  );
  const existingSheets = new Map(
    ssInfo.data.sheets.map(s => [s.properties.title, s.properties.sheetId])
  );
  console.log('Hojas existentes:', Array.from(existingSheets.keys()).join(', '));

  // Ensure required sheets exist
  const requiredSheets = ['Clientes', 'Vehículos', 'Servicios', 'Detalle_Servicios', 'Cierres Diarios'];
  for (const name of requiredSheets) {
    await ensureSheet(sheets, name, existingSheets);
  }

  // ── 1. CLIENTES ──
  const [clientesRows] = await pool.execute(
    'SELECT idServicio, cedula, nombre, telefono, correo FROM clientes ORDER BY idServicio'
  );
  const clientesData = clientesRows.map(r => [
    r.idServicio || '',
    r.cedula || '',
    r.nombre || '',
    r.telefono || '',
    r.correo || ''
  ]);
  await writeSheet(sheets, 'Clientes', ['ID_Servicio', 'Cédula', 'Nombre', 'Teléfono', 'Correo'], clientesData);

  // ── 2. VEHICULOS ──
  const [vehiculosRows] = await pool.execute(
    'SELECT idServicio, placa, cedula_cliente, modelo, kilometraje FROM vehiculos ORDER BY idServicio'
  );
  const vehiculosData = vehiculosRows.map(r => [
    r.idServicio || '',
    r.placa ? r.placa.toUpperCase() : '',
    r.cedula_cliente || '',
    r.modelo || '',
    r.kilometraje || ''
  ]);
  await writeSheet(sheets, 'Vehículos', ['ID_Servicio', 'Placa', 'Cédula_Cliente', 'Marca_Modelo', 'Kilometraje'], vehiculosData);

  // ── 3. SERVICIOS ──
  const [serviciosRows] = await pool.execute(
    `SELECT idServicio, fecha, placa, tecnico, detalle_repuestos, detalle_servicios,
            total_repuestos, total_mano_obra, gran_total, estado
     FROM servicios ORDER BY fecha`
  );
  const serviciosData = serviciosRows.map(r => [
    r.idServicio || '',
    formatFechaColombia(r.fecha),
    r.placa || '',
    r.tecnico || '',
    formatRepuestosField(r.detalle_repuestos),
    formatServiciosField(r.detalle_servicios),
    toNum(r.total_repuestos),
    toNum(r.total_mano_obra),
    toNum(r.gran_total),
    r.estado || ''
  ]);
  await writeSheet(sheets, 'Servicios', [
    'ID_Servicio', 'Fecha_Ingreso', 'Placa', 'ID_Técnico',
    'Detalle_Repuestos', 'Detalle_Servicios',
    'Total_Repuestos', 'Total_Mano_Obra', 'Gran_Total', 'Estado'
  ], serviciosData);

  // ── 4. DETALLE_SERVICIOS ──
  const [detalleRows] = await pool.execute(
    `SELECT idServicio, tipo, codigo, descripcion, cantidad, precio_unitario, subtotal
     FROM detalle_servicios ORDER BY idServicio`
  );
  const detalleData = detalleRows.map(r => [
    r.idServicio || '',
    r.tipo || '',
    r.codigo || '',
    r.descripcion || '',
    r.cantidad || 0,
    toNum(r.precio_unitario),
    toNum(r.subtotal)
  ]);
  await writeSheet(sheets, 'Detalle_Servicios', [
    'ID_Servicio', 'Tipo', 'Código', 'Descripción', 'Cantidad', 'Precio_Unitario', 'Subtotal'
  ], detalleData);

  // ── 5. CIERRES DIARIOS ──
  const [cierresRows] = await pool.execute(
    `SELECT idCierre, fecha, tecnico, cantidad_servicios, total_facturado
     FROM cierres_diarios ORDER BY fecha, tecnico`
  );
  const cierresData = cierresRows.map(r => [
    r.idCierre || '',
    formatFechaCierre(r.fecha),
    r.tecnico || '',
    toNum(r.cantidad_servicios),
    toNum(r.total_facturado)
  ]);
  await writeSheet(sheets, 'Cierres Diarios', [
    'ID_Cierre', 'Fecha', 'ID_Técnico', 'Cantidad_Servicios', 'Total_Facturado'
  ], cierresData);

  // ── VERIFICATION ──
  console.log('\n========================================');
  console.log('✅ EXPORTACIÓN COMPLETADA');
  console.log('========================================');

  const verificationRanges = [
    ['Clientes', 'Clientes!A2:E'],
    ['Vehículos', 'Vehículos!A2:D'],
    ['Servicios', 'Servicios!A2:J'],
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

  // Muestras
  console.log('\n--- MUESTRAS DE DATOS ---');
  for (const [name, range] of [
    ['Clientes', 'Clientes!A2:E2'],
    ['Vehículos', 'Vehículos!A2:D2'],
    ['Servicios', 'Servicios!A2:J2'],
    ['Detalle_Servicios', 'Detalle_Servicios!A2:G2'],
    ['Cierres Diarios', 'Cierres Diarios!A2:E2']
  ]) {
    const res = await rateLimitedRequest(() =>
      sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range })
    );
    const row = res.data.values ? res.data.values[0] : [];
    console.log(`${name}:`, row.join(' | '));
  }

  await pool.end();
  console.log('\n🏁 Script finalizado correctamente.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  console.error(err.stack);
  process.exit(1);
});
