require('dotenv').config();
const mysql = require('mysql2/promise');

async function fix() {
  const pool = mysql.createPool({ host:'localhost', user:'root', password:'', database:'motoverso', port:3306 });
  
  // 1. Create missing table
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cierre_servicios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      idCierre VARCHAR(255) NOT NULL,
      idServicio VARCHAR(255) NOT NULL,
      UNIQUE KEY unique_cierre_servicio (idCierre, idServicio)
    )
  `);
  console.log('Tabla cierre_servicios creada!');

  // 2. Check cierres that weren't synced to Sheet
  const [cierres] = await pool.execute('SELECT * FROM cierres_diarios ORDER BY id DESC LIMIT 5');
  console.log('\nCierres en MySQL (ultimos 5):');
  cierres.forEach(r => console.log(`  ${r.idCierre} | ${r.fecha.toISOString().substring(0,10)} | ${r.tecnico} | ${r.cantidad_servicios} servicios | $${r.total_facturado}`));
  
  await pool.end();
}
fix().catch(e => console.error(e.message));
