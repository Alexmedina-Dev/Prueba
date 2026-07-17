# MOTOVERSO - Contexto del Proyecto

> **Última actualización:** 15 de julio de 2026
> **Estado:** En desarrollo local (pruebas)
> **Nota:** Este archivo es la fuente de verdad del contexto. Si se abre una nueva sesión, leer este archivo primero antes de preguntar.

---

## 1. Descripción del Proyecto

**MOTOVERSO** es un sistema de gestión de órdenes de servicio para un taller de motos en Colombia (HANNAS MOTOS SAS). 

- **Problema original:** App en Google Apps Script + Sheets pierde datos por concurrencia (técnico y repuestos editando al mismo tiempo).
- **Solución:** Migrar a una app propia con Node.js + MySQL + frontend HTML/CSS/JS.
- **Cliente:** Dueña de MotoVerso + técnico del taller. Dos usuarios con login.
- **Técnicos para asignar órdenes (8):** Andres, Brayan, Yeison, Harold, Dairon, Johan, Alexander, Mauricio.

---

## 2. Stack Técnico

| Capa | Tecnología |
|------|-----------|
| **Backend** | Node.js + Express |
| **Base de datos** | MySQL (XAMPP local para pruebas / Hostinger en producción) |
| **Driver MySQL** | mysql2 (queries planas, NO Sequelize) |
| **Realtime** | Socket.io (bloqueo lockedBy/lockedAt) |
| **Frontend login** | HTML/CSS/JS (existe, NO se toca) |
| **Frontend app (dashboard)** | HTML/CSS/JS con CSS inline en app.html, JS separado en app-client.js |
| **Sync Sheets** | googleapis (cuenta de servicio) - App → Sheet únicamente |
| **Deploy futuro** | Hostinger Business/Cloud + dominio propio |

---

## 3. Estructura de Carpetas

```
C:\MotoVerso\
├── index.html               ← Login (NO TOCAR - ya funciona)
├── style.css                ← Estilos del login
├── motoverso.js             ← JS del login
├── Logo.jpg                 ← Logo del taller
├── .atl/                    ← Skills del workspace
│
├── APP/                     ← Dashboard de órdenes (nuevo backend)
│   ├── app.html             ← HTML con CSS inline (mismo diseño visual)
│   ├── app-client.js        ← JS con fetch() a localhost:3000 + Socket.io
│   ├── app.js               ← VIEJO - Código de Google Apps Script (referencia)
│   └── Copia de seguimiento de servicios (1).xlsx
│
├── backend/                 ← Servidor Node.js
│   ├── package.json         ← Dependencias
│   ├── .env                 ← Variables de entorno (ver sección 6)
│   ├── server.js            ← Express + Socket.io
│   ├── db.js                ← Pool MySQL con mysql2/promise
│   ├── middleware/
│   │   └── auth.js          ← JWT verification
│   ├── routes/
│   │   ├── auth.js          ← POST /api/login
│   │   ├── servicios.js     ← GET/POST servicios
│   │   └── cierres.js       ← POST cierre diario
│   └── utils/
│       └── sync-sheets.js   ← Sync a Google Sheets
│
└── scripts/
    └── migrate-excel-to-mysql.js  ← Migración de Excel a MySQL
```

---

## 4. Base de Datos MySQL

### 4.1 Configuración local (XAMPP)
- **Host:** localhost
- **Puerto:** 3306
- **Usuario:** root
- **Password:** (vacío)
- **Base:** motoverso
- **Charset:** utf8mb4

### 4.2 Tablas (nombres exactos, igual al Excel)

