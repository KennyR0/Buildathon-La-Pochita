# Feature Specification: InvoiceGuard AI MVP

**Feature Branch**: `not-created`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Procesar una imagen o PDF de factura de extremo a extremo mediante
extracción estructurada, validaciones persistentes, reglas deterministas, decisión y auditoría."

## Clarifications

### Session 2026-07-15

- Q: ¿Cómo se identifica al proveedor extraído? → A: Por identificación tributaria exacta; el
  nombre es informativo y no bloquea la coincidencia.
- Q: ¿Cómo se compara el número para detectar duplicados? → A: Globalmente, quitando espacios
  externos y normalizando mayúsculas y minúsculas.
- Q: ¿Qué ocurre cuando falla la extracción o faltan campos requeridos? → A: Se guarda una factura
  incompleta con `NEEDS_REVIEW_HIGH_RISK` y se auditan los campos ausentes o inválidos.
- Q: ¿Cómo puede resolverse humanamente una extracción incompleta? → A: El usuario puede corregir
  únicamente los cinco campos extraídos y volver a ejecutar todas las validaciones y reglas.
- Q: ¿Cómo se almacenan la decisión automática y la humana? → A: Se guardan por separado; la
  decisión humana, cuando existe, prevalece como estado efectivo mostrado.
- Q: ¿Cómo se resuelve un proveedor extraído que no existe? → A: Una revisión compacta permite
  crear el proveedor con nombre y RUC extraídos y revalidar la misma factura, o rechazar la factura
  con justificación; no se introduce un CRUD general.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Aprobar una factura correcta (Priority: P1)

Como usuario de cuentas por pagar, quiero cargar una factura y obtener una decisión explicable
para confirmar que una factura válida puede procesarse sin intervención manual.

**Why this priority**: Es el recorrido principal y demuestra el valor completo del MVP desde el
archivo hasta una decisión persistida y visible.

**Independent Test**: Cargar una imagen o PDF con factura de USD 1500 vinculada a una orden de
USD 1500 para un proveedor válido y comprobar que los datos extraídos, las validaciones, la
decisión `APPROVED` y el timeline quedan disponibles tras finalizar el procesamiento.

**Acceptance Scenarios**:

1. **Given** un proveedor y una orden de compra de USD 1500 existentes, y un número de factura no
   registrado, **When** el usuario carga una factura legible de USD 1500 con datos coincidentes,
   **Then** el sistema extrae los cinco campos requeridos, supera todas las validaciones y muestra
   `APPROVED` con una explicación.
2. **Given** una factura aprobada, **When** el usuario consulta su resultado, **Then** ve los datos
   extraídos, el resultado de cada validación y el timeline persistido en orden cronológico.
3. **Given** una factura procesada correctamente, **When** termina el flujo, **Then** la factura,
   la decisión y cada paso importante permanecen guardados y pueden recuperarse nuevamente.

---

### User Story 2 - Escalar inconsistencias y referencias desconocidas (Priority: P2)

Como usuario de cuentas por pagar, quiero que una factura con riesgo se escale con motivos claros
para evitar una aprobación automática incorrecta.

**Why this priority**: La gestión determinista del riesgo diferencia una automatización controlada
de una simple extracción de datos.

**Independent Test**: Cargar una factura de USD 2300 asociada a una orden de USD 1500 y comprobar
que el resultado es `NEEDS_REVIEW_HIGH_RISK`, identifica la discrepancia y conserva el timeline.

**Acceptance Scenarios**:

1. **Given** una orden autorizada por USD 1500, **When** se procesa una factura no duplicada de
   USD 2300, **Then** el sistema muestra `NEEDS_REVIEW_HIGH_RISK` y señala la diferencia de monto.
2. **Given** una factura no duplicada cuyo proveedor no existe, **When** se ejecutan las reglas,
   **Then** la decisión es `NEEDS_REVIEW_HIGH_RISK` y el motivo identifica al proveedor ausente.
3. **Given** una factura no duplicada cuya orden no existe o cuyo proveedor no coincide con la
   orden, **When** se ejecutan las reglas, **Then** la decisión es `NEEDS_REVIEW_HIGH_RISK` y cada
   validación fallida aparece separadamente en el timeline.
4. **Given** una factura completa cuyo proveedor no existe, **When** el usuario aprueba el alta,
   **Then** el sistema crea o reutiliza el proveedor por RUC, revalida la misma factura y conserva
   visibles las demás validaciones fallidas.
