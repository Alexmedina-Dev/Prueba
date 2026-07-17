-- MotoVerso: Add missing indexes for performance
-- Created: 2026-07-16

-- Index on servicios.placa for fast lookup by license plate
ALTER TABLE servicios ADD INDEX idx_placa (placa);

-- Index on servicios.estado for fast filtering (Abierto vs Cerrado)
ALTER TABLE servicios ADD INDEX idx_estado (estado);

-- Composite index for the most common query: abiertos ordered by fecha
ALTER TABLE servicios ADD INDEX idx_estado_fecha (estado, fecha);

-- Index on detalle_servicios.idServicio for fast joins
ALTER TABLE detalle_servicios ADD INDEX idx_idservicio (idServicio);

-- Composite index for cierre diario queries (filter by tipo + idServicio)
ALTER TABLE detalle_servicios ADD INDEX idx_idservicio_tipo (idServicio, tipo);

-- Index on clientes.cedula (already PK, but ensure)
-- Index on vehiculos.placa (already PK, but ensure)

-- Index on cierres_diarios for fecha + tecnico lookups
ALTER TABLE cierres_diarios ADD INDEX idx_fecha_tecnico (fecha, tecnico);