```sql
-- Clientes (hoja Excel: "Clientes")
CREATE TABLE clientes (
  cedula VARCHAR(50) PRIMARY KEY,
  nombre VARCHAR(255),
  telefono VARCHAR(50),
  correo VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Vehiculos (hoja Excel: "Vehículos")
CREATE TABLE vehiculos (
  placa VARCHAR(50) PRIMARY KEY,
  cedula_cliente VARCHAR(50),
  modelo VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Servicios (hoja Excel: "Servicios")
CREATE TABLE servicios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idServicio VARCHAR(255) UNIQUE,
  fecha DATETIME,
  placa VARCHAR(50),
  tecnico VARCHAR(100),
  diagnostico TEXT,
  detalle_repuestos TEXT,
  detalle_servicios TEXT,
  total_repuestos DECIMAL(15,2) DEFAULT 0,
  total_mano_obra DECIMAL(15,2) DEFAULT 0,
  gran_total DECIMAL(15,2) DEFAULT 0,
  estado ENUM('Abierto','Cerrado'),
  comentarios TEXT,
  fecha_salida DATETIME,
  lockedBy VARCHAR(100),
  lockedAt DATETIME
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Detalle_Servicios (hoja Excel: "Detalle_Servicios")
CREATE TABLE detalle_servicios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idServicio VARCHAR(255),
  tipo ENUM('Repuesto','Mano de Obra','MO Terceros'),
  codigo VARCHAR(255),
  descripcion VARCHAR(500),
  cantidad INT DEFAULT 1,
  precio_unitario DECIMAL(15,2) DEFAULT 0,
  subtotal DECIMAL(15,2) DEFAULT 0,
  INDEX idx_idServicio (idServicio)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cierres Diarios (hoja Excel: "Cierres Diarios")
CREATE TABLE cierres_diarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idCierre VARCHAR(255) UNIQUE,
  fecha DATE,
  tecnico VARCHAR(100),
  cantidad_servicios INT DEFAULT 0,
  total_facturado DECIMAL(15,2) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 4.3 Datos Migrados (desde Excel)

**Archivo fuente:** `C:\MotoVerso\APP\Copia de seguimiento de servicios (1).xlsx`

| Tabla | Registros en Excel | Registros migrados a MySQL | Notas |
|-------|-------------------|---------------------------|-------|
| Clientes | 2,992 filas leídas | **1,607** | 1,385 filas vacías saltadas |
| Vehículos | 2,994 filas leídas | **1,545** | 1,443 filas vacías saltadas |
| Servicios | 5,950 filas leídas | **2,448** | 3,502 filas vacías saltadas |
| Detalle_Servicios | 20,922 filas leídas | **8,388** | 12,534 filas vacías saltadas |
| Cierres Diarios | 464 filas leídas | **464** | 0 filas vacías |

**Nota importante:** El Excel tiene muchas filas "vacías con formato" (Google Sheets reserva espacio). El script de migración detecta y salta filas completamente vacías. Las filas faltantes (1-3 vs los datos esperados del cliente) son filas con ID vacío y sin datos relevantes.

**Cuando el cliente suba un Excel actualizado con nuevos datos:** El script de migración debe re-ejecutarse. Usa INSERT ... ON DUPLICATE KEY UPDATE, así que:
- Los registros existentes se actualizan
- Los nuevos se insertan
- Nunca se duplican

---

## 5. Endpoints API

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| POST | `/api/login` | Login con email/password | No |
| GET | `/api/servicios/abiertos` | Lista servicios con estado='Abierto' | JWT |
| POST | `/api/servicios/buscar-placa` | Busca vehículo/cliente por placa | JWT |
| POST | `/api/servicios/guardar` | Guarda/actualiza orden completa | JWT |
| POST | `/api/cierres/generar` | Genera cierre diario por técnico | JWT |

**WebSocket (Socket.io):**
- Evento `lock-service` → marca servicio como bloqueado
- Evento `unlock-service` → libera bloqueo
- Evento `service-locked` (broadcast) → notifica a otros usuarios
- Evento `service-unlocked` (broadcast) → notifica liberación
- Auto-liberación: 3 minutos de inactividad

**Credenciales de prueba:**
- Email: `admin@gmail.com`
- Password: `admin1234`

---

## 6. Configuración .env (backend)

```env
# MySQL (XAMPP local)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=motoverso

# App
PORT=3000
NODE_ENV=development
JWT_SECRET=motoverso2026supersecreto

# Google Sheets API (cuenta de servicio de prueba)
GOOGLE_CLIENT_EMAIL=motoverso-sheets@motoverso-test-502500.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[...]\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=motoverso-test-502500
SHEET_ID=12MY0Yz2Qt_p4z7c8Y3q3MWbyOHE-KY1E
```

**IMPORTANTE:** `credentials.json` NUNCA va al repo. Todo está en variables de entorno.

---

## 7. Google Sheets Setup

### Cuenta de servicio (pruebas)
- **Proyecto:** `motoverso-test-502500`
- **Cuenta:** `motoverso-sheets@motoverso-test-502500.iam.gserviceaccount.com`
- **Sheet de prueba:** `12MY0Yz2Qt_p4z7c8Y3q3MWbyOHE-KY1E` (en Drive de Alex)
- **APIs habilitadas:** Google Sheets API, Google Drive API

### Para producción (pendiente)
- Crear proyecto nuevo bajo Gmail de HANNAS MOTOS (no usar cuenta de prueba)
- Compartir Sheet real del cliente con la nueva cuenta de servicio
- Actualizar `.env` con nuevos datos

---

## 8. Instrucciones para correr localmente

### Paso 1: Activar XAMPP
- Abrir XAMPP Control Panel
- Iniciar **Apache** y **MySQL**
- Verificar: `http://localhost/phpmyadmin` funciona
- Base de datos `motoverso` debe existir

