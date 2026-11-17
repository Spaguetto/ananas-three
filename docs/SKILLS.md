# Skills instaladas en el proyecto

Instaladas mediante `npx --yes skills add`, con alcance de proyecto, agente `codex` y `--copy`. Ubicación: `.agents/skills/`. Fuentes y huellas registradas en `skills-lock.json`. Estarán disponibles para su descubrimiento en el siguiente turno.

| Skill | Procedencia | Uso |
| --- | --- | --- |
| frontend-design | [anthropics/skills](https://github.com/anthropics/skills) | Dirección artística y diseño de interfaces con identidad propia |
| web-design-guidelines | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Revisión de usabilidad y accesibilidad |
| vercel-react-best-practices | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Rendimiento y patrones de React, aplicando solo lo pertinente a Vite |
| react-flow | [framara/react-flow-skill](https://github.com/framara/react-flow-skill) | Nodos, aristas y distribución. Skill comunitaria, no publicada por xyflow |
| supabase-postgres-best-practices | [supabase/agent-skills](https://github.com/supabase/agent-skills) | Esquemas, consultas e índices cuando se implemente PostgreSQL |

La skill PostgreSQL se reserva para esa etapa y no obliga a usar Supabase ni servicios alojados. No sustituye las reglas genealógicas y de evidencia de `MODELO-DE-DATOS.md`. SQLite no debe recibir SQL específico de PostgreSQL por copiar recomendaciones sin adaptación.

Comandos usados:

```powershell
npx.cmd --yes skills add anthropics/skills --skill frontend-design --agent codex --copy --yes
npx.cmd --yes skills add vercel-labs/agent-skills --skill web-design-guidelines vercel-react-best-practices --agent codex --copy --yes
npx.cmd --yes skills add framara/react-flow-skill --skill react-flow --agent codex --copy --yes
npx.cmd --yes skills add supabase/agent-skills --skill supabase-postgres-best-practices --agent codex --copy --yes
```

Estos comandos siguen las ramas que resuelva el instalador al ejecutarse. El lockfile documenta las huellas obtenidas, no promete que una reinstalación futura desde una rama móvil descargue exactamente los mismos bytes. Versionar las copias locales junto con el lockfile al inicializar el repositorio y revisar actualizaciones antes de adoptarlas.

Instalar una skill agrega instrucciones de trabajo al agente; no instala las bibliotecas de la aplicación ni garantiza por sí solo pruebas o calidad. Las reglas y los criterios de aceptación del proyecto siguen siendo la referencia específica.