5. **Given** una factura completa cuyo proveedor no existe, **When** el usuario rechaza el alta con
   justificación, **Then** el proveedor no se crea y la factura queda `REJECTED` por decisión humana.

---

### User Story 3 - Rechazar una factura duplicada (Priority: P3)

Como usuario de cuentas por pagar, quiero rechazar automáticamente un número de factura ya
registrado para evitar pagos duplicados.

**Why this priority**: Demuestra que la decisión usa historial persistido y protege contra el riesgo
financiero más directo del MVP.

**Independent Test**: Procesar una factura cuyo número ya esté almacenado y comprobar que el
resultado es `REJECTED`, aunque el resto de los datos coincida con una orden válida.

**Acceptance Scenarios**:

1. **Given** un número de factura almacenado previamente, **When** se procesa otra factura con el
   mismo número, **Then** el sistema decide `REJECTED` y muestra duplicado detectado como motivo.
2. **Given** un duplicado rechazado, **When** se consulta su timeline, **Then** este incluye la
   búsqueda persistente, el hallazgo del duplicado, la regla aplicada y la decisión guardada.

---

### User Story 4 - Resolver manualmente una factura escalada (Priority: P4)

Como usuario de cuentas por pagar, quiero aprobar excepcionalmente o rechazar una factura
escalada y justificar mi decisión para cerrar el caso con trazabilidad.

**Why this priority**: Completa el control humano requerido sin añadir administración de usuarios
ni procesos ajenos a la demo.

**Independent Test**: Abrir una factura con estado `NEEDS_REVIEW_HIGH_RISK`, intentar resolverla
sin justificación y después aprobarla o rechazarla con justificación; verificar que solo la acción
justificada se acepta y permanece en el timeline.

**Acceptance Scenarios**:

1. **Given** una factura escalada, **When** el usuario intenta aprobarla o rechazarla sin
   justificación, **Then** el sistema impide completar la acción y solicita una justificación.
2. **Given** una factura escalada, **When** el usuario elige aprobación excepcional e introduce una
   justificación, **Then** se guarda la resolución humana y se añade al timeline sin ocultar la
   decisión automática original.
3. **Given** una factura escalada, **When** el usuario la rechaza con una justificación, **Then** se
   guarda el rechazo humano y el timeline permite distinguirlo del resultado automático.
4. **Given** una factura incompleta, **When** el usuario corrige sus campos extraídos, **Then** el
   sistema audita los valores anteriores y nuevos y vuelve a ejecutar todas las consultas y reglas
   antes de permitir una resolución final.

### Edge Cases

- Un archivo que no sea imagen ni PDF aceptado se rechaza antes del procesamiento con un mensaje
  comprensible y sin crear una factura procesada.
- Un archivo ilegible o una extracción que omita o invalide cualquiera de los cinco campos
  requeridos crea una factura incompleta con los valores disponibles, decisión
  `NEEDS_REVIEW_HIGH_RISK` y la lista de campos afectados; el fallo se muestra y queda auditado.
- Si fallan varias validaciones no relacionadas con duplicidad, la decisión permanece
  `NEEDS_REVIEW_HIGH_RISK` y se muestran todos los motivos, no solo el primero.
- La regla de duplicado tiene precedencia: si un número ya existe, el resultado es `REJECTED`
  aunque también haya discrepancias de proveedor, orden o monto.
- Una factura cuyo monto coincide pero cuyo proveedor u orden es inválido no se aprueba; permanece
  `NEEDS_REVIEW_HIGH_RISK`.
- Una resolución humana repetida no debe borrar ni reemplazar silenciosamente el historial previo.
- Una corrección manual se limita a número de factura, proveedor, identificación tributaria, orden
  de compra y total; no permite introducir líneas de productos ni otros datos fuera del MVP.
- Una falla al consultar o guardar datos impide presentar el proceso como completado y comunica que
  el resultado no pudo persistirse.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema MUST permitir cargar al menos una imagen o un PDF que represente una
  factura individual.
- **FR-002**: El sistema MUST extraer una estructura con número de factura, proveedor,
  identificación tributaria, orden de compra y total.
- **FR-003**: El sistema MUST validar presencia y formato utilizable de los cinco campos antes de
  someterlos al motor de reglas. Si alguno está ausente o es inválido, MUST guardar los valores
  disponibles como factura incompleta con `NEEDS_REVIEW_HIGH_RISK`, MUST identificar los campos
  afectados y MUST NOT ejecutar como superadas las validaciones dependientes de esos campos.
