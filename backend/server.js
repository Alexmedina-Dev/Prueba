require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const pool = require('./db');
const { requestLogger, errorHandler, crearTablaLogs, logError } = require('./utils/logger');

const app = express();
const server = http.createServer(app);

// CORS: múltiples orígenes permitidos
const isProduction = process.env.NODE_ENV === 'production';
// Parsear ALLOWED_ORIGINS (coma-separado) o usar ALLOWED_ORIGIN (legacy)
const rawOrigins = process.env.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGIN || '';
const allowedOrigins = rawOrigins
  .split(',')
  .map(o => o.trim())
  .filter(o => o.length > 0);

// En producción, solo permitir orígenes configurados
// En desarrollo, permitir todo
const corsOptions = isProduction 
  ? { 
      origin: allowedOrigins.length > 0 ? allowedOrigins : ['https://www.motoverso.app', 'https://prueba.seenode.app'],
      credentials: true 
    }
  : { origin: '*' };

const io = new Server(server, { cors: corsOptions });
app.use(cors(corsOptions));
app.use(express.json());
app.use(requestLogger);

// ── Socket.io ────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('🔌 Cliente conectado:', socket.id);

  socket.on('lock-service', async (data) => {
    try {
      const { idServicio, user: lockedBy } = data;
      if (!idServicio || !lockedBy) return;

      // Usar transacción con FOR UPDATE para evitar race condition
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        const [rows] = await conn.execute(
          'SELECT lockedBy FROM servicios WHERE idServicio=? FOR UPDATE',
          [idServicio]
        );
        if (rows.length > 0 && rows[0].lockedBy && rows[0].lockedBy !== lockedBy) {
          await conn.rollback();
          conn.release();
          socket.emit('lock-rejected', {
            idServicio,
            lockedBy: rows[0].lockedBy,
            message: `Este servicio lo está editando ${rows[0].lockedBy} ahora mismo.`
          });
          return;
        }
        await conn.execute(
          'UPDATE servicios SET lockedBy=?, lockedAt=NOW() WHERE idServicio=?',
          [lockedBy, idServicio]
        );
        await conn.commit();
        conn.release();
      } catch (e) {
        await conn.rollback();
        conn.release();
        throw e;
      }

      io.emit('service-locked', { idServicio, user: lockedBy });

      // Auto-unlock after 3 minutes
      setTimeout(async () => {
        try {
          await pool.execute(
            'UPDATE servicios SET lockedBy=NULL, lockedAt=NULL WHERE idServicio=? AND lockedBy=?',
            [idServicio, lockedBy]
          );
          io.emit('service-unlocked', { idServicio });
        } catch (e) {
          console.error('Auto-unlock error:', e.message);
        }
      }, 180000);
    } catch (e) {
      console.error('lock-service error:', e.message);
    }
  });

  socket.on('unlock-service', async (data) => {
    try {
      const { idServicio } = data;
      if (!idServicio) return;
      await pool.execute(
        'UPDATE servicios SET lockedBy=NULL, lockedAt=NULL WHERE idServicio=?',
        [idServicio]
      );
      io.emit('service-unlocked', { idServicio });
    } catch (e) {
      console.error('unlock-service error:', e.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 Cliente desconectado:', socket.id);
  });
});

// ── Health Check ─────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Frontend (estático) ──────────────────────────────────────
const path = require('path');
const rootDir = path.join(__dirname, '..');
app.use(express.static(rootDir));
app.use('/APP', express.static(path.join(rootDir, 'APP')));
app.use('/IMG', express.static(path.join(rootDir, 'IMG')));
app.use('/ADMIN', express.static(path.join(rootDir, 'ADMIN')));

// ── Rutas API ───────────────────────────────────────────────
app.use('/api', require('./routes/auth'));
app.use('/api/servicios', require('./routes/servicios'));
app.use('/api/cierres', require('./routes/cierres'));
app.use('/api/admin', require('./routes/admin'));

// ── .well-known para Chrome Password Manager ────────────────
app.get('/.well-known/change-password', (req, res) => {
  res.redirect('/index.html');
});

// ── SPA fallback ────────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(rootDir, 'APP', 'app.html'));
  }
});

// ── Error Handler (debe ir DESPUÉS de todas las rutas) ───────
app.use(errorHandler);

// ── Capturar errores globales que se escapan ────────────────
process.on('uncaughtException', (err) => {
  console.error('❌ UNCAUGHT EXCEPTION:', err.message);
  logError({ tipo: 'UNCAUGHT_EXCEPTION', ruta: 'process', metodo: 'FATAL', mensaje: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ UNHANDLED REJECTION:', reason);
  logError({ tipo: 'UNHANDLED_REJECTION', ruta: 'process', metodo: 'FATAL', mensaje: String(reason) });
});

// ── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

// Crear tabla de logs al iniciar
crearTablaLogs().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🏍️  MotoVerso backend corriendo en puerto ${PORT}`);
    console.log(`🌐 Accesible desde red local en: http://${require('os').networkInterfaces().Ethernet?.[0]?.address || require('os').networkInterfaces()['Wi-Fi']?.[0]?.address || 'TU_IP_LOCAL'}:${PORT}`);
    console.log(`📝 Logs de errores en: ./logs/errores.log`);
  });
}).catch((err) => {
  console.error('❌ Error al iniciar servidor:', err.message);
  process.exit(1);
});

