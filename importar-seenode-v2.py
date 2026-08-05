#!/usr/bin/env python3
"""
Importa dump SQL de XAMPP/MariaDB a Seenode MySQL.
Parsea el archivo .sql, extrae CREATE TABLE e INSERT, y los ejecuta por chunks.

Uso: python importar-seenode-v2.py
"""

import re
import sys
import time
import pymysql
from collections import OrderedDict

# ── Configuración Seenode ──────────────────────────────────────────
DB_CONFIG = {
    "host": "up-de-fra1-mysql-2.db.run-on-seenode.com",
    "port": 11550,
    "user": "db_nxxznajr8pzx",
    "password": "ejUUHLCZSp1T9Uru7SLvqBu0",
    "database": "db_nxxznajr8pzx",
    "charset": "utf8mb4",
}

SQL_DUMP = r"C:\MotoVerso\motoverso_produccion.sql"
CHUNK_SIZE = 500

# ── Colores para consola ────────────────────────────────────────────
class C:
    OK = "\033[92m"
    WARN = "\033[93m"
    ERR = "\033[91m"
    BOLD = "\033[1m"
    DIM = "\033[2m"
    RESET = "\033[0m"


def log(msg, color=""):
    print(f"{color}{msg}{C.RESET}")


def parse_sql_dump(filepath):
    """Lee el dump SQL y extrae CREATE TABLE e INSERT statements."""
    log(f"Leyendo dump: {filepath}", C.DIM)

    with open(filepath, "rb") as f:
        raw = f.read()

    file_size_kb = len(raw) / 1024
    log(f"  Tamanio: {file_size_kb:.0f} KB", C.DIM)

    # Detectar encoding: UTF-16 LE si empieza con FF FE
    if raw[:2] == b"\xff\xfe":
        content = raw.decode("utf-16")
        log("  Encoding: UTF-16 LE detectado", C.DIM)
    else:
        content = raw.decode("latin-1")
        log("  Encoding: latin-1", C.DIM)

    tables = OrderedDict()

    # ── Extraer CREATE TABLE statements ──
    log("  Buscando CREATE TABLE...", C.DIM)
    create_pattern = re.compile(
        r"CREATE TABLE\s+`(\w+)`\s*\(", re.IGNORECASE
    )
    for m in create_pattern.finditer(content):
        table_name = m.group(1)
        start = m.start()
        # Encontrar el paréntesis de cierre balanceado
        depth = 0
        end_pos = m.end()
        for idx in range(m.end() - 1, min(m.end() + 5000, len(content))):
            ch = content[idx]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0:
                    semi = content.find(";", idx)
                    if semi == -1:
                        semi = idx + 1
                    create_stmt = content[start : semi + 1]
                    if table_name not in tables:
                        tables[table_name] = {}
                    tables[table_name]["create"] = create_stmt
                    break

    log(f"  Tablas con CREATE: {list(tables.keys())}", C.DIM)

    # ── Extraer INSERT statements ──
    log("  Buscando INSERT INTO...", C.DIM)
    insert_pattern = re.compile(
        r"INSERT INTO\s+`(\w+)`\s+VALUES\s*", re.IGNORECASE
    )
    for m in insert_pattern.finditer(content):
        table_name = m.group(1)
        insert_start = m.start()
        val_start = m.end()

        # Encontrar el final del INSERT (paréntesis balanceado + punto y coma)
        depth = 0
        end_pos = val_start
        for idx in range(val_start, len(content)):
            ch = content[idx]
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth == 0 and idx + 1 < len(content) and content[idx + 1] == ";":
                    end_pos = idx + 2
                    break

        insert_text = content[insert_start:end_pos]

        if table_name not in tables:
            tables[table_name] = {}
        tables[table_name]["insert"] = insert_text

    for t, info in tables.items():
        has_create = "create" in info
        has_insert = "insert" in info
        insert_size = len(info.get("insert", ""))
        log(f"  {t}: CREATE={'OK' if has_create else 'FALTA'}, INSERT={'OK' if has_insert else 'FALTA'} ({insert_size} chars)", C.DIM)

    return tables