- **FR-004**: El sistema MUST identificar al proveedor mediante coincidencia exacta de la
  identificación tributaria extraída contra proveedores persistidos. El nombre extraído MUST
  conservarse como dato informativo y una diferencia de nombre por sí sola MUST NOT invalidar la
  coincidencia.
- **FR-005**: El sistema MUST consultar órdenes de compra persistidas para determinar si la orden
  extraída existe, identificar su proveedor y obtener su monto autorizado.
- **FR-006**: El sistema MUST detectar duplicados globalmente por número de factura antes de tomar
  una decisión de negocio. Para comparar, MUST quitar espacios externos y normalizar diferencias
  entre mayúsculas y minúsculas; MUST conservar también el valor original para visualización y
  auditoría. `invoice_number_normalized` MUST estar indexado y MUST NOT ser único. Cada intento,
  incluido un duplicado, MUST persistirse como una factura independiente; el duplicado MUST quedar
  en `REJECTED` y MUST referenciar la factura original mediante `duplicate_of_invoice_id`.
- **FR-007**: El sistema MUST comparar el total facturado con el monto autorizado de la orden.
- **FR-008**: El sistema MUST aplicar reglas deterministas con esta precedencia: una factura
  duplicada produce `REJECTED`; en ausencia de duplicado, proveedor ausente, orden ausente,
  proveedor distinto al de la orden o monto diferente producen `NEEDS_REVIEW_HIGH_RISK`; solo
  cuando las referencias existen, proveedor y orden coinciden y los montos coinciden produce
  `APPROVED`.
- **FR-009**: El sistema MUST conservar y mostrar cada regla evaluada, su resultado y el motivo de
  la decisión final.
- **FR-010**: El sistema MUST guardar todo intento de procesamiento que alcance una decisión,
  incluidas las extracciones incompletas y las facturas duplicadas, junto con sus datos disponibles,
  resultado automático, motivos y, para un duplicado, su referencia a la factura original.
- **FR-011**: El sistema MUST registrar en `audit_logs` el inicio del procesamiento, extracción,
  validación de estructura, consulta de proveedor, consulta de orden, búsqueda de duplicado,
  comparación de monto, decisión, persistencia y cualquier resolución humana ejecutada.
- **FR-012**: El frontend MUST mostrar el archivo procesado o su referencia, los cinco datos
  extraídos, las validaciones, la decisión, sus motivos y el timeline persistido.
- **FR-013**: El sistema MUST permitir aprobar excepcionalmente o rechazar manualmente únicamente
  facturas con decisión automática `NEEDS_REVIEW_HIGH_RISK`.
- **FR-014**: Toda resolución humana MUST exigir y persistir una justificación, conservar por
  separado la decisión automática y aparecer como un nuevo evento del timeline. La decisión humana,
  cuando existe, MUST prevalecer como estado efectivo mostrado sin borrar el resultado automático.
- **FR-019**: Para una factura incompleta, el sistema MUST permitir corregir únicamente los cinco
  campos extraídos. Al guardar cambios, MUST auditar valores anteriores y nuevos y MUST volver a
  ejecutar validación estructural, consultas persistentes, detección de duplicados, comparación de
  monto y reglas; la edición MUST NOT aprobar ni rechazar directamente la factura.
- **FR-015**: El MVP MUST utilizar solo las entidades principales `suppliers`, `purchase_orders`,
  `invoices` y `audit_logs`; proveedores y órdenes de compra MUST poder prepararse previamente como
  datos de demostración, y un proveedor faltante MUST poder aprobarse desde su factura sin añadir
  una pantalla de administración.
- **FR-020**: Para una factura completa en revisión por `SUPPLIER_EXISTS`, el sistema MUST mostrar
  nombre y RUC extraídos, permitir aprobar el proveedor y reejecutar todas las reglas sobre la misma
  factura, o rechazar la factura con justificación. La aprobación MUST ser idempotente por RUC y
  quedar auditada sin exigir justificación ni sobrescribir otras validaciones fallidas.
- **FR-016**: El sistema MUST ofrecer fixtures de respaldo para los tres escenarios obligatorios;
  estos MUST atravesar el mismo flujo de reglas, consultas, escrituras y auditoría que una carga
  normal.
- **FR-017**: Si una consulta o escritura persistente requerida falla, el sistema MUST impedir que
  el caso aparezca como completado y MUST informar el fallo al usuario.
- **FR-018**: El MVP MUST excluir autenticación, roles, ERP, correos, procesamiento masivo, líneas
  de productos, impuestos, múltiples monedas, panel administrativo y reportes avanzados.

