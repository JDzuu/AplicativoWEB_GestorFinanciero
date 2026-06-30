Aun es mejorable TwT 

# Gestor de Proyectos — AplicativoWeb Financiero

Sistema web de gestión de proyectos. Permite registrar proyectos, controlar pagos de clientes (entradas) y gastos (salidas), generar presupuestos con análisis de rentabilidad y exportar PDFs de cierre y cotizaciones.

---

## Tecnologías usadas

| Capa | Tecnología |
|---|---|
| Backend | Python + FastAPI |
| Base de datos | PostgreSQL (producción) / SQLite (desarrollo) |
| Frontend | React + Vite |
| Estilos | CSS puro |
| PDF | ReportLab |
| Cifrado | Argon2id |

---

## Estructura

```
proyecto/
├── backend/
│   └── src/
│       ├── api.py          rutas FastAPI
│       ├── auth.py         autenticación y sesiones
│       ├── logica.py       validaciones y cálculos financieros
│       ├── database.py     consultas SQL
│       ├── bd.py           conexión SQLite / PostgreSQL
│       └── pdf_export.py   generación de PDFs
├── frontend/
│   └── src/
│       ├── paginas/        Dashboard, Historial, Detalle, Análisis, Presupuestos, Usuarios
│       ├── componentes/    piezas reutilizables
│       └── servicios/      llamadas al backend y utilidades
└── .env.example            plantilla de configuración
```

El flujo de cada petición sigue siempre este orden:

```
Frontend → api.py → auth.py → logica.py → database.py → bd.py → PostgreSQL/SQLite
```

---

## Seguridad implementada

- Contraseñas cifradas con **Argon2id** (estándar OWASP)
- Sesiones con cookies **HttpOnly + SameSite=Strict** (no accesibles desde JavaScript)
- Protección **CSRF** con doble cookie
- Bloqueo tras **5 intentos fallidos** de login por 15 minutos
- Tokens de sesión con expiración de **8 horas**
- **Rate limiting**: 120 req/min general, 10 req/min en `/login`
- Cabeceras de seguridad en cada respuesta (X-Frame-Options, HSTS, CSP, etc.)
- Validaciones críticas en el backend, no solo en el frontend

---

## Instalación

### 1. Clonar el repositorio

```bash
git clone https://github.com/JDzuu/AplicativoWEB_GestorFinanciero.git
cd AplicativoWEB_GestorFinanciero
```

### 2. Configuración del entorno

Copia el archivo de ejemplo. Antes de arrancar puedes editar `ADMIN_USUARIO`, `ADMIN_NOMBRE` y `ADMIN_PASSWORD` si quieres personalizar el administrador inicial:

```bash
cp .env.example .env
```

### 3. Backend

Abre una terminal en la carpeta `backend/`:

```bash
cd backend
python -m venv venv
```

Activa el entorno virtual según tu sistema operativo:

```bash
# Windows
venv\Scripts\activate

# Linux / Mac
source venv/bin/activate
```

Instala las dependencias y arranca el servidor:

```bash
pip install -r requirements.txt
```
Nota: La primera vez que arranque el backend sin usuarios en la base de datos, se crea el admin automáticamente. Si `ADMIN_PASSWORD` está vacío en el `.env`, se genera una contraseña aleatoria y aparece **una sola vez** en la consola:

```
Ejemplo:
[SEGURIDAD] Usuario administrador inicial creado.
[SEGURIDAD] Usuario: 'admin'
[SEGURIDAD] Contraseña generada (anótala, NO se volverá a mostrar): xK1sP2bR4nLa
```

Ya configurado el .env o si quiere que lo genere la contraseña aleatoriamente puede iniciar el backend

```bash
uvicorn src.api:app --reload --port 8000
```

### 4. Frontend

Abre una segunda terminal en la carpeta `frontend/`:

```bash
cd frontend
npm install
npm run dev
```

El frontend corre en `http://localhost:5173` y el backend en `http://localhost:8000`.


