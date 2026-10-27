# Dónde va mi transporte: servidor

Servidor sin dependencias (solo Node 18 o más). Sirve la página y guarda en memoria
las posiciones aproximadas (unos 100 m) que la gente comparte. Cada posición expira a los 60 s
y no se guarda ningún dato personal.

## Probar en tu computadora
    node server.js
Abre http://localhost:3000

## Publicarlo para que cualquiera lo use (ejemplo con Render)
1. Sube esta carpeta a un repositorio de GitHub.
2. En render.com crea un "Web Service" desde ese repositorio.
3. Build command: (vacío). Start command: `node server.js`.
4. Render te da un enlace https. Ábrelo en el celular y usa "Añadir a pantalla de inicio".

Nota: la ubicación del navegador solo funciona con https (o localhost).