### Key Entities *(include if feature involves data)*

- **Supplier (`suppliers`)**: Proveedor empresarial precargado o aprobado desde una factura; su
  identificación tributaria es la clave de coincidencia exacta y su nombre comercial es informativo.
  Se relaciona con una orden.
- **Purchase Order (`purchase_orders`)**: Autorización precargada vinculada a un proveedor; contiene
  su referencia y monto autorizado para comparar la factura.
- **Invoice (`invoices`)**: Factura procesada, completa o incompleta; conserva los campos disponibles,
  la lista de campos ausentes o inválidos y, cuando existe un número, su valor original y una
  representación normalizada indexada pero no única. Cada intento ocupa una fila; un intento
  duplicado queda `REJECTED` y conserva `duplicate_of_invoice_id` hacia la factura original.
  Conserva además referencias, total, decisión automática, motivos y, cuando corresponda, decisión
  humana y justificación separadas. Su estado efectivo es la decisión humana cuando existe; en caso
  contrario, es la decisión automática. Una corrección vuelve a calcular la decisión automática
  actual y conserva las anteriores en auditoría.
- **Audit Log (`audit_logs`)**: Evento cronológico asociado a una factura o intento de procesamiento;
  conserva paso, resultado y detalle suficiente para explicar el recorrido completo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Los tres escenarios obligatorios pueden ejecutarse consecutivamente de extremo a
  extremo durante una demo y los tres terminan con el estado esperado en el 100% de los ensayos.
- **SC-002**: Una factura válida de USD 1500 contra una orden de USD 1500 muestra `APPROVED`, cinco
  campos extraídos y todas sus validaciones en una única sesión de procesamiento.
- **SC-003**: Una factura de USD 2300 contra una orden de USD 1500 muestra
  `NEEDS_REVIEW_HIGH_RISK`, identifica ambos montos y puede resolverse humanamente con justificación
  en menos de dos minutos desde que aparece la decisión automática.
- **SC-004**: Una factura con número ya registrado muestra `REJECTED` por duplicidad en el 100% de
  los ensayos, sin depender de datos temporales de la sesión actual.
- **SC-005**: Para cada factura que alcanza una decisión, el usuario puede ver el 100% de los pasos
  importantes exigidos por FR-011 en orden cronológico después de volver a consultar el resultado.
- **SC-006**: Ninguna aprobación automática ocurre cuando falta el proveedor, falta la orden, el
  proveedor no coincide, el monto difiere o la factura es duplicada en el conjunto de demo.
- **SC-007**: El recorrido de carga a decisión visible puede completarse en menos de dos minutos por
  factura de demostración, excluyendo el tiempo de resolución humana.
- **SC-008**: Un integrante que no implementó el flujo puede reproducir los tres escenarios usando
  las instrucciones y fixtures preparados, sin editar datos durante la demo.

## Assumptions

- El MVP procesa una factura por operación y una sola moneda de demostración: USD.
- Los montos se consideran coincidentes mediante igualdad exacta en la precisión monetaria
  almacenada; no se incluyen tolerancias, impuestos ni conversiones.
- Las órdenes de compra necesarias para la demo estarán precargadas; los proveedores pueden estar
  precargados o aprobarse desde una factura en revisión.
- No se identifica al operador mediante autenticación; la resolución humana conserva la acción y
  justificación, pero no introduce gestión de identidades ni roles.
- El archivo de demostración será suficientemente legible para extraer los cinco campos; el fixture
  de respaldo existe para proteger la reproducibilidad, no para evitar consultas o escrituras reales.
- Una factura llega a decisión solo después de completar las consultas obligatorias y poder guardar
  el resultado; los fallos técnicos no se convierten en decisiones de negocio.

## Demo Evidence *(mandatory for InvoiceGuard AI)*

- **Factura correcta**: orden precargada por USD 1500 y factura nueva por USD 1500; resultado
  `APPROVED`, factura persistida y timeline recuperable.
- **Monto incorrecto**: orden precargada por USD 1500 y factura nueva por USD 2300; resultado
  `NEEDS_REVIEW_HIGH_RISK`, discrepancia visible y resolución humana justificada persistida.
- **Factura duplicada**: número de factura almacenado previamente; resultado `REJECTED` basado en
  la consulta persistente y evento de duplicidad visible en el timeline.
- Los tres recorridos MUST mostrar consultas y escrituras reales en Supabase y el timeline obtenido
  desde `audit_logs`.
