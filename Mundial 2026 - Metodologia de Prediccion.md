# Documento Metodológico: Predicción del Mundial 2026 (Fase de Grupos)

Este documento describe la metodología, las fuentes de información, las variables y los supuestos estadísticos utilizados para generar los pronósticos de los 72 partidos de la fase de grupos del Mundial 2026, contenidos en el archivo `Mundial 2026 (fase de grupos).xlsx`.

---

## 1. Fuentes de Información y Plataforma Utilizada
La fuente primaria de información y el motor de simulación provienen de la plataforma analítica de fútbol **Football Meets Data** (disponible en `https://football-md.com`). 

Para este análisis:
- Se accedió utilizando una cuenta con suscripción de nivel superior.
- Se configuró y ejecutó una simulación Monte Carlo masiva de **50,000 iteraciones** del torneo completo.
- Se recopilaron los datos estructurados en formato JSON directamente de la API interna del sistema (`api.football-md.com/api/v1`), garantizando la máxima fidelidad y precisión en la captura de probabilidades basales para cada partido de la fase de grupos.

---

## 2. Variables Consideradas en el Modelo Estadístico
El motor de predicción de Football Meets Data utiliza una metodología mixta y moderna que combina variables históricas y de expectativa actual:

1. **Clasificación Elo de Selecciones Nacionales**: 
   Calificación dinámica basada en resultados históricos acumulados, ajustada por la importancia del partido, la diferencia de goles y la fortaleza relativa del rival.
2. **Prioridades del Mercado de Apuestas (Betting-Market Priors)**:
   Se incorpora la probabilidad implícita en las cuotas de las principales casas de apuestas internacionales en tiempo real. Esto permite capturar factores cualitativos recientes (lesiones de jugadores clave, cambios en el cuerpo técnico, convocatorias definitivas y localía geográfica) que el Elo histórico tarda en reflejar.
3. **Modelos de Goles Esperados (Poisson xG)**:
   Las fortalezas ofensivas y defensivas de cada equipo se traducen en un valor de Goles Esperados (xG) para el encuentro, permitiendo modelar el promedio de goles que un equipo anotaría frente a su oponente.
4. **Ventaja Geográfica y Efecto de Localía**:
   El modelo asigna factores de ventaja por localía a los países anfitriones (Estados Unidos, México y Canadá) y pondera la proximidad territorial y el apoyo del público para las selecciones de las mismas confederaciones.

---

## 3. Criterio de Simulación Monte Carlo
Una única simulación analítica de fútbol es insuficiente debido a la naturaleza estocástica del deporte (azar, tarjetas rojas, lesiones fortuitas, errores arbitrales). Por ello:
- **Volumen de Simulación**: Se corrió un proceso de **50,000 simulaciones** del torneo entero de forma paralela en la nube.
- **Simulación del Partido**: Cada partido es simulado de manera independiente en cada iteración del torneo. El resultado del partido (Victoria del Local, Empate o Victoria del Visitante) se determina a partir de las tasas de Goles Esperados ($xG$) mediante distribuciones de probabilidad Poisson bivariadas independientes.
- **Flujo del Torneo**: Para cada una de las 50,000 iteraciones, se registran los resultados de los partidos, se computan las tablas de posiciones de los 12 grupos aplicando los criterios de desempate oficiales de la FIFA (puntos, diferencia de goles, goles anotados) y se determina cuáles son las 8 mejores terceras selecciones nacionales que clasifican a la fase de dieciseisavos de final.

---

## 4. Procedimiento de Cálculo
Las probabilidades individuales informadas en este reporte para cada partido se calculan mediante la frecuencia de ocurrencia observada en las 50,000 simulaciones del torneo:

$$\text{Probabilidad de Victoria Local } (P_L) = \frac{\text{Simulaciones donde gana el Local}}{50,000}$$

$$\text{Probabilidad de Empate } (P_E) = \frac{\text{Simulaciones donde empatan}}{50,000}$$

$$\text{Probabilidad de Victoria Visitante } (P_V) = \frac{\text{Simulaciones donde gana el Visitante}}{50,000}$$

Por definición de espacio muestral exhaustivo y mutuamente excluyente, estas probabilidades suman siempre exactamente el 100%:

$$P_L + P_E + P_V = 1.0 \quad (100\%)$$

---

## 5. Supuestos Realizados
Durante el diseño y análisis estadístico se asumieron las siguientes premisas:
1. **Consistencia de Rendimiento**: Se asume que el nivel de los equipos (ratings de Elo y cuotas de mercado) permanece relativamente estable durante la corta duración de la fase de grupos.
2. **Independencia en los Grupos**: Los resultados de los partidos en una jornada no influyen físicamente en el rendimiento físico o motivación del equipo en la jornada siguiente (ej. no se modela el "descanso de jugadores" en la Jornada 3 en caso de estar clasificados con anticipación).
3. **Distribución de Goles de Poisson**: La anotación de goles sigue una distribución de Poisson, donde la probabilidad de que un equipo anote $k$ goles en un partido está dada por:

   $$P(X = k) = \frac{\lambda^k e^{-\lambda}}{k!}$$

   Donde $\lambda$ representa los Goles Esperados ($xG$) del equipo en ese partido específico.

---

## 6. Método para la Selección de Pronósticos Definitivos
Para completar las celdas B2:B73 del archivo de quiniela (`Mundial 2026 (fase de grupos).xlsx`), se aplicó el criterio de **Máxima Probabilidad de Resultado Simple (Simple Outcome Mode)**:

- Se comparan las tres probabilidades calculadas para el encuentro: $P_L$, $P_E$ y $P_V$.
- El resultado que presente el mayor porcentaje estadístico entre las tres alternativas es seleccionado como el pronóstico oficial del partido.
- Nomenclatura utilizada en la columna **Resultado**:
  - `L` si $P_L = \max(P_L, P_E, P_V)$ (Victoria del Local).
  - `E` si $P_E = \max(P_L, P_E, P_V)$ (Empate).
  - `V` si $P_V = \max(P_L, P_E, P_V)$ (Victoria del Visitante).

*Nota: Este criterio busca maximizar la tasa de aciertos esperada en términos probabilísticos en un esquema de quiniela simple de una sola opción por partido.*
