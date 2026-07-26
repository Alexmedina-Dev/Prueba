/**
 * Logger de errores para MotoVerso
 * Guarda errores en MySQL (tabla logs_errores) y en archivo de texto
 */

const fs = require('fs');
const path = require('path');
const pool = require('../db');

// Asegurar que existe la carpeta de logs
const LOGS_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const LOG_FILE = path.join(LOGS_DIR, 'errores.log');

/**
 * Guarda un error en MySQL y en archivo de texto
 */
async function logError({ tipo = 'ERROR', ruta, metodo, mensaje, stack, datos, usuario, ip }) {
  const fecha = new Date();
  const fechaStr = fecha.toISOString();

  // 1. Guardar en archivo de texto — un solo write async, no bloquea el event loop
  let logBlock = `[${fechaStr}] [${tipo}] ${metodo || 'GET'} ${ruta || 'unknown'} | ${mensaje} | IP: ${ip || 'unknown'} | Usuario: ${usuario || 'anonimo'}\n`;
  if (stack) logBlock += `STACK: ${stack}\n`;
  if (datos) logBlock += `DATOS: ${JSON.stringify(datos).substring(0, 500)}\n`;
  logBlock += '---\n';

  const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB por archivo
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_SIZE) {
      fs.renameSync(LOG_FILE, path.join(LOGS_DIR, `errores-${Date.now()}.log`));
    }
    fs.appendFile(LOG_FILE, logBlock, (err) => {
      if (err) console.error('No se pudo escribir en archivo de log:', err.message);
    });
  } catch (fileErr) {
    console.error('No se pudo escribir en archivo de log:', fileErr.message);
  }

  // 2. Guardar en MySQL (si está disponible)
  try {
    await pool.execute(
      `INSERT INTO logs_errores 
       (tipo, ruta, metodo, mensaje, stack_trace, datos_request, usuario, ip_cliente, fecha)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        tipo,
        ruta || null,
        metodo || null,
        mensaje ? mensaje.substring(0, 1000) : null,
        stack ? stack.substring(0, 2000) : null,
        datos ? JSON.stringify(datos).substring(0, 2000) : null,
        usuario || null,
        ip || null
      ]
    );
  } catch (dbErr) {
    // Si MySQL falla, al menos quedó en el archivo
    console.error('No se pudo guardar error en MySQL:', dbErr.message);
  }
}

/**
 * Middleware de Express para loguear requests
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  
  // Cuando la respuesta termine, loguear el tiempo
  res.on('finish', () => {
    const duration = Date.now() - start;
    const usuario = req.user ? req.user.email : 'anonimo';
    
    // Solo loguear errores (status >= 400) o requests lentas (> 5 segundos)
    if (res.statusCode >= 400 || duration > 5000) {
      logError({
        tipo: res.statusCode >= 500 ? 'ERROR_SERVER' : 'ERROR_CLIENT',
        ruta: req.originalUrl,
        metodo: req.method,
        mensaje: `HTTP ${res.statusCode} - ${duration}ms`,
        datos: { body: req.body, query: req.query, params: req.params },
        usuario: usuario,
        ip: req.ip || req.connection.remoteAddress
      });
    }
  });
  
  next();
}

/**
 * Middleware de Express para capturar errores no manejados
 */
function errorHandler(err, req, res, next) {
  const usuario = req.user ? req.user.email : 'anonimo';
  
  logError({
    tipo: 'ERROR_UNHANDLED',
    ruta: req.originalUrl,
    metodo: req.method,
    mensaje: err.message,
    stack: err.stack,
    datos: { body: req.body },
    usuario: usuario,
    ip: req.ip || req.connection.remoteAddress
  });

  // No exponer detalles del error al cliente en producción
  const isDev = process.env.NODE_ENV === 'development';
  res.status(500).json({
    error: 'Error interno del servidor',
    ...(isDev && { detalle: err.message })
  });
}

/**
 * Crear tabla de logs si no existe
 */
async function crearTablaLogs() {
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
    console.log('✅ Tabla logs_errores creada/verificada');
  } catch (e) {
    console.error('❌ Error creando tabla logs_errores:', e.message);
  }
}

module.exports = {
  logError,
  requestLogger,
  errorHandler,
  crearTablaLogs
};
