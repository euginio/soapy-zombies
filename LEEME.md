# Picnic Ants

English: [README.md](README.md)

Code tour (English): [GAME_GUIDE.md](GAME_GUIDE.md)

## ¿De qué se trata?

¡Defendé la comida de las hormigas! Las hormigas entran por los bordes de la bandeja y avanzan hacia la comida. Mové la bandeja para hacerlas caer: cada hormiga que cae suma un punto. Cada siete hormigas que caen aparece una más. La partida termina cuando se acaba la comida.

## Cómo jugar

1. Abrí el juego en [euginio.github.io/soapy-zombies](https://euginio.github.io/soapy-zombies).
2. Tocá la pantalla para comenzar. El juego intenta pasar a pantalla completa y jugar en horizontal.
3. Mové la bandeja según el dispositivo. La bandeja, las hormigas y la comida se inclinan en esa dirección; el fondo y el puntaje quedan fijos:
   - **Computadora:** usá las flechas del teclado para inclinarla en esa dirección.
   - **Celular o tableta:** incliná el dispositivo. El navegador debe tener acceso a los sensores; serví el juego por HTTPS (localhost también está permitido). Tocá **Re-center** mientras sostenés el dispositivo en el ángulo que quieras usar como posición neutra.
4. Evitá que las hormigas lleguen a la comida y hacelas caer de la bandeja. Tu puntaje y el récord se muestran en pantalla; el récord queda guardado en el navegador.

El juego requiere un navegador compatible con Chrome. **No es compatible con iPhone.**

## Ejecutar localmente

Se necesita Node.js y npm. Desde la carpeta del proyecto, ejecutá:

```sh
npm install
npm run dev
```

Vite abre `dev.html` para el desarrollo. El `index.html` de la raíz sigue siendo el punto de entrada de producción para GitHub Pages.

Para activar o desactivar los colores de depuración de las hormigas, cambiá `DEBUG_MODE` en `const/const.ts` y volvé a generar el bundle de producción.

## Ejecutar las comprobaciones y pruebas de navegador

Instalá una vez el navegador Chromium de Playwright. Luego ejecutá el chequeo de TypeScript, las pruebas unitarias de las reglas y las pruebas de navegador de producción y desarrollo:

```sh
npx playwright install chromium
npm run test:smoke
```
