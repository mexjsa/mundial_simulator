# Mundial 2026 Simulator & Predictions

Este repositorio contiene las predicciones de alta precisión, los reportes analíticos de simulación y un simulador web interactivo para la fase de grupos del Mundial 2026.

## 📋 Contenido del Proyecto

El proyecto está estructurado con los siguientes entregables y componentes clave:

1. **`Mundial 2026 (fase de grupos).xlsx`**: Quiniela de la fase de grupos completada en las celdas `B2:B73` utilizando la nomenclatura `L` (Local), `E` (Empate) y `V` (Visitante), con base en la simulación de mayor probabilidad.
2. **`Mundial 2026 - Reporte Maestro de Simulaciones.xlsx`**: Libro de Excel estilizado y detallado que recopila:
   - Desglose estadístico de los 72 partidos del grupo.
   - Puntos esperados promedio, diferencia de goles y probabilidad de clasificación a la Ronda de 32 para cada uno de los 48 equipos.
   - Probabilidades de cada equipo de alcanzar cada instancia eliminatoria (R32, R16, QF, SF, Final, Bronce, Plata, Oro).
3. **`Mundial 2026 - Metodologia de Prediccion.md`**: Documento metodológico y técnico que describe las fuentes de información (Football Meets Data), variables del modelo (Elo, Poisson xG, cuotas de mercado, ventaja geográfica), criterios de simulación (50,000 iteraciones Monte Carlo) y supuestos realizados.
4. **Aplicación Web Interactiva (`index.html`, `style.css`, `app.js`, `data.js`)**:
   - Una SPA (Single Page Application) responsiva y moderna.
   - **Visualizaciones Dinámicas**: Árbol de eliminación directo (Bracket) simétrico, tablas de posiciones de los 12 grupos y las tablas de carrera por la Bota de Oro y el Líder de Asistencias.
   - **Simulador en el Navegador**: Permite ingresar marcadores reales de partidos u outcomes predictores rápidos. Al presionar "Simular", un motor Monte Carlo en JavaScript corre de 1,000 a 5,000 iteraciones de forma instantánea para recalcular las posiciones del grupo, los mejores terceros y la llave eliminatoria.

---

## ⚡ Cómo Ejecutar la Aplicación Web

Dado que la aplicación web está desarrollada con tecnologías estándar y vanilla (HTML5, CSS3, JS), **no requiere instalación de dependencias ni compilación**.

Para ejecutarla:
1. Clona el repositorio.
2. Abre el archivo `index.html` directamente en tu navegador web de preferencia (doble clic o arrastrándolo a la ventana).
3. Opcionalmente, para evitar bloqueos del navegador por directivas locales de CORS, puedes ejecutar un servidor local rápido en la carpeta del proyecto:
   - En Python: `python -m http.server 8000` y accede a `http://localhost:8000`.
   - En Node.js: `npx serve` o `npm install -g live-server` y accede al puerto correspondiente.