### Paso 2: Instalar dependencias (solo la primera vez)
```bash
cd C:\MotoVerso\backend
npm install

cd C:\MotoVerso\scripts
npm install xlsx mysql2
```

### Paso 3: Migrar datos del Excel a MySQL
```bash
cd C:\MotoVerso\scripts
node migrate-excel-to-mysql.js
```

### Paso 4: Arrancar servidor backend
```bash
cd C:\MotoVerso\backend
npm start
```
Debe decir: "MotoVerso backend corriendo en puerto 3000"

### Paso 5: Abrir frontend
- Abrir `http://localhost:5500/index.html` (login)
- Credenciales: `admin@gmail.com` / `admin1234`
- Redirige a `APP/app.html`

---

## 9. Estado Actual del Proyecto

### ✅ Completado
- [x] Backend Node.js con Express + mysql2 + Socket.io
- [x] Rutas API (login, servicios, cierres)
- [x] Auth JWT
- [x] Sync a Google Sheets (módulo listo, no testeado aún)
- [x] Frontend app.html con CSS inline (mismo diseño)
- [x] Frontend app-client.js con fetch() + Socket.io
- [x] Script de migración Excel → MySQL (con upsert y manejo de fechas)
- [x] Base de datos MySQL creada en XAMPP
- [x] Datos migrados desde Excel (1,607 clientes, 1,545 vehículos, 2,448 servicios, 8,388 detalles, 464 cierres)
- [x] Servidor corriendo en localhost:3000
- [x] Login funcionando (devuelve JWT)
- [x] API /api/servicios/abiertos devolviendo datos reales

### 🔲 Pendiente
- [ ] Probar frontend completo (login → dashboard → buscar placa → guardar orden)
- [ ] Probar Socket.io (bloqueo de servicios en tiempo real)
- [ ] Probar sync a Google Sheets (escribir en la Sheet de prueba)
- [ ] Responsive mobile-first (verificar tablas y botones en celular)
- [ ] Test de guardar servicio (Abierto y Cerrado)
- [ ] Test de cierre diario
- [ ] Configurar cuenta de Google Cloud con Gmail real del cliente
- [ ] Crear backup script para MySQL en producción
- [ ] Deploy en Hostinger

---

## 10. Notas Críticas

1. **Login NO se toca.** El login está en `index.html` en la raíz. Es independiente.
2. **CSS va inline en app.html.** El cliente quiere el mismo diseño. No crear archivo CSS externo para la app.
3. **JS va en app-client.js separado.** No inline en el HTML.
4. **Google Sheets API es gratuita.** No depende del crédito de $300 de Google Cloud.
5. **MySQL en Hostinger viene incluido.** Sin costo extra en Business/Cloud.
6. **La app no se comparte en redes sociales.** Es interna del taller.
7. **El viejo app.js (Apps Script) queda como referencia.** No se usa, no se borra todavía.
8. **No usar Sequelize.** El acuerdo fue mysql2 con queries planas.

---

## 11. Problemas Detectados y Resoluciones

### Problema 1: "Cannot GET /" en localhost:3000
**Status:** No es un error. El backend no tiene ruta `/`, solo rutas API en `/api/*`.
**Solución:** Acceder directamente a `/api/login` o `/api/servicios/abiertos`.

### Problema 2: Migración saltaba filas con IDs vacíos
**Status:** Corregido.
**Causa:** El script original descartaba filas donde cédula/placa/idServicio estaban vacíos.
**Solución:** Ahora el script genera IDs automáticos (`CLI-XXXX`, `VEH-XXXX`, `SRV-XXXX`) cuando el ID está vacío pero hay otros datos. Solo salta filas COMPLETAMENTE vacías.

### Problema 3: Filas vacías "con formato" en el Excel
**Status:** Manejado correctamente.
**Causa:** Google Sheets/XLSX reserva miles de filas vacías con formato de celda.
**Solución:** El script detecta filas completamente vacías (todas las celdas nulas/vacías) y las salta, mostrando el conteo.

