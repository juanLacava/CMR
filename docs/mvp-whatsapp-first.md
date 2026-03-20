# MVP WhatsApp-First

## Objetivo

Construir un CRM omnicanal simple, barato y operable desde WhatsApp, con:

- clientes
- stock
- pedidos
- mensajes centralizados en una sola bandeja
- automatización asistida por IA

La IA no gobierna el negocio. Asiste al operador y automatiza tareas repetitivas.

## Decisión de stack

### 1. Canal principal

`WhatsApp Cloud API`

Motivos:

- es el canal de operación principal pedido para el MVP
- evita depender de proveedores intermedios como Twilio para WhatsApp
- permite webhook oficial, envío de mensajes y plantillas

### 2. Bandeja unificada

`Chatwoot` self-hosted

Motivos:

- ya resuelve inbox omnicanal, agentes, conversaciones y contactos
- soporta WhatsApp Cloud y otros canales
- tiene API para sincronizar contactos, conversaciones y mensajes con el CRM
- reduce meses de desarrollo de frontend operativo

### 3. Backend y base de datos

`Supabase`

Motivos:

- Postgres administrado
- Auth
- Row Level Security
- Edge Functions para webhooks y jobs livianos
- costo bajo para MVP

### 4. Automatización

`n8n` opcional en fase 2

Uso recomendado:

- recordatorios
- alertas internas
- campañas simples
- integraciones no críticas

No se recomienda meter la lógica central del negocio dentro de n8n.

### 5. IA

IA asistida y acotada:

- clasificación de intención
- sugerencia de respuesta
- resumen de conversación
- extracción de datos del cliente
- creación de borradores de pedido

No se recomienda un agente autónomo que modifique stock, cobre o cierre pedidos sin confirmación humana en la fase inicial.

## Arquitectura final del MVP

```text
Cliente -> WhatsApp -> Meta Webhook
                        |
                        v
                 Chatwoot Inbox
                        |
              +---------+----------+
              |                    |
              v                    v
      Operador humano         Webhook/Eventos
                                   |
                                   v
                        Supabase Edge Functions
                                   |
                                   v
                               Postgres
                                   |
                 +-----------------+-----------------+
                 |                 |                 |
                 v                 v                 v
             clientes           stock            pedidos
                                   |
                                   v
                             asistente IA
```

## Qué se maneja desde WhatsApp

El usuario final del negocio atiende principalmente desde WhatsApp, pero el sistema necesita un panel operativo mínimo.

Modelo recomendado:

- el cliente escribe por WhatsApp
- el mensaje entra a Chatwoot
- el operador responde desde Chatwoot
- el CRM sincroniza cliente, pedido y stock en Supabase
- la IA propone respuestas y detecta acciones

Si querés operación casi completamente en WhatsApp para el dueño, se puede sumar un bot de comandos internos en fase 2:

- `stock remera negra`
- `pedido juan perez`
- `cliente +549...`
- `pendientes hoy`

Eso no reemplaza la bandeja ni el panel. Solo sirve como capa rápida de operación.

## Módulos del MVP

### Bandeja

- conversaciones por cliente
- etiquetas
- estado: abierta, pendiente, resuelta
- asignación opcional

### CRM

- cliente
- teléfonos
- canal de origen
- notas
- etiquetas
- última interacción

### Stock

- producto
- sku
- precio
- stock actual
- stock reservado
- stock mínimo

### Pedidos

- cliente
- items
- total
- estado
- canal
- observaciones

### IA asistente

- detectar intención: compra, consulta, soporte, seguimiento
- resumir conversación
- sugerir respuesta
- extraer datos útiles del cliente

## Flujo operativo base

1. Llega un mensaje a WhatsApp.
2. Chatwoot crea o actualiza la conversación.
3. Un webhook en Chatwoot notifica al backend.
4. El backend resuelve identidad del cliente.
5. El backend guarda mensaje y metadatos en Supabase.
6. La IA clasifica intención y genera sugerencia opcional.
7. Si hay intención de compra, el operador crea pedido.
8. Al confirmar pedido, se reserva o descuenta stock.

## Qué construimos y qué reutilizamos

### Reutilizamos

- Chatwoot para inbox, agentes, conversaciones y UI de atención
- WhatsApp Cloud API para mensajería oficial
- Supabase para datos del negocio

### Construimos

- modelo de negocio en Postgres
- sincronización Chatwoot <-> Supabase
- reglas de stock y pedidos
- asistente IA
- comandos internos por WhatsApp en fase posterior

## Alcance de la primera versión

### Sí

- WhatsApp como canal principal
- clientes
- stock
- pedidos
- historial de mensajes
- bandeja unificada usando Chatwoot
- IA solo como sugerencia

### No

- agente autónomo con poder de ejecutar todo
- facturación compleja
- multi-sucursal avanzada
- campañas masivas sofisticadas
- reconciliación contable

## Costos técnicos orientativos

Combinación recomendada para MVP barato:

- Supabase: plan inicial
- Chatwoot self-hosted en VPS pequeño
- WhatsApp Cloud API según uso real
- IA por consumo o con modelo económico

La decisión barata no es escribir toda la bandeja desde cero. La decisión barata es comprar tiempo de desarrollo usando Chatwoot y concentrar el código propio en CRM, stock y pedidos.

## Orden de implementación

1. modelado de datos en Supabase
2. alta de WhatsApp Cloud API
3. despliegue de Chatwoot
4. webhook de sincronización Chatwoot -> Supabase
5. panel simple de clientes, stock y pedidos
6. sugerencias IA
7. comandos internos por WhatsApp
