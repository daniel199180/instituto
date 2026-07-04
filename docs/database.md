# Base de datos Appwrite

Esta base de datos sigue la especificacion del sistema de mensualidades guardada en `docs/especificacion-sistema-mensualidades.md`.

## Recursos

- Proyecto Appwrite: `Control instituto`
- Project ID: `6a490aa3003a6a052c4f`
- Endpoint: `https://agencia-appwrite.n2wanx.easypanel.host/v1`
- Database ID: `main`
- Timezone de negocio: `America/La_Paz` (UTC-4)

Todos los campos de fecha y hora se calculan o interpretan en la capa de aplicacion usando `America/La_Paz`. El cliente nunca debe enviar fechas de control para asistencia, transacciones o vencimientos.

## Seguridad

- Ninguna coleccion tiene permisos publicos.
- Todas las colecciones tienen `$permissions: []`.
- Todas las colecciones tienen `documentSecurity: false`.
- El navegador no debe consultar Appwrite Databases directamente.
- El acceso a datos debe pasar por Server Actions/API routes de Next.js usando API key server-side.
- Los enums se guardan como `string`; la validacion de valores se hace con zod.
- Las relaciones se guardan como IDs en `string`; la integridad referencial se valida en Server Actions.

Nota de Appwrite: el CLI no permite combinar `required: true` con `default` en un mismo atributo. En `appwrite.json`, los campos con default quedan con `required: false` para que el despliegue sea valido. La aplicacion debe seguir tratandolos como obligatorios en zod y dejar que Appwrite aplique el default cuando el valor no se envie.

## API keys

Crea dos API keys separadas en Appwrite Console.

### Key de Next.js

Usala solo en variables server-side, nunca en `NEXT_PUBLIC_*`.

Scopes requeridos:

- `databases.read`
- `databases.write`
- `collections.read`
- `collections.write`
- `users.read`
- `users.write`
- `teams.read`
- `teams.write`

Variable local:

```bash
APPWRITE_API_KEY=...
```

### Key de funcion de vencimientos

Esta key es exclusiva para la Appwrite Function que marca mensualidades vencidas. Debe aplicar principio de minimo privilegio y tocar solo la coleccion `payments`.

Si tu version de Appwrite permite permisos por recurso, limita la key a:

- Database: `main`
- Collection: `payments`
- Acciones: lectura y escritura necesarias para actualizar `estado`

Si tu version solo expone scopes globales, usa el minimo disponible para escritura de base de datos y limita por codigo la funcion para que solo consulte y actualice `payments`.

## Despliegue

1. Inicia sesion contra la instancia:

```bash
appwrite login --endpoint "https://agencia-appwrite.n2wanx.easypanel.host/v1"
```

2. Configura el proyecto local:

```bash
appwrite client --endpoint "https://agencia-appwrite.n2wanx.easypanel.host/v1"
appwrite client --project-id "6a490aa3003a6a052c4f"
```

3. Verifica que `.env.local` tenga:

```bash
APPWRITE_ENDPOINT=https://agencia-appwrite.n2wanx.easypanel.host/v1
APPWRITE_PROJECT_ID=6a490aa3003a6a052c4f
APPWRITE_DATABASE_ID=main
APPWRITE_API_KEY=...
```

4. Despliega la base y colecciones:

```bash
appwrite push collections
```

Para despliegue no interactivo:

```bash
appwrite -a -f push collections
```

En Appwrite `1.8.1`, el primer push puede crear solo la base y las colecciones. Si al verificar ves colecciones sin atributos, ejecuta el mismo push una segunda vez; con las colecciones ya existentes, el CLI crea atributos e indices como pasos separados.

5. Crea o verifica los Teams:

```bash
npm run appwrite:teams
```

## Colecciones

El archivo `appwrite.json` crea estas 11 colecciones en la base `main`:

- `students`
- `branches`
- `careers`
- `teachers`
- `courses`
- `courseSchedules`
- `attendance`
- `staffProfiles`
- `enrollments`
- `payments`
- `transactions`

## Teams

El script `scripts/setup-teams.ts` crea de forma idempotente:

- `staff`, con roles de membership: `administrador`, `cajero`, `academico`
- `docentes`, con rol de membership: `docente`

## Checklist de verificacion

- [ ] Base de datos `main` creada.
- [ ] Las 11 colecciones creadas.
- [ ] Todos los atributos creados con los nombres camelCase indicados.
- [ ] Indices creados: unique, fulltext y key segun corresponda.
- [ ] Todas las colecciones tienen `$permissions: []`.
- [ ] Todas las colecciones tienen `documentSecurity: false`.
- [ ] Confirmado que ninguna coleccion tiene permisos publicos.
- [ ] Team `staff` creado.
- [ ] Team `docentes` creado.
- [ ] API key de Next.js creada con scopes de databases, collections, users y teams.
- [ ] API key de funcion de vencimientos creada con acceso minimo a `payments`.