### Problema 4: Fórmulas rotas en la copia de prueba de Google Sheets
**Status:** No afecta el proyecto.
**Causa:** Al convertir Excel (.xlsx) a Google Sheets, algunas fórmulas de la hoja "GENERAR FACTURA" se rompen.
**Nota:** Esto NO afecta la Sheet real del cliente. Es solo la copia de prueba en el Drive de Alex.

---

## 12. Checklist para Deploy en Hostinger (PRODUCCIÓN)

### ¿Qué SUBIR al hosting?

| Carpeta/Archivo | ¿Subir? | Notas |
|-----------------|---------|-------|
| `backend/` | ✅ SÍ | TODO el backend: server.js, routes, db.js, middleware, utils |
| `backend/package.json` | ✅ SÍ | Necesario para `npm install` en el servidor |
| `backend/.env` | ✅ SÍ | PERO con datos de producción (ver abajo) |
| `APP/app.html` | ✅ SÍ | El dashboard de órdenes |
| `APP/app-client.js` | ✅ SÍ | JS del dashboard |
| `index.html` (login) | ✅ SÍ | Página de login |
| `style.css` (login) | ✅ SÍ | Estilos del login |
| `motoverso.js` (login) | ✅ SÍ | JS del login |
| `Logo.jpg` | ✅ SÍ | Logo del taller |
| `scripts/` | ❌ NO | Solo para migración local, no va al servidor |
| `APP/app.js` (viejo) | ❌ NO | Código de Apps Script, no se usa |
| `APP/Copia de seguimiento...xlsx` | ❌ NO | Excel local, no va al servidor |
| `node_modules/` | ❌ NO | Se regenera con `npm install` en el servidor |
| `.git/` (si existe) | ❌ NO | No necesario en producción |

### ¿Qué ELIMINAR antes del deploy?

1. **Eliminar `backend/node_modules/`** — se regenera en el servidor con `npm install`
2. **Eliminar `APP/app.js` (viejo Apps Script)** — no se usa, confunde
3. **Eliminar `APP/Copia de seguimiento de servicios (1).xlsx`** — no va al servidor
4. **Eliminar carpeta `scripts/`** — solo para migración local
5. **Eliminar cualquier archivo de prueba o temporal**

### ¿Qué CONFIGURAR en Hostinger?

#### 1. Base de datos MySQL (en hPanel)
- Crear base de datos nueva (ej: `u123456789_motoverso`)
- Crear usuario y password
- Anotar: host, puerto (generalmente 3306), usuario, password, nombre de BD
- **Importar el dump de MySQL** desde XAMPP (usar phpMyAdmin de Hostinger)

#### 2. Archivo `.env` de producción (backend/.env)
```env
# MySQL Hostinger
DB_HOST=localhost          # o la IP que de Hostinger
DB_PORT=3306
DB_USER=u123456789_motoverso
DB_PASSWORD=password_que_de_hostinger
DB_NAME=u123456789_motoverso

# App
PORT=3000                  # Hostinger generalmente asigna puerto automático
NODE_ENV=production
JWT_SECRET=clave_secreta_larga_y_aleatoria_diferente_a_la_local

# Google Sheets API (CUENTA DE PRODUCCIÓN - NO la de prueba)
GOOGLE_CLIENT_EMAIL=service-account@proyecto-cliente.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[...]\n-----END PRIVATE KEY-----\n"
GOOGLE_PROJECT_ID=proyecto-cliente
SHEET_ID=ID_DE_LA_SHEET_REAL_DEL_CLIENTE
```

#### 3. Cuenta de Google Cloud (producción)
- **NO usar la cuenta de prueba** (`motoverso-test-502500`)
- Crear proyecto nuevo bajo el **Gmail real de HANNAS MOTOS**
- Crear cuenta de servicio nueva
- Compartir la **Sheet real del cliente** con el nuevo `client_email`
- Descargar JSON de credenciales nuevas
- Actualizar `.env` con datos de producción

#### 4. Dominio
- Configurar dominio en Hostinger
- Apuntar dominio a la aplicación Node.js
- Configurar SSL (HTTPS)

#### 5. Proceso de subida (ejemplo con FTP/Git)
```bash
# En el servidor de Hostinger (vía SSH o panel):
cd /home/u123456789/public_html/motoverso/backend
npm install
npm start
```

#### 6. Variables de entorno en Hostinger
- Algunos hosts no permiten archivo `.env`
- Alternativa: configurar variables de entorno en el panel de Hostinger (hPanel → Node.js → Environment Variables)
- O usar archivo `.env` pero asegurarse de que esté en `.gitignore` si usás git