def count_insert_rows(insert_text):
    """Cuenta filas en un INSERT statement."""
    # Buscar la parte VALUES ...
    m = re.search(r"VALUES\s*", insert_text, re.IGNORECASE)
    if not m:
        return 0
    values_part = insert_text[m.end() :]
    depth = 0
    count = 0
    for ch in values_part:
        if ch == "(":
            if depth == 0:
                count += 1
            depth += 1
        elif ch == ")":
            depth -= 1
    return count


def chunk_insert_values(insert_text, chunk_size):
    """Divide un INSERT en chunks más pequeños."""
    m = re.search(r"(INSERT INTO\s+`\w+`\s+VALUES\s*)", insert_text, re.IGNORECASE)
    if not m:
        return [insert_text]

    prefix = m.group(1)
    values_start = m.end()

    # Extraer todas las filas individuales
    rows = []
    depth = 0
    row_start = values_start

    for idx in range(values_start, len(insert_text)):
        ch = insert_text[idx]
        if ch == "(":
            if depth == 0:
                row_start = idx
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                rows.append(insert_text[row_start : idx + 1])

    if not rows:
        return [insert_text]

    # Dividir en chunks
    chunks = []
    for i in range(0, len(rows), chunk_size):
        chunk_rows = rows[i : i + chunk_size]
        chunk_sql = prefix + ",".join(chunk_rows) + ";"
        chunks.append((chunk_sql, len(chunk_rows)))

    return chunks


def get_existing_tables(cursor):
    """Obtiene las tablas existentes en la base de datos."""
    cursor.execute("SHOW TABLES")
    return [row[0] for row in cursor.fetchall()]


def get_table_columns(cursor, table_name):
    """Obtiene las columnas de una tabla."""
    cursor.execute(f"SHOW COLUMNS FROM `{table_name}`")
    return [row[0] for row in cursor.fetchall()]


