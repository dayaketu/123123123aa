# Tierra Tibia

Un mundo abierto, tranquilo y cálido para caminar, cantar y acompañarte de otros viajeros. Sin metas, sin puntos, sin prisa. Inspirado en la calma de *Journey* y en la ternura de los sitios que se sienten como un abrazo.

Corre en el navegador (escritorio y móvil), sin instalar nada. 100% propio: el mundo se genera con código, y el sonido se sintetiza (no hay archivos de audio ni de imagen).

## Qué hay dentro

- **Mundo infinito y procedural**: praderas, bosques, cerezos en flor, campos dorados, lavanda, lagos, mar, montañas con nieve. Es el mismo mundo para todas las personas.
- **Ciclo día y noche** (12 min por día): amanecer, atardecer rosado, estrellas, luciérnagas.
- **Tu zorrito de luz**: camina, trota, salta, **planea**, nada, se sienta. Eliges su color.
- **Cantar** (`E` o clic): suena una nota de una escala pentatónica; el pasto se ilumina en una onda, brotan flores, los animales responden.
- **Lugares sin misión**: faroles de piedra que se encienden, círculos de piedras que cantan, árboles viejos con campanillas, fogatas para sentarte, luces con un buen deseo.
- **Dejar una luz** (`L`): queda en el mundo para quien pase después, con un mensaje amable.
- **Compañía**: viajeros del mundo que caminan, descansan y a veces te acompañan; venados que se acercan si te sientas tranquilo.
- **Música generativa** que nunca se repite, viento, agua, pájaros de día, grillos de noche.
- **Foto** (`P`). Se guarda tu progreso (flores, luces, faroles) en el navegador.

## Probarlo en tu computadora

Necesita un servidor web local (los módulos no cargan desde `file://`):

```bash
python3 -m http.server 8000      # o: npx serve
# abre http://localhost:8000
```

Controles: `WASD` caminar · `Shift` correr · ratón mirar · `E`/clic cantar · `Espacio` saltar (mantén para planear) · `C` sentarte · `L` dejar una luz · `P` foto · `M` sonido. En el celular: izquierda caminar, derecha mirar, botones en pantalla.

## Hacerlo disponible (gratis)

Son archivos estáticos. Súbelos a cualquiera de estos (sin costo, con HTTPS):

- **Cloudflare Pages** o **Netlify**: conecta el repositorio, sin comando de build, directorio de salida `/`.
- **GitHub Pages**: este repo incluye `.github/workflows/pages.yml`; al hacer push a `main` se publica solo (activa Pages → "GitHub Actions" en Settings).
- Tu **VPS de DreamHost** también sirve: copia la carpeta a la raíz de un sitio.

## Que haya gente real (opcional, para después)

Sin servidor el juego funciona completo. Con el servidor de `server/` aparecen otras personas como zorritos (solo posición, canto y luces: **sin chat, sin cuentas, sin datos personales**, lo que evita casi todo el trabajo de moderación).

```bash
cd server && npm install && PORT=8787 node server.js
```

En el VPS: ponlo detrás de nginx o Caddy con TLS y proxy de WebSocket (`/tierra` → `localhost:8787`), déjalo corriendo con `pm2` o systemd, y en `config.js` pon `server: 'wss://tu-dominio.com/tierra'`. Variables útiles: `ALLOWED_ORIGINS=https://tu-dominio.com`, `MAX_PLAYERS=150`. Una instancia pequeña aguanta cientos de conexiones: el servidor solo retransmite.

## Monetización sencilla (sin romper la calma)

1. **Apoyo voluntario**: en `config.js` pon `support.url` (Ko-fi, Buy Me a Coffee, Patreon) y aparece un enlace discreto. Cero anuncios.
2. **Cosméticos**: colores y accesorios para el zorrito, estelas de luz, pétalos distintos. No dan ventaja (aquí no hay nada que ganar), solo ternura.
3. **"Plantar una luz que dura"**: las luces gratis se mezclan con las demás; una luz permanente en un lugar elegido (pago pequeño, tipo regalo o dedicatoria).
4. **Mundos temáticos** (otoño, nieve, desierto, mar) como paquetes.
5. **Versión de pago sin servidor compartido**: "mundo privado" para una familia o grupo de amigos.

## Ideas para seguir

- Cantar en grupo: si varias personas cantan cerca, se arma un acorde y brota algo grande (un árbol de luz).
- Eventos suaves: lluvia con arcoíris, aurora, lluvia de estrellas, una ballena de luz en el mar al atardecer.
- Estaciones que siguen el calendario real; nieve en invierno.
- Un *diario de camino*: un mapa que se dibuja solo con donde has caminado, y puedes descargar como imagen.
- Modo "respirar": una escena que guía 1-2 minutos de respiración (encaja con la intención de bienestar).
- Compartir una semilla o un lugar con un enlace ("ven a este rincón").
- Más animales: zorros pequeños que siguen a tu zorro, aves posadas, peces de luz, ballenas.
- Bajar peso en celulares antiguos (menos pasto, menos distancia) con un selector de calidad.

## Estructura

```
index.html · style.css · config.js     portada, estilos, ajustes (nombre, servidor, enlace de apoyo)
src/world.js       terreno, biomas, árboles, pasto, flores (determinista por semilla)
src/sky.js         cielo, sol/luna, estrellas, nubes, agua
src/player.js      tu zorrito y la cámara
src/landmarks.js   faroles, círculos, árboles viejos, fogatas, luces
src/fauna.js       mariposas, luciérnagas, pájaros, venados, partículas del aire
src/social.js      viajeros del mundo + cliente de red opcional
src/audio.js       música y sonidos sintetizados
src/fx.js · creatures.js · input.js · noise.js · main.js
server/            servidor de presencia opcional (Node + ws)
vendor/            three.js (licencia MIT incluida)
```

## Notas honestas

- Probado en Chromium sin GPU (software) y con simulaciones automáticas de física, red y servidor. **No está probado en un celular ni en una GPU real**: puede que haya que ajustar rendimiento (calidad ya baja automáticamente en pantallas táctiles).
- No pude abrir el sitio de referencia (la red del entorno lo bloqueó), así que el diseño parte de tu descripción, no de copiar nada.
- El nombre "Tierra Tibia" es provisional; cámbialo en `config.js`.
