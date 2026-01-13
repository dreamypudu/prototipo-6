PROTOTIPO-5 - Plataforma de simulacion psicometrica
====================================================

Resumen
-------
Este proyecto es un simulador modular para capturar decisiones explicitas
y acciones implicitas (mecanicas), con export de sesion para analisis
psicometrico, estadistico y ML. La comparacion "dijo vs hizo" se resuelve
con ExpectedAction (desde escenarios) y CanonicalAction (desde mecanicas).


Estructura general (frontend)
-----------------------------
Raiz del front:
- App.tsx
  Orquestador principal de CESFAM (estado, tiempo, flujo narrativo, tabs).
- games/InnovatecGame.tsx
  Orquestador de la version Innovatec (agenda, secretaria, reuniones).
- types.ts
  Tipos base del simulador (GameState, Scenario, Expected/Canonical, etc).
- constants.ts
  Constantes generales (time slots, objetivos, etc).
- hooks/useMechanicLogSync.ts
  Sincroniza el buffer del motor con el estado de React.

Mecanicas (modularidad):
- mechanics/registry.ts
  Registro de mecanicas para CESFAM (tab_id, label, Module).
- mechanics/innovatecRegistry.ts
  Registro de mecanicas para Innovatec.
- mechanics/MechanicContext.tsx
  Contexto para compartir gameState, engine, dispatch y office state.
- mechanics/modules/*
  Implementaciones de mecanicas (Office, Map, Email, Schedule, Documents,
  ExperimentalMap, DataExport, etc). Cada una es un modulo enchufable.

Componentes UI:
- components/*
  UI reutilizable (Header, Sidebar, DirectorDesk, CesfamMap, etc).
  Aqui viven las pantallas visuales y elementos de interfaz.

Datos y escenarios:
- data/scenarios.ts
  Escenarios y secuencias CESFAM.
- data/innovatec/*
  Escenarios y assets de Innovatec.
- data/simulatorConfigs.ts
  Configuracion por version (mecanicas activas, reglas de comparacion).

Servicios del simulador:
- services/MechanicEngine.ts
  Buffer de MechanicEvent, CanonicalAction y ExpectedAction.
- services/ComparisonEngine.ts
  Motor de comparacion expected vs canonical.
- services/sessionExport.ts
  Construye el paquete de sesion para export y backend.
- services/Timelogger.ts
  Log de tiempos de decision (procesos).


Arquitectura de datos (psicometria)
-----------------------------------
1) Decision explicita -> ExpectedAction
   Se registra desde un nodo de escenario.

2) Accion implicita -> CanonicalAction
   Se emite desde la mecanica cuando el usuario realiza la accion.

3) Comparacion
   Se hace en backend con action_type + target_ref + mechanic_id.

4) Export
   Se genera session_export.json con:
   - decisiones explicitas
   - expected actions
   - canonical actions
   - events log (mecanicas)
   - comparaciones


Formatos JSON por mecanica
--------------------------
Formato base:
- MechanicEvent: { event_id, mechanic_id, event_type, timestamp, payload }
- CanonicalAction: { canonical_action_id, mechanic_id, action_type, target_ref, value_final, committed_at, context? }
- ExpectedAction: { expected_action_id, source{node_id, option_id}, mechanic_id?, action_type, target_ref, constraints?, rule_id, created_at }

Mecanicas y payloads:
- map
  - event: staff_clicked -> { staff_id, location_id, day, time_slot }
  - canonical: visit_stakeholder -> target_ref stakeholder:{id}, value_final { day, time_slot, location_id, arrived_at }
- inbox (email)
  - event: read_email -> { email_id, day, time_slot }
  - canonical: read_email -> target_ref email:{email_id}, value_final { email_id, day, time_slot, read_at }
- documents
  - event: read_document -> { doc_id, day, time_slot }
  - canonical: read_document -> target_ref doc:{doc_id}, value_final { doc_id, day, time_slot, read_at }
- scheduler
  - event: schedule_updated -> { assignment_count }
  - canonical: execute_week -> target_ref global, value_final { week_schedule: [{ staff_id, day, block, activity, room_id }] }, context { day, time_slot }
- calendar (innovatec)
  - event: meeting_scheduled -> { stakeholder_id, day, time_slot }
  - canonical: schedule_meeting -> target_ref stakeholder:{id}, value_final { day, time_slot, scheduled_at }
- office
  - event: notes_updated -> { notes_length }
  - event: phone_call -> { stakeholder_id }
- dialogue
  - event: scenario_presented -> { node_id }
  - event: decision_made -> { node_id, option_id }

Expected actions por mecanica (ejemplos):
- map: action_type visit_stakeholder, target_ref stakeholder:{id}
- scheduler: action_type execute_week, target_ref global, constraints con rule_id


Backend
-------
Carpeta: backend/
- main.py
  API FastAPI (recibe sesiones y normaliza datos).
- requirements.txt
  Dependencias del backend.
- rebuild_db.py
  Utilidad de mantenimiento/normalizacion.


Notas de modularidad
--------------------
- Las mecanicas se activan por config (data/simulatorConfigs.ts).
- El front renderiza solo mecanicas registradas en el registry.
- Cada mecanica es un modulo independiente, con su propio UI y eventos.
- La comparacion no vive en la UI: se centraliza en backend.


Salida de datos (archivos locales de ejemplo)
---------------------------------------------
- expected_actions.json
- canonical_actions.json
- mechanic_events.json
- explicit_decisions.json
- session_export.json


Sugerencias de extension
------------------------
- Agregar una mecanica: crear modulo, registrar en registry, activar en config.
- Agregar expected actions: definirlas en escenarios con mechanic_id.
- Agregar reglas de comparacion: extender ComparisonEngine en backend.
