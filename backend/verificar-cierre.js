require('dotenv').config();
const mysql = require('mysql2/promise');

async function verificarCierre() {
  // Conectar a MySQL
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'motoverso',
    charset: 'utf8mb4'
  });

  console.log('=== VERIFICANDO DATOS DE CIERRE ===\n');

  // 1. Verificar servicios cerrados de Camilo
  console.log('🔍 Servicios CERRADOS de Camilo:');
  const [servicios] = await pool.execute(`
    SELECT idServicio, placa, fecha, fecha_salida, estado, total_mano_obra
    FROM servicios 
    WHERE tecnico = 'Camilo' AND estado = 'Cerrado'
    ORDER BY fecha_salida DESC
    LIMIT 10
  `);
  
  servicios.forEach(s => {
    console.log(`  ${s.idServicio} | Placa:${s.placa} | Fecha:${s.fecha} | Salida:${s.fecha_salida} | Total MO:$${s.total_mano_obra}`);
  });

  // 2. Verificar qué hay el 5 y 6 de agosto
  console.log('\n🔍 Servicios del 05/08/2026:');
  const [ago5] = await pool.execute(`
    SELECT idServicio, placa, fecha_salida, tecnico
    FROM servicios 
    WHERE DATE(COALESCE(fecha_salida, fecha)) = '2026-08-05'
      AND estado = 'Cerrado'
  `);
  console.log(`  Encontrados: ${ago5.length}`);
  ago5.forEach(s => console.log(`    ${s.idServicio} | ${s.placa} | Téc:${s.tecnico}`));

  console.log('\n🔍 Servicios del 06/08/2026:');
  const [ago6] = await pool.execute(`
    SELECT idServicio, placa, fecha_salida, tecnico
    FROM servicios 
    WHERE DATE(COALESCE(fecha_salida, fecha)) = '2026-08-06'
      AND estado = 'Cerrado'
  `);
  console.log(`  Encontrados: ${ago6.length}`);
  ago6.forEach(s => console.log(`    ${s.idServicio} | ${s.placa} | Téc:${s.tecnico}`));

  // 3. Ver detalle de Mano de Obra para los del 06/08
  if (ago6.length > 0) {
    const ids = ago6.map(s => s.idServicio);
    const placeholders = ids.map(() => '?').join(',');
    const [detalles] = await pool.execute(`
      SELECT idServicio, tipo, descripcion, subtotal
      FROM detalle_servicios 
      WHERE idServicio IN (${placeholders}) AND tipo = 'Mano de Obra'
    `, ids);
    console.log('\n🔍 Detalle MO del 06/08/2026:');
    detalles.forEach(d => console.log(`    ${d.idServicio} | ${d.descripcion} | $${d.subtotal}`));
  }

  // 4. Ver timezone del servidor MySQL
  const [tz] = await pool.execute('SELECT @@timezone as tz, NOW() as ahora');
  console.log('\n⏰ Timezone MySQL:', tz[0].tz, '| Hora servidor:', tz[0].ahora);

  await pool.end();
}

verificarCierre().catch(e => console.error('Error:', e.message));