### 7. Backup de MySQL
- Hostinger Business/Cloud incluye backups automáticos diarios
- Verificar en hPanel que estén activados
- Como respaldo adicional, crear script manual con `mysqldump` si es necesario

---

## 13. Próximos Pasos Recomendados

### Fase 1: Pruebas locales (AHORA)
1. ✅ Backend instalado y corriendo
2. ✅ Datos migrados a MySQL
3. ✅ API funcionando (login, servicios abiertos, buscar placa)
4. 🔲 Probar frontend completo (login → dashboard → guardar orden)
5. 🔲 Probar Socket.io (bloqueo en tiempo real)
6. 🔲 Probar sync a Google Sheets (escribir en Sheet de prueba)

### Fase 2: Preparación producción
7. 🔲 Crear cuenta Google Cloud con Gmail del cliente
8. 🔲 Compartir Sheet real con cuenta de servicio
9. 🔲 Exportar MySQL local e importar en Hostinger
10. 🔲 Actualizar `.env` con datos de producción

### Fase 3: Deploy
11. 🔲 Subir código a Hostinger
12. 🔲 Configurar dominio
13. 🔲 Probar todo en producción
14. 🔲 Entregar al cliente

---

## 14. Estado de Verificación del Backend (15 jul 2026)

### ✅ Rutas API verificadas

| Ruta | Método | Estado | Detalle |
|------|--------|--------|---------|
| `/api/login` | POST | ✅ OK | Devuelve JWT token válido |
| `/api/servicios/abiertos` | GET | ✅ OK | Devuelve servicios abiertos con JOIN clientes/vehiculos |
| `/api/servicios/buscar-placa` | POST | ✅ OK | Encuentra vehículo, cliente e historial |
| `/api/servicios/guardar` | POST | ⚠️ NO PROBADO | Pendiente prueba con datos reales |
| `/api/cierres/generar` | POST | ⚠️ NO PROBADO | Pendiente prueba con datos reales |

### ⚠️ Pendiente de verificar
- Socket.io (lock/unlock en tiempo real)
- Sync a Google Sheets (sync-sheets.js)
- Guardar servicio nuevo y actualizar existente
- Cierre diario con datos reales
- Responsive mobile-first en el frontend

---

## 13. Referencias Externas

- **Google Cloud Console:** https://console.cloud.google.com
- **XAMPP:** https://www.apachefriends.org
- **Hostinger:** Panel de control hPanel
- **Documentación mysql2:** https://github.com/sidorares/node-mysql2
- **Documentación Socket.io:** https://socket.io/docs/v4/

---

## 15. Sistema de Logs de Errores (NUEVO - 15 jul 2026)

### ¿Para qué sirve?
Guarda TODOS los errores de la app para poder debuggear en producción y en pruebas. Cuando algo falla, podemos ver exactamente qué pasó, cuándo, en qué ruta, y con qué datos.

### ¿Dónde guarda los errores?
1. **Archivo de texto:** `backend/logs/errores.log`
2. **Base de datos:** tabla `logs_errores` en MySQL

### ¿Qué guarda de cada error?
- Fecha y hora exacta
- Tipo de error (ERROR_DB, ERROR_CLIENT, ERROR_UNHANDLED)
- Ruta/API donde ocurrió
- Método HTTP (GET, POST, etc.)
- Mensaje del error
- Stack trace (línea de código que falló)
- Datos de la petición (body, query, params)
- Usuario que hizo la petición
- IP del cliente

### ¿Cómo usarlo?

**Ver logs en archivo:**
```bash
cd C:\MotoVerso\backend\logs
type errores.log
```

**Ver logs en MySQL (phpMyAdmin):**
```sql
SELECT * FROM logs_errores ORDER BY fecha DESC LIMIT 20;
```

**Ver últimos 10 errores:**
```sql
SELECT fecha, tipo, ruta, metodo, mensaje, usuario 
FROM logs_errores 
ORDER BY fecha DESC 
LIMIT 10;
```

**Buscar errores de una ruta específica:**
```sql
SELECT * FROM logs_errores 
WHERE ruta LIKE '%servicios%' 
ORDER BY fecha DESC;
```

### Tabla SQL de logs
```sql
CREATE TABLE logs_errores (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### Archivos del logger
- `backend/utils/logger.js` — Módulo de logging
- Modificado `backend/server.js` — Agrega middleware de logging
- Modificado `backend/routes/servicios.js` — Usa logger en errores

---

**Fin del contexto. Si se abre una nueva sesión, leer este archivo ANTES de continuar.**
