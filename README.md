# InvoiceGuard AI

MVP de procesamiento auditable de facturas con Next.js, OpenAI y Supabase.

## Configuración

1. Copia `.env.example` a `.env.local`.
2. Configura `OPENAI_API_KEY`, `OCR_SPACE_API_KEY`, `SUPABASE_URL` y `SUPABASE_SECRET_KEY`.
3. Ejecuta `corepack pnpm install --frozen-lockfile`.
4. Aplica `supabase/migrations/001_invoiceguard.sql` al proyecto Supabase.
5. Ejecuta `corepack pnpm demo:seed`.
6. Inicia con `corepack pnpm dev`.

En modo desarrollo, cada archivo aceptado se guarda también en `dev/uploads/` antes de procesarse. Esta carpeta es local y está excluida de Git. En producción, los archivos se procesan en memoria y no se guardan en disco.

## Verificación

- `corepack pnpm test`
- `corepack pnpm test:ocr:live` (prueba manual; carga `.env`, consulta OCR.space y consume una solicitud de la cuota)
- `corepack pnpm build`
