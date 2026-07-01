# Regla de Estado ("¿Cómo vamos?")

Cada vez que el usuario pregunte "¿Cómo vamos?" o solicite un estado general de la jornada, debes ejecutar la siguiente secuencia:

1. **Actualiza los resultados de FMD**: Ejecuta el scraping del simulador para obtener los últimos marcadores oficiales de los partidos recién terminados.
2. **Quiniela Chalo (Vigente hasta el 30 de junio)**: Inyecta los resultados en `Mundial 2026 Seguimiento.xlsx` y genera el cálculo de posiciones del Top 10 para verificar si el usuario mantiene su liderato y ventaja. 
3. **Quiniela Jasmany (Fase de Eliminatorias)**:
   - Utiliza las credenciales (`jsamex@icloud.com` / `Venezuela2026`) para conectarte vía script a `https://quiniela-eliminatorias-2026.vercel.app/login`.
   - Consulta el estado actual de puntos/posiciones de esta nueva fase.
4. **Automatización Predictiva (Auto-Fill Jasmany)**: 
   - Durante la conexión a Vercel, evalúa los próximos partidos que no estén bloqueados. 
   - Utiliza el motor predictivo (tomando en cuenta el historial, ELO y la regla de que SÓLO cuentan los 90 minutos) para ajustar e inyectar automáticamente los marcadores exactos (ej. cazando empates estratégicos). 
   - Debes dar clic en "Guardar" y confirmar el éxito de la transacción.
5. **Genera el Reporte Final**: Entrégale al usuario un resumen limpio y motivador. Muestra:
   - Su estatus final en Chalo (si es antes del 30 de junio).
   - Su posición actual en el torneo de Eliminatorias Jasmany.
   - Qué resultados recientes se dieron.
   - **CRÍTICO:** Enumera explícitamente los marcadores exactos que pre-llenaste/inyectaste en la plataforma para los siguientes partidos (lee la salida del script `prefill_jasmany.py` para obtener esta lista).

*Nota técnica: Puedes utilizar o adaptar el script maestro `scratch/informe_como_vamos.py` y el script de automatización `scratch/prefill_jasmany.py` para cumplir con esta regla.*
