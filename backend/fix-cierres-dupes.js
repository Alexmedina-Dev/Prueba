require('dotenv').config();
const mysql = require('mysql2/promise');

async function fix() {
  const pool = mysql.createPool({ host:'localhost', user:'root', password:'', database:'motoverso', port:3306 });
  
  // Step 1: Get all duplicates
  const [dupes] = await pool.execute(`
    SELECT fecha, tecnico, MIN(id) as keepId, COUNT(*) as total 
    FROM cierres_diarios 
    GROUP BY fecha, tecnico 
    HAVING total > 1
  `);
  
  console.log('Duplicados encontrados:', dupes.length);
  
  for (const d of dupes) {
    // Delete all except the one with the lowest id
    const [deleted] = await pool.execute(`
      DELETE FROM cierres_diarios 
      WHERE fecha = ? AND tecnico = ? AND id != ?
    `, [d.fecha, d.tecnico, d.keepId]);
    
    console.log(`  ${d.tecnico} ${d.fecha.toISOString().substring(0,10)}: mantenido ${d.keepId}, eliminados ${deleted.affectedRows}`);
  }
  
  // Step 2: Add unique key
  try {
    await pool.execute('ALTER TABLE cierres_diarios ADD UNIQUE KEY unique_fecha_tecnico (fecha, tecnico)');
    console.log('Clave unica agregada: fecha + tecnico');
  } catch (e) {
    console.log('Error agregando clave:', e.message);
  }
  
  // Step 3: Verify
  const [count] = await pool.execute('SELECT COUNT(*) as total FROM cierres_diarios');
  console.log('Total cierres:', count[0].total);
  
  await pool.end();
}
fix();