def main():
    log("=" * 60, C.BOLD)
    log("  IMPORTADOR MOTOVERSO -> Seenode MySQL", C.BOLD)
    log("=" * 60, C.BOLD)
    print()

    # ── 1. Parsear el dump ──
    log("[1/4] Parseando archivo SQL dump...", C.BOLD)
    tables = parse_sql_dump(SQL_DUMP)
    print()

    if not tables:
        log("No se encontraron tablas en el dump.", C.ERR)
        sys.exit(1)

    # ── 2. Conectar a Seenode ──
    log("[2/4] Conectando a Seenode MySQL...", C.BOLD)
    log(f"  Host: {DB_CONFIG['host']}:{DB_CONFIG['port']}", C.DIM)
    log(f"  DB:   {DB_CONFIG['database']}", C.DIM)

    try:
        conn = pymysql.connect(**DB_CONFIG, connect_timeout=30)
        cursor = conn.cursor()
        log("  Conectado OK", C.OK)
    except Exception as e:
        log(f"  ERROR de conexion: {e}", C.ERR)
        sys.exit(1)
    print()

    # ── 3. Verificar tablas existentes ──
    log("[3/4] Verificando tablas existentes...", C.BOLD)
    existing = get_existing_tables(cursor)
    log(f"  Tablas actuales en Seenode: {existing}", C.DIM)

    for t in tables:
        if t in existing:
            log(f"  {t}: Ya existe, sera recreada", C.WARN)
        else:
            log(f"  {t}: No existe, sera creada", C.OK)
    print()

    # ── 4. Ejecutar statements ──
    log("[4/4] Ejecutando statements...", C.BOLD)

    total_tables = len(tables)
    success_count = 0
    error_count = 0
    table_stats = {}

    for i, (table_name, info) in enumerate(tables.items(), 1):
        log(f"\n{'─' * 50}", C.DIM)
        log(f"  Tabla {i}/{total_tables}: {table_name}", C.BOLD)

        try:
            # ── DROP si existe ──
            if table_name in existing:
                log(f"  DROP TABLE IF EXISTS {table_name}...", C.DIM)
                cursor.execute(f"DROP TABLE IF EXISTS `{table_name}`")
                conn.commit()

            # ── CREATE TABLE ──
            if "create" in info:
                log(f"  CREATE TABLE {table_name}...", C.DIM)
                cursor.execute(info["create"])
                conn.commit()
                log(f"  CREATE TABLE OK", C.OK)
            else:
                log(f"  Sin CREATE TABLE, saltando...", C.WARN)
                continue

            # ── INSERT data ──
            if "insert" in info:
                total_rows = count_insert_rows(info["insert"])
                log(f"  INSERT: {total_rows} filas a importar...", C.DIM)

                chunks = chunk_insert_values(info["insert"], CHUNK_SIZE)
                log(f"  Dividido en {len(chunks)} chunks de ~{CHUNK_SIZE} filas", C.DIM)

                imported_rows = 0
                skipped_rows = 0

                for chunk_idx, (chunk_sql, chunk_rows) in enumerate(chunks, 1):
                    try:
                        cursor.execute(chunk_sql)
                        conn.commit()
                        imported_rows += chunk_rows
                        if len(chunks) > 1:
                            log(f"    Chunk {chunk_idx}/{len(chunks)}: +{chunk_rows} filas (total: {imported_rows})", C.DIM)
                    except pymysql.err.IntegrityError as e:
                        conn.rollback()
                        if "Duplicate entry" in str(e):
                            skipped_rows += chunk_rows
                            log(f"    Chunk {chunk_idx}: Duplicados omitidos ({chunk_rows} filas)", C.WARN)
                        else:
                            log(f"    Chunk {chunk_idx}: IntegrityError: {e}", C.ERR)
                            error_count += 1
                    except Exception as e:
                        conn.rollback()
                        log(f"    Chunk {chunk_idx}: Error: {e}", C.ERR)
                        error_count += 1

                table_stats[table_name] = {"imported": imported_rows, "skipped": skipped_rows, "total": total_rows}
                log(f"  RESULTADO: {imported_rows} importadas, {skipped_rows} duplicadas omitidas de {total_rows}", C.OK)
                success_count += 1
            else:
                log(f"  Sin datos INSERT", C.WARN)
                table_stats[table_name] = {"imported": 0, "skipped": 0, "total": 0}
                success_count += 1

        except Exception as e:
            log(f"  ERROR GENERAL en {table_name}: {e}", C.ERR)
            conn.rollback()
            error_count += 1
            table_stats[table_name] = {"imported": 0, "skipped": 0, "total": 0, "error": str(e)}

    # ── Resumen final ──
    print()
    log("=" * 60, C.BOLD)
    log("  RESUMEN FINAL", C.BOLD)
    log("=" * 60, C.BOLD)

    total_imported = 0
    total_skipped = 0

    for table_name, stats in table_stats.items():
        imp = stats.get("imported", 0)
        skip = stats.get("skipped", 0)
        tot = stats.get("total", 0)
        err = stats.get("error")
        total_imported += imp
        total_skipped += skip

        if err:
            status = f"{C.ERR}ERROR{C.RESET}"
            detail = err[:60]
        elif imp > 0 or skip > 0:
            status = f"{C.OK}OK{C.RESET}"
            detail = f"{imp} importadas, {skip} duplicadas de {tot}"
        else:
            status = f"{C.WARN}VACIA{C.RESET}"
            detail = f"{tot} filas en dump"

        log(f"  {table_name:25s} [{status}] {detail}")

    print()
    log(f"  Total importadas:  {total_imported}", C.OK)
    log(f"  Duplicadas:        {total_skipped}", C.WARN)
    log(f"  Errores:           {error_count}", C.ERR if error_count else C.OK)

    # Verificar estado final
    final_tables = get_existing_tables(cursor)
    log(f"\n  Tablas en Seenode ahora: {final_tables}", C.DIM)

    cursor.close()
    conn.close()

    log("\n¡Importación completada!", C.OK)
    return 0 if error_count == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
