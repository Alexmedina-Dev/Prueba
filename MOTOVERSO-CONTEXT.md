# MotoVerso - Contexto del Sistema

> **Nota:** Este documento es para uso interno del equipo de desarrollo. 
> No contiene credenciales sensibles (PINs, claves API, contraseñas).
> Las credenciales se gestionan únicamente mediante variables de entorno (`.env`) 
> nunca commiteadas al repositorio.

---

## 🏗️ Arquitectura General

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Cliente   │────▶│   Backend    │────▶│   MySQL     │
│  (APP/)     │     │  (backend/)  │     │  (Datos)    │
└─────────────┘     └──────────────┘     └─────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │ Google Sheets│
                     │  (Backup)    │
                     └──────────────┘
```

**Stack:**
- Frontend: Vanilla JS + HTML (SPA simple)
- Backend: Node.js + Express
- Base de datos: MySQL
- Backup/Integración: Google Sheets API

---

## 📱 Secciones de la App (Frontend)

### 1. Header / Barra Superior
- Logo del taller
- Indicador de usuario logueado
- Botón "Cambiar Contraseña" (modal profesional)
- Botón "Cerrar Sesión"

### 2. Buscador Principal
- **Campo Placa:** Input con autocomplete de placas existentes
- **Botón Buscar:** Carga cliente + vehículo + historial de servicios
- **Botón Nueva Orden:** Limpia formulario para crear nueva orden (verifica que no exista orden abierta para esa placa)
- **Botón Cancelar:** Limpia todo el formulario y vuelve a estado inicial
- Lógica: Si la placa tiene orden abierta, carga esa orden. Si no, permite crear nueva.

### 3. Datos del Cliente
- Campos: Cédula, Nombre, Teléfono, Dirección, Correo
- Comportamiento: Si el cliente existe, carga sus datos. Si no, permite crear nuevo.
- Campo oculto: `idServicio` (ID del sistema anterior para trazabilidad)

### 4. Datos del Vehículo
- Campos: Placa, Marca, Modelo, Año, Color, Kilometraje, Tipo
- Comportamiento: Si existe con esa placa, carga datos. Si no, permite crear nuevo.
- Campo oculto: `idServicio` (ID del sistema anterior)

### 5. Servicio / Orden de Trabajo
- Campos: Técnico (select), Fecha Entrada, Fecha Salida, Estado (Abierta/Cerrada)
- Botón **Guardar Servicio:** Valida campos y guarda cliente + vehículo + servicio
- Lógica de duplicados: Si la placa ya tiene orden abierta, muestra warning y carga la existente en lugar de crear nueva.

### 6. Detalle de Servicios (Tabla Dinámica)
- Tabla editable con columnas: Tipo (Mano de Obra / Repuesto / Terceros / Otro), Descripción, Cantidad, Valor Unitario, Subtotal
- **Botón Agregar Fila:** Añade nueva línea de detalle
- **Botón Eliminar Fila:** Quita la fila seleccionada
- **Botón Guardar Detalle:** Persiste los cambios en MySQL
- Cálculo automático: Cantidad × Valor Unitario = Subtotal (en tiempo real)
- Totales: Suma total al pie de la tabla

### 7. Botones de Acción Rápida (Después de guardar servicio)
- **Nueva Búsqueda:** Limpia todo para buscar otra placa
- **Nueva Orden:** Mantiene cliente/vehículo pero crea nueva orden de servicio
- **Cerrar Servicio:** Finaliza la orden (marca como entregada, pide confirmación con modal profesional)

### 8. Cierre Diario (Sección Restringida)
- **Visibilidad:** Solo visible para usuarios autorizados (Nury, Don Mauricio, Developer)
- **Select Mecánico:** Lista de técnicos para filtrar
- **Input Fecha:** Fecha del cierre (default: hoy)
- **Botón Generar Cierre:** 
  - Paso 1: Modal de confirmación profesional (¿Está seguro?)
  - Paso 2: Modal de PIN de seguridad (4 dígitos)
  - Lógica backend: Busca servicios con estado="Cerrado", fecha_salida=fecha_seleccionada, técnico=seleccionado
  - Suma SOLO "Mano de Obra" (excluye Terceros)
  - Resultado: Cantidad de motos entregadas + Total Mano de Obra
- **Nota:** El cierre diario NO cierra órdenes abiertas. Es un reporte de lo YA terminado.

### 9. Administración de Mecánicos (Sección Developer-only)
- **Visibilidad:** Solo para `role === 'developer'` o email del developer
- **Input Nuevo Mecánico:** Agrega técnico al select global
- **Botón Agregar:** Añade a la lista
- **Botón Eliminar:** Quita técnico seleccionado (con confirmación modal profesional)
- **Nota:** Los mecánicos se almacenan en localStorage del navegador (lista estática compartida por sesión)

### 10. Historial de Servicios (Panel Inferior)
- Lista de servicios previos del cliente/vehículo
- Muestra: Fecha, Técnico, Estado, Total
- Click en item: Carga esa orden completa para edición
- Diferenciación visual: Órdenes abiertas vs cerradas

---

## 🔐 Sistema de Seguridad y Permisos

### Roles de Usuario
| Rol | Email típico | Permisos |
|-----|-------------|----------|
| Admin (Dueños) | `repuestoshannasmotos@gmail.com`, `motoversotaller@gmail.com` | Cierre diario, full access |
| Developer | `alexandermedi53h@gmail.com` | Admin mecánicos, cierre diario, debugging |
| Mecánico | Varios | Crear/editar órdenes, ver historial |

### Verificaciones de Permiso
- `verificarPermisoCierre()`: Habilita sección de cierre diario
- `esDeveloper()`: Habilita controles de administración de mecánicos
- **PIN de cierre:** 4 dígitos conocido solo por dueños (configurado en backend, no en frontend)

### Cambio de Contraseña (Obligatorio)
- Todos los usuarios excepto developer deben cambiar contraseña en primer login
- Modal de cambio de contraseña con generador automático de contraseña segura
- Validación: mínimo 8 caracteres

---

## 🔄 Flujo de Datos (Backend)

### Endpoints Principales
```
POST   /api/auth/login           → Login, retorna JWT + user info
POST   /api/auth/change-password → Cambio de contraseña
GET    /api/clientes/:id         → Obtener cliente por cédula
POST   /api/clientes             → Crear/actualizar cliente
GET    /api/vehiculos/:placa     → Obtener vehículo por placa
POST   /api/vehiculos            → Crear/actualizar vehículo
POST   /api/servicios            → Crear/actualizar servicio
GET    /api/servicios/:id        → Obtener servicio con detalles
POST   /api/servicios/:id/close  → Cerrar servicio (marcar entregado)
POST   /api/servicios/:id/detalle→ Guardar detalles de servicio
POST   /api/cierres/generar      → Generar cierre diario (reporte)
```

### Lógica de Cierre Diario (Backend)
```sql
1. Recibir: fecha, tecnico
2. Buscar servicios:
   SELECT * FROM servicios 
   WHERE estado = 'Cerrado' 
     AND DATE(fecha_salida) = ?
     AND tecnico = ?
