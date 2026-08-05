import re

with open(r'C:\MotoVerso\backend\.env', 'r', encoding='utf-8') as f:
    content = f.read()

# Extraer GOOGLE_PRIVATE_KEY del .env
match = re.search(r'GOOGLE_PRIVATE_KEY="(.*?)"\s*$', content, re.DOTALL)
if match:
    key = match.group(1).strip().strip('"').strip("'")
    key = key.replace('\\n', '\n')
    
    print('=== CLAVE LIMPIA (copia esto exactamente en Seenode) ===')
    print()
    print(key)
    print()
    print('=== INICIA CON:', repr(key[:50]))
    print('=== TERMINA CON:', repr(key[-50:]))
    print('=== TIENE SALTOS REALES:', '\n' in key)
    print('=== TIENE COMILLAS:', '"' in key or "'" in key)
else:
    print('No se encontro GOOGLE_PRIVATE_KEY')
