/**
 * Script de setup para Hostinger
 * Ejecutar una sola vez después de crear la base de datos en hPanel
 * 
 * Uso: node deploy-setup.js
 * 
 * Requiere que las variables de entorno estén configuradas en Hostinger:
 *   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET
 */

require('dotenv').config();
const pool = require('./db');
const bcrypt = require('bcryptjs');

const usuarios = [
  { nombre: 'Nury Hernández', email: 'repuestoshannasmotos@gmail.com', role: 'admin', puede_cerrar_caja: true, acceso_excel: true, password: 'nury1234' },
  { nombre: 'Alex Medina', email: 'alexandermedi53h@gmail.com', role: 'developer', puede_cerrar_caja: true, acceso_excel: true, password: 'alex1234' },
  { nombre: 'Don Mauricio', email: 'motoversotaller@gmail.com', role: 'operador', puede_cerrar_caja: true, acceso_excel: false, password: 'mauricio1234' },
  { nombre: 'Ana Najar', email: 'ana@motoverso.com', role: 'operador', puede_cerrar_caja: false, acceso_excel: true, password: 'ana1234' },
  { nombre: 'Steven', email: 'steven@motoverso.com', role: 'operador', puede_cerrar_caja: false, acceso_excel: true, password: 'steven1234' },
  { nombre: 'Erika', email: 'erika@motoverso.com', role: 'operador', puede_cerrar_caja: false, acceso_excel: true, password: 'erika1234' },
  { nombre: 'Hanna', email: 'hanna@motoverso.com', role: 'operador', puede_cerrar_caja: false, acceso_excel: true, password: 'hanna1234' },
  { nombre: 'Cecilia', email: 'cecilia@motoverso.com', role: 'operador', puede_cerrar_caja: false, acceso_excel: true, password: 'cecilia1234' }
];

async function setup() {
  console.log('🚀 Iniciando setup de producción...\n');

  // 1. Crear tabla usuarios
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        nombre VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'developer', 'operador') DEFAULT 'operador',
        puede_cerrar_caja BOOLEAN DEFAULT FALSE,
        acceso_excel BOOLEAN DEFAULT FALSE,
        activo BOOLEAN DEFAULT TRUE,
        debe_cambiar_password BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_email (email)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    console.log('✅ Tabla usuarios creada');
  } catch (e) {
    console.error('❌ Error creando tabla usuarios:', e.message);
    process.exit(1);
  }

  // 2. Crear tabla logs_errores
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS logs_errores (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tipo VARCHAR(50) NOT NULL,
        ruta VARCHAR(500),
        metodo VARCHAR(10),
        mensaje TEXT,
        stack_trace TEXT,
        datos_request TEXT,
        usuario VARCHAR(255),
        ip_cliente VARCHAR(50),
        fecha DATETIME DEFAULT NOW(),
        INDEX idx_fecha (fecha),
        INDEX idx_tipo (tipo),
        INDEX idx_ruta (ruta)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
    `);
    console.log('✅ Tabla logs_errores creada');
  } catch (e) {
    console.error('❌ Error creando tabla logs_errores:', e.message);
  }

  // 3. Insertar usuarios
  for (const u of usuarios) {
    try {
      const hash = bcrypt.hashSync(u.password, 10);
      await pool.execute(`
        INSERT INTO usuarios (email, nombre, password_hash, role, puede_cerrar_caja, acceso_excel, activo, debe_cambiar_password)
        VALUES (?, ?, ?, ?, ?, ?, TRUE, TRUE)
        ON DUPLICATE KEY UPDATE
          nombre = VALUES(nombre),
          password_hash = VALUES(password_hash),
          role = VALUES(role),
          puede_cerrar_caja = VALUES(puede_cerrar_caja),
          acceso_excel = VALUES(acceso_excel),
          activo = TRUE,
          debe_cambiar_password = TRUE
      `, [u.email, u.nombre, hash, u.role, u.puede_cerrar_caja, u.acceso_excel]);
      console.log(`✅ ${u.nombre} (${u.email})`);
    } catch (e) {
      console.error(`❌ Error insertando ${u.email}:`, e.message);
    }
  }

  console.log('\n🎉 Setup completado. Todos los usuarios tienen debe_cambiar_password = TRUE');
  console.log('📝 Próximo paso: Ejecutar "node server.js" para iniciar el servidor\n');
  process.exit(0);
}

setup();
