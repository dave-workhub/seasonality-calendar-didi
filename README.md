# Seasonality Calendar — CASA & Indigo

Calendario de festivos, semana ISO, paycheck/bono y eventos (conciertos, school break, back to school, high-demand celebrations) por ciudad, para los clusters **CASA** e **Indigo**.

Reemplaza el antiguo `calendario-festivos.html` estático. Ahora es una app Next.js con:
- **Frontend**: Next.js 16 (App Router) + Tailwind
- **Backend**: Route Handler (`/api/calendar-events`) que lee de Supabase
- **Base de datos**: Supabase (Postgres) — tabla `calendar_events` (curada: conciertos, school break, etc.) + `budget_weekly` / `demand_weekly` (placeholders para Fase 4)
- **Festivos oficiales**: calculados algorítmicamente por país (no dependen de la base de datos) — CO, CL, PE, MX, CR, EC

## Fase 1 — Setup local (ya hecho)
El scaffold, el motor de festivos, los dropdowns de cluster→ciudad con selección persistida (localStorage), y la API de eventos ya están implementados y verificados corriendo localmente.

## Fase 1 — Deploy (pasos para Juan)

### 1. Crear el repo en GitHub
1. Ve a https://github.com/new
2. Nombre sugerido: `seasonality-calendar`
3. Visibilidad: **Private** (recomendado, es data interna de DiDi)
4. NO marques "Initialize with README" (ya tenemos uno)
5. Crea el repo y copia la URL (algo como `https://github.com/juan-david-code/seasonality-calendar.git`)

Avísame la URL exacta y hago el `git remote add` + primer push.

### 2. Crear el proyecto en Supabase
1. Ve a https://supabase.com/dashboard → "New project"
2. Nombre: `seasonality-calendar`, elige una región cercana (ej. São Paulo)
3. Guarda la contraseña de la base de datos en un lugar seguro
4. Una vez creado, ve a **SQL Editor** → pega y ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql) (crea las tablas y siembra los eventos que ya conocemos)
5. Ve a **Project Settings → API** y copia:
   - `Project URL`
   - `anon public` key

Pásame esos dos valores (no son secretos de admin, son las llaves públicas de solo-lectura) y te ayudo a configurarlos en `.env.local` y en Vercel.

### 3. Conectar Vercel
1. Ve a https://vercel.com/new
2. Importa el repo `seasonality-calendar` desde GitHub
3. Framework se detecta solo (Next.js)
4. En **Environment Variables**, agrega:
   - `NEXT_PUBLIC_SUPABASE_URL` = (el Project URL de Supabase)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (el anon public key)
5. Deploy

Cada `git push` a `main` desde ahora en adelante dispara un deploy automático.

### 4. Desarrollo local
```bash
cd seasonality-calendar
cp .env.local.example .env.local   # y rellena con tus valores de Supabase
npm install
npm run dev
```

## Roadmap
- [x] Fase 1: scaffold, festivos/semana ISO/conciertos migrados, dropdown cluster→ciudad con selección persistida
- [ ] Fase 2: modelo de datos completo por ciudad para todo CASA + Indigo (afinar festivos MX/CR/EC con fuente oficial, cargar School Break/Back to School faltantes)
- [ ] Fase 3: sync automático de festivos desde la fuente oficial (Google Sites / Sheets del equipo)
- [ ] Fase 4: budget semanal y demanda histórica YoY por ciudad (depende de acceso a Sheets/SQL por fuente)
- [ ] Fase 5: insights de demanda esperada por ciudad/semana usando YoY

## Cómo seguir iterando con Claude Code
Este repo está pensado para vibecodear: pídele a Claude Code cambios concretos ("agrega la ciudad X", "conecta la fuente de budget de Lima", "ajusta los festivos de Ecuador") y haz commit/push normalmente — Vercel redepliega solo.