3. Sumar Mano de Obra:
   SELECT SUM(subtotal) FROM detalle_servicios 
   WHERE idServicio IN (...) AND tipo = 'Mano de Obra'
4. Insertar/Actualizar en cierres_diarios:
   INSERT ... ON DUPLICATE KEY UPDATE ...
5. Sincronizar a Google Sheets (encolado, no bloqueante)
```

---

## 📊 Google Sheets Integration

### Hojas del Spreadsheet
1. **Clientes** → Copia de tabla `clientes`
2. **Vehículos** → Copia de tabla `vehiculos`
3. **Servicios** → Copia de tabla `servicios`
4. **Detalle_Servicios** → Copia de tabla `detalle_servicios`
5. **Cierres Diarios** → Copia de tabla `cierres_diarios`
6. **GENERAR FACTURA** → Tabla con fórmulas QUERY para lookup por placa

### Sincronización
- Toda escritura en MySQL encola una sincronización a Google Sheets
- La sincronización es asíncrona (no bloquea respuesta al usuario)
- Si falla Google Sheets, el dato ya está seguro en MySQL

---

## 🗄️ Estructura de Base de Datos (MySQL)

### Tablas Principales
- `clientes` (id, cedula, nombre, telefono, direccion, correo, idServicio)
- `vehiculos` (id, placa, marca, modelo, ano, color, kilometraje, tipo, idServicio, cedula_cliente)
- `servicios` (idServicio, cedula_cliente, placa, tecnico, fecha_entrada, fecha_salida, estado, total, created_at, updated_at)
- `detalle_servicios` (id, idServicio, tipo, descripcion, cantidad, valor_unitario, subtotal)
- `cierres_diarios` (idCierre, fecha, tecnico, cantidad_servicios, total_facturado)
- `cierre_servicios` (idCierre, idServicio) - Relación muchos a muchos
- `usuarios` (id, nombre, email, password_hash, role, debe_cambiar_password)

---

## 🚀 Despliegue y Configuración

### Variables de Entorno (`.env`)
```
DB_HOST=      → Host MySQL (Seenode u otro proveedor)
DB_USER=      → Usuario MySQL
DB_PASSWORD=  → Contraseña MySQL
DB_NAME=      → Base de datos
JWT_SECRET=   → Clave secreta para tokens JWT
GOOGLE_CLIENT_EMAIL=     → Service Account de Google Cloud
GOOGLE_PRIVATE_KEY=      → Clave privada (multilinea)
SHEET_ID=                → ID del Google Sheet de producción
```

### Notas de Seguridad para Deploy
- **NUNCA** commitear `.env` al repo
- **NUNCA** commitear credenciales de Google Cloud (archivo JSON)
- El backend Express sirve el frontend estático desde la carpeta `APP/`
- En producción HTTPS, manejar CORS apropiadamente

---

## 📋 Checklist de Funcionalidades

- [x] Login con JWT
- [x] Cambio de contraseña obligatorio (primer login)
- [x] Buscador de placas con autocomplete
- [x] Crear/Editar cliente y vehículo
- [x] Crear/Editar orden de servicio
- [x] Tabla dinámica de detalles con cálculos
- [x] Cerrar orden (marcar como entregada)
- [x] Cierre diario por mecánico (reporte puro)
- [x] PIN de seguridad para cierre
- [x] Control de mecánicos (solo developer)
- [x] Sincronización a Google Sheets
- [x] Modal de confirmación profesional (reemplaza confirm nativo)
- [x] Modal de PIN profesional (reemplaza prompt nativo)
- [x] Prevención de órdenes duplicadas abiertas
- [x] Historial de servicios por cliente/vehículo
