/**
 * Migración Excel → MySQL — MotoVerso
 * 
 * Lee el archivo Excel de seguimiento de servicios y migra las hojas:
 * Clientes, Vehículos, Servicios, Detalle_Servicios, Cierres Diarios
 * a las tablas SQL correspondientes en la base de datos motoverso.
 */

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const mysql = require('mysql2/promise');

// ── Configuración ──────────────────────────────────────────────────────────────

const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '',
  database: 'motoverso',
  charset: 'utf8mb4',
};

const EXCEL_PATHS = [
  path.join('C:\\MotoVerso', 'seguimiento de servicios.xlsx'),
  path.join('C:\\MotoVerso', 'APP', 'Copia de seguimiento de servicios (1).xlsx'),
];

const BATCH_SIZE = 1000;

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Convierte un valor de celda de Excel a string seguro.
 */
function str(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Convierte un valor de celda de Excel a número seguro.
 */
function num(val) {
  if (val === null || val === undefined || val === '') return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

/**
 * Detecta si un valor parece un serial de fecha de Excel (número entre 1 y ~200000).
 */
function isExcelDate(val) {
  return typeof val === 'number' && val > 1 && val < 200000;
}

/**
 * Convierte un serial de fecha de Excel a objeto Date de JS.
 * Excel usa el sistema de fechas "1900" con el bug del año 1900.
 */
function excelDateToDate(serial) {
  // Excel epoch: 1899-12-30 (por el bug del año 1900)
  const epoch = new Date(1899, 11, 30);
  const msPerDay = 24 * 60 * 60 * 1000;
  return new Date(epoch.getTime() + serial * msPerDay);
}

/**
 * Formatea una fecha como 'YYYY-MM-DD HH:mm:ss' (para DATETIME).
 */
function toDateTime(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

/**
 * Formatea una fecha como 'YYYY-MM-DD' (para DATE).
 */
function toDateOnly(date) {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

/**
 * Parsea una celda de fecha que puede ser Date, string o serial de Excel.
 * Devuelve Date de JS o null.
 */
function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (isExcelDate(val)) return excelDateToDate(val);
  if (typeof val === 'string') {
    const parsed = new Date(val);
    return isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

/**
 * Genera un ID único tipo CLI-XXXXXX o SRV-XXXXXX.
 */
function generateId(prefix) {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}${rand}`;
}

/**
 * Verifica si una fila está completamente vacía (todas las celdas nulas/vacías).
 */
function isRowEmpty(row) {
  if (!row || row.length === 0) return true;
  return row.every((cell) => cell === null || cell === undefined || String(cell).trim() === '');
}

/**
 * Procesa una hoja en lotes de BATCH_SIZE.
 * cb(item, index) se llama por cada fila del lote actual.
 * Retorna { inserted, updated, errors, errorRows }.
 */
async function processBatches(rows, cb) {
  const total = rows.length;
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  const errorRows = [];

  for (let i = 0; i < total; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(total / BATCH_SIZE);

    let batchInserted = 0;
    let batchUpdated = 0;

    for (const row of batch) {
      try {
        const result = await cb(row);
        if (result === 'insert') batchInserted++;
        else if (result === 'update') batchUpdated++;
      } catch (err) {
        errors++;
        errorRows.push({ row, error: err.message });
      }
    }

    inserted += batchInserted;
    updated += batchUpdated;

    console.log(
      `  Lote ${batchNum}/${totalBatches} — +${batchInserted} inserts, ~${batchUpdated} updates` +
      (errors > 0 ? ` (${errors} errores)` : '')
    );
  }

  return { inserted, updated, errors, errorRows };
}

/**
 * Ejecuta un upsert (INSERT ... ON DUPLICATE KEY UPDATE) genérico.
 * Retorna 'insert' o 'update' basado en affectedRows.
 */
async function upsert(conn, table, columns, values, updateColumns) {
  const placeholders = columns.map(() => '?').join(', ');
  const colNames = columns.join(', ');
  const updateClause = updateColumns
    .map((c) => `\`${c}\` = VALUES(\`${c}\`)`)
    .join(', ');

  const sql = `INSERT INTO \`${table}\` (${colNames}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
  const [result] = await conn.execute(sql, values);
  return result.affectedRows === 1 ? 'insert' : 'update';
}

// ── Sentencias CREATE TABLE ────────────────────────────────────────────────────

const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS \`clientes\` (
    \`cedula\` VARCHAR(50) NOT NULL,
    \`nombre\` VARCHAR(255) DEFAULT NULL,
    \`telefono\` VARCHAR(50) DEFAULT NULL,
    \`correo\` VARCHAR(255) DEFAULT NULL,
    PRIMARY KEY (\`cedula\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

  `CREATE TABLE IF NOT EXISTS \`vehiculos\` (
    \`placa\` VARCHAR(50) NOT NULL,
    \`cedula_cliente\` VARCHAR(50) DEFAULT NULL,
    \`modelo\` VARCHAR(255) DEFAULT NULL,
    PRIMARY KEY (\`placa\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

  `CREATE TABLE IF NOT EXISTS \`servicios\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`idServicio\` VARCHAR(255) NOT NULL,
    \`fecha\` DATETIME DEFAULT NULL,
    \`placa\` VARCHAR(50) DEFAULT NULL,
    \`tecnico\` VARCHAR(100) DEFAULT NULL,
    \`diagnostico\` TEXT DEFAULT NULL,
    \`detalle_repuestos\` TEXT DEFAULT NULL,
    \`detalle_servicios\` TEXT DEFAULT NULL,
    \`total_repuestos\` DECIMAL(15,2) DEFAULT 0.00,
    \`total_mano_obra\` DECIMAL(15,2) DEFAULT 0.00,
    \`gran_total\` DECIMAL(15,2) DEFAULT 0.00,
    \`estado\` ENUM('Abierto','Cerrado') DEFAULT NULL,
    \`comentarios\` TEXT DEFAULT NULL,
    \`fecha_salida\` DATETIME DEFAULT NULL,
    \`lockedBy\` VARCHAR(100) DEFAULT NULL,
    \`lockedAt\` DATETIME DEFAULT NULL,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_idServicio\` (\`idServicio\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

  `CREATE TABLE IF NOT EXISTS \`detalle_servicios\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`idServicio\` VARCHAR(255) NOT NULL,
    \`tipo\` ENUM('Repuesto','Mano de Obra','MO Terceros') DEFAULT NULL,
    \`codigo\` VARCHAR(255) DEFAULT NULL,
    \`descripcion\` VARCHAR(500) DEFAULT NULL,
    \`cantidad\` INT DEFAULT 0,
    \`precio_unitario\` DECIMAL(15,2) DEFAULT 0.00,
    \`subtotal\` DECIMAL(15,2) DEFAULT 0.00,
    PRIMARY KEY (\`id\`),
    INDEX \`idx_idServicio\` (\`idServicio\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

  `CREATE TABLE IF NOT EXISTS \`cierres_diarios\` (
    \`id\` INT NOT NULL AUTO_INCREMENT,
    \`idCierre\` VARCHAR(255) NOT NULL,
    \`fecha\` DATE DEFAULT NULL,
    \`tecnico\` VARCHAR(100) DEFAULT NULL,
    \`cantidad_servicios\` INT DEFAULT 0,
    \`total_facturado\` DECIMAL(15,2) DEFAULT 0.00,
    PRIMARY KEY (\`id\`),
    UNIQUE KEY \`uq_idCierre\` (\`idCierre\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
];

// ── Migradores por hoja ────────────────────────────────────────────────────────

/**
 * Migrar hoja "Clientes" → tabla clientes
 */
async function migrateClientes(conn, rows) {
  console.log(`\n📋 Migrando Clientes: ${rows.length} filas leídas del Excel`);

  let skippedEmpty = 0;
  const results = await processBatches(rows, (row) => {
    if (isRowEmpty(row)) { skippedEmpty++; return null; }

    let cedula = str(row[0]);
    const nombre = str(row[1]);
    const telefono = str(row[2]);
    const correo = str(row[3]);

    // Si no hay cédula pero hay otros datos, generar una automática (igual que el Apps Script)
    if (!cedula && (nombre || telefono || correo)) {
      cedula = generateId('CLI');
    }
    if (!cedula) { skippedEmpty++; return null; }

    return upsert(
      conn,
      'clientes',
      ['cedula', 'nombre', 'telefono', 'correo'],
      [cedula, nombre, telefono, correo],
      ['nombre', 'telefono', 'correo']
    );
  });

  console.log(
    `  ✅ Clientes: ${results.inserted} insertados, ${results.updated} actualizados` +
    (skippedEmpty > 0 ? ` (${skippedEmpty} filas vacías saltadas)` : '') +
    (results.errors > 0 ? ` (${results.errors} errores)` : '')
  );
  return results;
}

/**
 * Migrar hoja "Vehículos" → tabla vehiculos
 */
async function migrateVehiculos(conn, rows) {
  console.log(`\n🚗 Migrando Vehículos: ${rows.length} filas leídas del Excel`);

  let skippedEmpty = 0;
  const results = await processBatches(rows, (row) => {
    if (isRowEmpty(row)) { skippedEmpty++; return null; }

    let placa = str(row[0]).toUpperCase();
    const cedula_cliente = str(row[1]);
    const modelo = str(row[2]);

    // Si no hay placa pero hay modelo o cédula, generar una automática
    if (!placa && (modelo || cedula_cliente)) {
      placa = generateId('VEH');
    }
    if (!placa) { skippedEmpty++; return null; }

    return upsert(
      conn,
      'vehiculos',
      ['placa', 'cedula_cliente', 'modelo'],
      [placa, cedula_cliente, modelo],
      ['cedula_cliente', 'modelo']
    );
  });

  console.log(
    `  ✅ Vehículos: ${results.inserted} insertados, ${results.updated} actualizados` +
    (skippedEmpty > 0 ? ` (${skippedEmpty} filas vacías saltadas)` : '') +
    (results.errors > 0 ? ` (${results.errors} errores)` : '')
  );
  return results;
}

/**
 * Migrar hoja "Servicios" → tabla servicios
 */
async function migrateServicios(conn, rows) {
  console.log(`\n🔧 Migrando Servicios: ${rows.length} filas leídas del Excel`);

  let skippedEmpty = 0;
  const results = await processBatches(rows, (row) => {
    if (isRowEmpty(row)) { skippedEmpty++; return null; }

    let idServicio = str(row[0]);
    const fechaRaw = row[1];
    const fecha = parseDate(fechaRaw);

    const placa = str(row[2]).toUpperCase();
    const tecnico = str(row[3]);
    const diagnostico = str(row[4]);
    const detalle_repuestos = str(row[5]);
    const detalle_servicios = str(row[6]);
    const total_repuestos = num(row[7]);
    const total_mano_obra = num(row[8]);
    const gran_total = num(row[9]);

    const estadoRaw = str(row[10]);
    const estado = estadoRaw === 'Cerrado' ? 'Cerrado' : 'Abierto';

    const comentarios = str(row[11]);

    const fechaSalidaRaw = row[12];
    const fecha_salida = parseDate(fechaSalidaRaw);

    // Si no hay idServicio pero hay placa o técnico, generar uno automático
    if (!idServicio && (placa || tecnico || diagnostico)) {
      idServicio = generateId('SRV');
    }
    if (!idServicio) { skippedEmpty++; return null; }

    return upsert(
      conn,
      'servicios',
      [
        'idServicio', 'fecha', 'placa', 'tecnico', 'diagnostico',
        'detalle_repuestos', 'detalle_servicios', 'total_repuestos',
        'total_mano_obra', 'gran_total', 'estado', 'comentarios',
        'fecha_salida',
      ],
      [
        idServicio, toDateTime(fecha), placa, tecnico, diagnostico,
        detalle_repuestos, detalle_servicios, total_repuestos,
        total_mano_obra, gran_total, estado, comentarios,
        toDateTime(fecha_salida),
      ],
      [
        'fecha', 'placa', 'tecnico', 'diagnostico',
        'detalle_repuestos', 'detalle_servicios', 'total_repuestos',
        'total_mano_obra', 'gran_total', 'estado', 'comentarios',
        'fecha_salida',
      ]
    );
  });

  console.log(
    `  ✅ Servicios: ${results.inserted} insertados, ${results.updated} actualizados` +
    (skippedEmpty > 0 ? ` (${skippedEmpty} filas vacías saltadas)` : '') +
    (results.errors > 0 ? ` (${results.errors} errores)` : '')
  );
  return results;
}

/**
 * Migrar hoja "Detalle_Servicios" → tabla detalle_servicios
 * 
 * Estrategia: para cada idServicio, DELETE existentes y re-insertar.
 * Esto garantiza consistencia sin depender de un UNIQUE compuesto.
 */
async function migrateDetalleServicios(conn, rows) {
  console.log(`\n📦 Migrando Detalle de Servicios: ${rows.length} filas leídas del Excel`);

  // Agrupar por idServicio para poder DELETE+INSERT por servicio
  let skippedEmpty = 0;
  const grouped = new Map();
  for (const row of rows) {
    if (isRowEmpty(row)) { skippedEmpty++; continue; }

    let idServicio = str(row[0]);
    // Si idServicio está vacío, no se puede vincular — saltar
    if (!idServicio) { skippedEmpty++; continue; }

    if (!grouped.has(idServicio)) grouped.set(idServicio, []);
    grouped.get(idServicio).push(row);
  }

  const serviceIds = Array.from(grouped.keys());
  const totalServices = serviceIds.length;
  let inserted = 0;
  let errors = 0;
  const errorRows = [];

  console.log(`  Agrupados en ${totalServices} servicios distintos`);

  for (let i = 0; i < totalServices; i += BATCH_SIZE) {
    const batchIds = serviceIds.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(totalServices / BATCH_SIZE);

    let batchInserted = 0;

    for (const idServicio of batchIds) {
      try {
        // DELETE existentes para este servicio
        await conn.execute(
          'DELETE FROM `detalle_servicios` WHERE `idServicio` = ?',
          [idServicio]
        );

        // INSERT nuevos registros
        const items = grouped.get(idServicio);
        for (const row of items) {
          const tipoRaw = str(row[1]);
          let tipo = null;
          if (tipoRaw === 'Repuesto') tipo = 'Repuesto';
          else if (tipoRaw === 'Mano de Obra') tipo = 'Mano de Obra';
          else if (tipoRaw === 'MO Terceros') tipo = 'MO Terceros';

          const codigo = str(row[2]);
          const descripcion = str(row[3]);
          const cantidad = num(row[4]);
          const precio_unitario = num(row[5]);
          const subtotal = num(row[6]);

          await conn.execute(
            `INSERT INTO \`detalle_servicios\`
              (\`idServicio\`, \`tipo\`, \`codigo\`, \`descripcion\`, \`cantidad\`, \`precio_unitario\`, \`subtotal\`)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [idServicio, tipo, codigo, descripcion, cantidad, precio_unitario, subtotal]
          );
          batchInserted++;
        }
      } catch (err) {
        errors++;
        errorRows.push({ idServicio, error: err.message });
      }
    }

    inserted += batchInserted;
    console.log(
      `  Lote ${batchNum}/${totalBatches} — ${batchInserted} registros insertados` +
      (errors > 0 ? ` (${errors} errores)` : '')
    );
  }

  console.log(
    `  ✅ Detalle Servicios: ${inserted} insertados` +
    (skippedEmpty > 0 ? ` (${skippedEmpty} filas vacías/sin idServicio saltadas)` : '') +
    (errors > 0 ? ` (${errors} errores)` : '')
  );
  return { inserted, updated: 0, errors, errorRows };
}

/**
 * Migrar hoja "Cierres Diarios" → tabla cierres_diarios
 */
async function migrateCierresDiarios(conn, rows) {
  console.log(`\n📊 Migrando Cierres Diarios: ${rows.length} filas`);

  const results = await processBatches(rows, (row) => {
    const idCierre = str(row[0]);
    if (!idCierre) return null;

    const fechaRaw = row[1];
    const fecha = parseDate(fechaRaw);

    const tecnico = str(row[2]);
    const cantidad_servicios = num(row[3]);
    const total_facturado = num(row[4]);

    return upsert(
      conn,
      'cierres_diarios',
      ['idCierre', 'fecha', 'tecnico', 'cantidad_servicios', 'total_facturado'],
      [idCierre, toDateOnly(fecha), tecnico, cantidad_servicios, total_facturado],
      ['fecha', 'tecnico', 'cantidad_servicios', 'total_facturado']
    );
  });

  console.log(
    `  ✅ Cierres Diarios: ${results.inserted} insertados, ${results.updated} actualizados` +
    (results.errors > 0 ? ` (${results.errors} errores)` : '')
  );
  return results;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(60));
  console.log('  MOTOVERSO — Migración Excel → MySQL');
  console.log('═'.repeat(60));

  // 1. Localizar archivo Excel
  let excelPath = null;
  for (const p of EXCEL_PATHS) {
    if (fs.existsSync(p)) {
      excelPath = p;
      break;
    }
  }
  if (!excelPath) {
    console.error('❌ No se encontró el archivo Excel en las rutas configuradas:');
    EXCEL_PATHS.forEach((p) => console.error(`   - ${p}`));
    process.exit(1);
  }
  console.log(`\n📁 Archivo: ${excelPath}`);

  // 2. Leer workbook
  console.log('📖 Leyendo archivo Excel...');
  const workbook = XLSX.readFile(excelPath, { type: 'file' });
  console.log(`   Hojas encontradas: ${workbook.SheetNames.join(', ')}`);

  // 3. Conectar a MySQL
  console.log('\n🔌 Conectando a MySQL...');
  let conn;
  try {
    conn = await mysql.createConnection(DB_CONFIG);
    console.log('   Conexión exitosa');
  } catch (err) {
    console.error('❌ Error al conectar con MySQL:', err.message);
    process.exit(1);
  }

  try {
    // 4. Crear tablas
    console.log('\n🏗️  Creando tablas si no existen...');
    for (const sql of CREATE_TABLES) {
      await conn.execute(sql);
    }
    console.log('   Tablas listas');

    // 5. Leer hojas
    const sheetClientes = workbook.Sheets['Clientes'];
    const sheetVehiculos = workbook.Sheets['Vehículos'];
    const sheetServicios = workbook.Sheets['Servicios'];
    const sheetDetalle = workbook.Sheets['Detalle_Servicios'];
    const sheetCierres = workbook.Sheets['Cierres Diarios'];

    // Helper: leer hoja con header:0 para usar índices numéricos
    function readSheet(sheet) {
      if (!sheet) return [];
      return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    }

    const rawClientes = readSheet(sheetClientes);
    const rawVehiculos = readSheet(sheetVehiculos);
    const rawServicios = readSheet(sheetServicios);
    const rawDetalle = readSheet(sheetDetalle);
    const rawCierres = readSheet(sheetCierres);

    // Quitar filas de encabezado (primera fila de cada hoja)
    // Detectar si la primera fila parece encabezado (contiene texto no numérico)
    function skipHeaderIfText(rows) {
      if (rows.length === 0) return [];
      const first = rows[0];
      // Si el primer elemento es string y no es un número puro, es encabezado
      const firstVal = str(first[0]);
      if (firstVal && isNaN(firstVal) && !isExcelDate(first[0])) {
        return rows.slice(1);
      }
      return rows;
    }

    const clientes = skipHeaderIfText(rawClientes);
    const vehiculos = skipHeaderIfText(rawVehiculos);
    const servicios = skipHeaderIfText(rawServicios);
    const detalle = skipHeaderIfText(rawDetalle);
    const cierres = skipHeaderIfText(rawCierres);

    console.log('\n📊 Filas por hoja:');
    console.log(`   Clientes:        ${clientes.length}`);
    console.log(`   Vehículos:       ${vehiculos.length}`);
    console.log(`   Servicios:       ${servicios.length}`);
    console.log(`   Detalle:         ${detalle.length}`);
    console.log(`   Cierres Diarios: ${cierres.length}`);

    // 6. Migrar en orden
    const stats = {};

    stats.clientes = await migrateClientes(conn, clientes);
    stats.vehiculos = await migrateVehiculos(conn, vehiculos);
    stats.servicios = await migrateServicios(conn, servicios);
    stats.detalle = await migrateDetalleServicios(conn, detalle);
    stats.cierres = await migrateCierresDiarios(conn, cierres);

    // 7. Resumen final
    console.log('\n' + '═'.repeat(60));
    console.log('  RESUMEN DE MIGRACIÓN');
    console.log('═'.repeat(60));

    const summaryRows = [
      ['Clientes', stats.clientes],
      ['Vehículos', stats.vehiculos],
      ['Servicios', stats.servicios],
      ['Detalle Servicios', stats.detalle],
      ['Cierres Diarios', stats.cierres],
    ];

    for (const [name, s] of summaryRows) {
      const parts = [];
      if (s.inserted > 0) parts.push(`${s.inserted} inserts`);
      if (s.updated > 0) parts.push(`${s.updated} updates`);
      if (s.errors > 0) parts.push(`⚠️  ${s.errors} errores`);
      console.log(`  ${name.padEnd(20)} ${parts.join(', ') || 'sin cambios'}`);
    }

    // Total errores
    const totalErrors = Object.values(stats).reduce((sum, s) => sum + (s.errors || 0), 0);
    if (totalErrors > 0) {
      console.log(`\n⚠️  Total errores: ${totalErrors}`);
      console.log('   Revisa los mensajes de error anteriores para detalles.');
    }

    console.log('\n✅ Migración completada.\n');

  } catch (err) {
    console.error('\n❌ Error durante la migración:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    if (conn) {
      await conn.end();
      console.log('🔌 Conexión MySQL cerrada.');
    }
  }
}

main();
