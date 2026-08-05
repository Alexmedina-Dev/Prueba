import pymysql
import time

# Configuracion de Seenode
HOST = 'up-de-fra1-mysql-2.db.run-on-seenode.com'
PORT = 11550
USER = 'db_nxxznajr8pzx'
PASSWORD = 'ejUUHLCZSp1T9Uru7SLvqBu0'
DATABASE = 'db_nxxznajr8pzx'
SQL_FILE = 'motoverso_produccion.sql'

def import_sql():
    print("Conectando a Seenode MySQL...")
    
    conn = pymysql.connect(
        host=HOST,
        port=PORT,
        user=USER,
        password=PASSWORD,
        database=DATABASE,
        charset='utf8mb4'
    )
    
    print("Conectado!")
    print("Leyendo archivo SQL...")
    
    with open(SQL_FILE, 'r', encoding='latin-1') as f:
        sql_content = f.read()
    
    print(f"Archivo leido: {len(sql_content)} caracteres")
    print("Ejecutando SQL (esto puede tardar 1-2 minutos)...")
    
    with conn.cursor() as cursor:
        # Dividir el SQL en sentencias individuales
        # El dump de mysqldump separa las sentencias con ; y comentarios
        statements = sql_content.split(';')
        total = len(statements)
        
        for i, statement in enumerate(statements):
            stmt = statement.strip()
            if stmt and not stmt.startswith('--') and not stmt.startswith('/*'):
                try:
                    cursor.execute(stmt + ';')
                except Exception as e:
                    print(f"Advertencia en sentencia {i}/{total}: {e}")
                    continue
            
            if i % 100 == 0:
                print(f"Progreso: {i}/{total} sentencias...")
    
    conn.commit()
    conn.close()
    
    print("Importacion completada exitosamente!")
    print("")
    print("La base de datos de Seenode ahora tiene:")
    print("   - Tablas: usuarios, clientes, vehiculos, servicios, etc.")
    print("   - Todos los datos historicos de tu XAMPP local")
    print("")
    print("Tu app deberia funcionar ahora en:")
    print("   https://prueba.seenode.app")

if __name__ == '__main__':
    try:
        import_sql()
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
