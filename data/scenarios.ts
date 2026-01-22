
import { ScenarioFile } from '../types';

export const scenarios: ScenarioFile = {
  simulation_id: "CESFAM_SECTORS_MANAGEMENT",
  scenarios: [
    // --- Dr. Guzmán (SECTOR AZUL) ---
    {
      node_id: "AZUL_S1_RESEARCH_TIME",
      stakeholderRole: "Jefe Sector Azul",
      dialogue: "Director, seré breve. La Sociedad Chilena de Medicina Familiar nos ha invitado a participar en un estudio multicéntrico. Es una oportunidad de oro para el prestigio del CESFAM. Necesito que liberes 11 horas semanales de mi agenda y la de la enfermera Herrera para investigación. Eso sí, tendremos que reducir las consultas de morbilidad, pero la calidad lo vale.",
      options: [
        {
          option_id: "A", text: "Dr. Guzmán, el prestigio es importante, concedido. Autorizo las horas, pero el Sector Rojo deberá absorber su demanda rechazada.",
          tags: { "focus": "prestige", "risk": "overload_others" },
          consequences: { 
            trustChange: 15, supportChange: 10, reputationChange: 10, 
            dialogueResponse: "Excelente visión, Director. Sabía que usted entendía la diferencia entre 'atender' y 'hacer medicina'.",
            expected_actions: [
              {
                mechanic_id: "scheduler",
                action_type: "execute_week",
                target_ref: "global",
                constraints: { staff_id: "andres-guzman", activity: "ADMIN", min_hours: 11 },
                rule_id: "research_hours_rule_v1",
                effects: {
                  TRUE: { global: { reputation: 3 } },
                  FALSE: { global: { reputation: -4 } }
                }
              }
            ]
          }
        },
        {
          option_id: "B", text: "Imposible, Andrés. Tenemos lista de espera. Si quieren investigar, debe ser fuera del horario clínico o manteniendo el rendimiento.",
          tags: { "focus": "coverage", "risk": "blue_morale" },
          consequences: { trustChange: -15, supportChange: -10, reputationChange: -5, dialogueResponse: "Entiendo... Priorizamos la fábrica de números sobre la ciencia. Paz Herrera estará muy decepcionada." }
        },
        {
          option_id: "C", text: "Busquemos un punto medio. Autorizo 5 horas para el estudio, pero deben comprometerse a una charla de capacitación para los otros sectores.",
          tags: { "focus": "balance", "risk": "medium" },
          consequences: { 
            trustChange: 5, supportChange: 0, reputationChange: 5, 
            dialogueResponse: "Mmm. Es poco tiempo, pero acepto el trato por el bien del equipo docente. Negociemos los detalles.",
            expected_actions: [
              {
                mechanic_id: "scheduler",
                action_type: "execute_week",
                target_ref: "global",
                constraints: { staff_id: "andres-guzman", activity: "ADMIN", min_hours: 5 },
                rule_id: "research_hours_rule_v1",
                effects: {
                  TRUE: { global: { reputation: 2 } },
                  FALSE: { global: { reputation: -3 } }
                }
              },
              {
                mechanic_id: "scheduler",
                action_type: "execute_week",
                target_ref: "global",
                constraints: { staff_id: "andres-guzman", activity: "TRAINING", min_hours: 2 },
                rule_id: "training_commitment_rule_v1",
                effects: {
                  TRUE: { stakeholder: { trust: 3, support: 2 } },
                  FALSE: { stakeholder: { trust: -3, support: -2 } }
                }
              }
            ]
          }
        }
      ]
    },
    {
      node_id: "AZUL_S2_ELITISM",
      stakeholderRole: "Jefe Sector Azul",
      dialogue: "Otra cosa. El TENS Javier Castro me comenta que le están pidiendo cubrir turnos en el Sector Amarillo. Me niego rotundamente. Javier está entrenado para procedimientos de alta complejidad, no para ir a repartir leche con Ríos. Necesito que blinde a mi equipo técnico.",
      options: [
        {
          option_id: "A", text: "Javier es funcionario del CESFAM, no propiedad del Sector Azul. Si hay necesidad en el Amarillo, debe ir.",
          tags: { "style": "institutional" },
          consequences: { 
            trustChange: -10, supportChange: -10, dialogueResponse: "Formalmente cierto, prácticamente un error. Desmotivará a mi mejor elemento.",
            expected_actions: [
              {
                mechanic_id: "scheduler",
                action_type: "execute_week",
                target_ref: "global",
                constraints: { staff_id: "javier-castro", target_sector_id: "AMARILLO" },
                rule_id: "cross_sector_help_rule_v1",
                effects: {
                  TRUE: { stakeholder: { trust: 2, support: 1 } },
                  FALSE: { stakeholder: { trust: -2, support: -1 } }
                }
              }
            ]
          }
        },
        {
          option_id: "B", text: "Tiene razón. Mantengamos la especialización de Javier en el Azul. Buscaré un reemplazo externo para el Amarillo.",
          tags: { "style": "silo" },
          consequences: { trustChange: 10, supportChange: 10, dialogueResponse: "Gracias. La especialización es la clave de la eficiencia." }
        }
      ]
    },

    // --- Enf. Soto (SECTOR ROJO) ---
    {
      node_id: "ROJO_S1_BURNOUT_BLOCK",
      stakeholderRole: "Jefa Sector Rojo",
      dialogue: "Director, he visto las metas de gestión. Nos piden aumentar un 15% los controles cardiovasculares. Le informo que mi sector NO se sumará a esa meta. El Dr. Naranjo ya está al límite y Claudia, mi TENS, me ha mostrado indicadores claros de riesgo psicosocial. No voy a sacrificar a mi gente por un bono.",
      options: [
        {
          option_id: "A", text: "Marcela, las metas vienen del Servicio de Salud, no son opcionales. Debemos cumplirlas o nos cortan el presupuesto.",
          tags: { "focus": "compliance_external" },
          consequences: { trustChange: -20, supportChange: -15, dialogueResponse: "Entonces prepárese para las licencias médicas. Si usted no nos cuida, nos cuidaremos nosotros bajo el amparo legal." }
        },
        {
          option_id: "B", text: "Comprendo la preocupación. Hagamos una cosa: congelemos las auditorías internas por este mes para liberar tiempo clínico para los controles.",
          tags: { "focus": "negotiation" },
          consequences: { trustChange: 5, supportChange: 5, dialogueResponse: "¿Suspender las auditorías? Es riesgoso... pero si me lo da por escrito, podría liberar algo de carga del Dr. Naranjo." }
        },
        {
          option_id: "C", text: "Tienes razón. La salud mental del equipo es prioridad. Ajustaré las metas del Rojo y pediré al Azul y Amarillo que compensen.",
          tags: { "focus": "welfare" },
          consequences: { trustChange: 20, supportChange: 15, dialogueResponse: "Gracias, Director. Claudia verá esto como una gran victoria sindical. Cuente con mi lealtad." }
        }
      ]
    },
    {
      node_id: "ROJO_S2_PROTOCOL",
      stakeholderRole: "Jefa Sector Rojo",
      dialogue: "Me han llegado rumores de que el Sector Amarillo está entregando medicamentos a domicilio sin la receta física completa, solo con fotos de WhatsApp. Eso es ilegal. Exijo que instruya un sumario administrativo contra Ríos, o yo misma tendré que hacer la denuncia a Contraloría.",
      options: [
        {
          option_id: "A", text: "Proceda con la denuncia si lo estima conveniente, Marcela. La ley es la ley.",
          tags: { "style": "legalistic" },
          consequences: { trustChange: 10, supportChange: 5, dialogueResponse: "Correcto. La institucionalidad debe protegerse." }
        },
        {
          option_id: "B", text: "Por favor, Marcela, no escales esto. Ríos solo intenta ayudar a postrados. Hablaré con él para regularizarlo.",
          tags: { "style": "mediator" },
          consequences: { trustChange: -10, supportChange: 0, dialogueResponse: "La 'buena intención' no nos salvará de un juicio por mala praxis. Queda bajo su responsabilidad." }
        }
      ]
    },

    // --- Sr. Ríos (SECTOR AMARILLO) ---
    {
      node_id: "AMARILLO_S1_EMERGENCY",
      stakeholderRole: "Jefe Sector Amarillo",
      dialogue: "¡Jefe! Perdón que entre así, pero tengo una crisis. Se nos inundó la sede vecinal donde hacemos los controles de niños. Necesito usar la Sala de Reuniones del Sector Azul hoy mismo. El Dr. Guzmán me cerró la puerta en la cara diciendo que tiene un 'seminario'. ¡Tengo a las mamás con las guaguas afuera bajo la lluvia!",
      options: [
        {
          option_id: "A", text: "Daniel, calma. Ordenaré a Guzmán que abra la sala inmediatamente. La atención de pacientes es prioridad sobre cualquier seminario.",
          tags: { "focus": "community" },
          consequences: { 
            trustChange: 20, supportChange: 15, reputationChange: 10, dialogueResponse: "¡Grande Jefe! Sabía que usted tenía calle. Voy corriendo a avisarle a la Francisca.",
            expected_actions: [
              {
                mechanic_id: "scheduler",
                action_type: "execute_week",
                target_ref: "global",
                constraints: { room_id: "BOX_1", target_sector_id: "AMARILLO", time_window: "AM" },
                rule_id: "emergency_room_rule_v1",
                effects: {
                  TRUE: { global: { reputation: 4 } },
                  FALSE: { global: { reputation: -4 } }
                }
              }
            ]
          }
        },
        {
          option_id: "B", text: "No podemos interrumpir al Azul así. Dile al Dr. Meza que atienda en el pasillo o reagende. No podemos desvestir un santo para vestir otro.",
          tags: { "focus": "order" },
          consequences: { trustChange: -20, supportChange: -20, reputationChange: -15, dialogueResponse: "¿Reagendar? ¿Con lluvia? Jefe, la Francisca se me va a poner a llorar de rabia. Esto va a salir mal." }
        },
        {
          option_id: "C", text: "Usa mi oficina y la sala de espera central. Improvisemos, pero no generemos una guerra con Guzmán hoy.",
          tags: { "focus": "improvisation" },
          consequences: { trustChange: 10, supportChange: 5, dialogueResponse: "Ya, vale. Es incómodo, pero salva el día. Gracias por apañar." }
        }
      ]
    },
    {
      node_id: "AMARILLO_S2_DOCTOR_FLIGHT",
      stakeholderRole: "Jefe Sector Amarillo",
      dialogue: "Tengo otro drama. El Dr. Meza está chato. Dice que sin ecógrafo portátil no puede hacer bien las visitas domiciliarias. Amenazó con renunciar mañana. Necesito que compremos uno urgente o que le quitemos el que tiene guardado la Enf. Soto en el Rojo 'por si acaso'.",
      options: [
        {
          option_id: "A", text: "Quítaselo al Rojo. Si Soto lo tiene guardado y no lo usa, es un desperdicio. La prioridad es retener a Meza.",
          tags: { "action": "reallocate" },
          consequences: { trustChange: 15, supportChange: 10, dialogueResponse: "¡Eso! Meza se queda feliz. Soto va a gritar, pero que grite." }
        },
        {
          option_id: "B", text: "No hay presupuesto para compra ni voy a pelear con Soto. Dile a Meza que se adapte a lo que hay.",
          tags: { "action": "deny" },
          consequences: { trustChange: -10, supportChange: -15, dialogueResponse: "Pucha... entonces vaya buscando otro médico, porque a este lo perdemos fijo." }
        }
      ]
    },

    // --- NEW INEVITABLE EVENTS SCENARIOS ---
    {
    node_id: "INTRO_S1_SALUDO",
    stakeholderRole: "Asistente Administrativa",
    dialogue: "¡Bienvenido, Director! Soy Sofía Castro, su administrativa. Antes de que corra el reloj, lo guiaré por lo esencial.",
    options: [{ option_id: "NEXT", text: "Siguiente", tags: {}, consequences: { dialogueResponse: "Le cuento el contexto de esta semana." } }]
},
{
    node_id: "INTRO_S1_CONTEXTO",
    stakeholderRole: "Asistente Administrativa",
    dialogue: "Contexto: los tres jefes de sector quieren verlo hoy. La semana es corta y la reputación del CESFAM depende de cómo combine calidad, normativa y comunidad.",
    options: [{ option_id: "NEXT", text: "Siguiente", tags: {}, consequences: { dialogueResponse: "Sobre los horarios..." } }]
},
{
    node_id: "INTRO_S1_HORARIOS",
    stakeholderRole: "Asistente Administrativa",
    dialogue: "Horarios y boxes: tenemos pocos box, bloques ajustados y contratos que cumplir. Dejarlo todo rígido genera conflictos; moverlo sin cuidado, también. Revise la Agenda para resolver choques.",
    options: [{ option_id: "NEXT", text: "Siguiente", tags: {}, consequences: { dialogueResponse: "Le muestro el mapa." } }]
},
{
    node_id: "INTRO_S1_MAPA",
    stakeholderRole: "Asistente Administrativa",
    dialogue: "Mapa: aquí elige a quién visitar y en qué box. Cada visita consume un bloque. Priorice según lo que quiera lograr hoy.",
    options: [{ option_id: "NEXT", text: "Siguiente", tags: {}, consequences: { dialogueResponse: "También correos..." } }]
},
{
    node_id: "INTRO_S1_CORREOS",
    stakeholderRole: "Asistente Administrativa",
    dialogue: "Bandeja de entrada: hay correos urgentes. Algunos requieren respuesta y pueden afectar la confianza si los deja pasar.",
    options: [{ option_id: "NEXT", text: "Siguiente", tags: {}, consequences: { dialogueResponse: "Y los documentos..." } }]
},
{
    node_id: "INTRO_S1_DOCUMENTOS",
    stakeholderRole: "Asistente Administrativa",
    dialogue: "Documentos: revise los antecedentes para entender a cada equipo y tomar mejores decisiones.",
    options: [{ option_id: "NEXT", text: "Siguiente", tags: {}, consequences: { dialogueResponse: "Todo está en la pantalla del PC." } }]
},
{
    node_id: "INTRO_S1_PC",
    stakeholderRole: "Asistente Administrativa",
    dialogue: "Todo lo opera desde la pantalla del PC: mapa, agenda, correos y documentos. Lo que diga y haga impacta en reputación y en confianza.",
    options: [{ option_id: "NEXT", text: "Siguiente", tags: {}, consequences: { dialogueResponse: "¿A quién verá primero?" } }]
},
{
    node_id: "INTRO_S1_ELECCION",
    stakeholderRole: "Asistente Administrativa",
    dialogue: "Buena suerte. ¿A quién visitará primero? El reloj sigue pausado; arrancará al terminar esta decisión (lunes AM).",
    options: [
        {
            option_id: "A", text: "Reunirme con el Dr. Guzmán (Azul) para asegurar la calidad técnica primero.",
            tags: { "focus": "technical" },
            consequences: { 
              trustChange: 5, dialogueResponse: "Entendido. El Dr. Guzmán valora la deferencia. Le avisaré que usted lo visitará.",
              expected_actions: [
                {
                  mechanic_id: "map",
                  action_type: "visit_stakeholder",
                  target_ref: "stakeholder:andres-guzman",
                  constraints: { day: "Monday", grace_days: 2 },
                  rule_id: "visit_priority_rule_v1",
                  effects: { TRUE: { stakeholder: { trust: 2, support: 1 } }, FALSE: { stakeholder: { trust: -2, support: -1 } } }
                }
              ]
            }
        },
        {
            option_id: "B", text: "La comunidad es lo primero. Quiero ver qué necesita el Sector Amarillo.",
            tags: { "focus": "social" },
            consequences: { 
              trustChange: 5, dialogueResponse: "Bien. El Sr. Ríos estará encantado, aunque le advierto que es... intenso.",
              expected_actions: [
                {
                  mechanic_id: "map",
                  action_type: "visit_stakeholder",
                  target_ref: "stakeholder:daniel-rios",
                  constraints: { day: "Monday", grace_days: 2 },
                  rule_id: "visit_priority_rule_v1",
                  effects: { TRUE: { stakeholder: { trust: 2, support: 1 } }, FALSE: { stakeholder: { trust: -2, support: -1 } } }
                }
              ]
            }
        },
        {
            option_id: "C", text: "Necesito entender las normas internas. Hablaré con la Enf. Soto (Rojo).",
            tags: { "focus": "normative" },
            consequences: { 
              trustChange: 5, dialogueResponse: "Prudente decisión. La Enf. Soto aprecia el orden. Le avisaré.",
              expected_actions: [
                {
                  mechanic_id: "map",
                  action_type: "visit_stakeholder",
                  target_ref: "stakeholder:marcela-soto",
                  constraints: { day: "Monday", grace_days: 2 },
                  rule_id: "visit_priority_rule_v1",
                  effects: { TRUE: { stakeholder: { trust: 2, support: 1 } }, FALSE: { stakeholder: { trust: -2, support: -1 } } }
                }
              ]
            }
        }
    ]
},
    // 2. CRISIS FARMACIA
    {
        node_id: "CRISIS_FARM_S1",
        stakeholderRole: "Asistente Administrativa",
        dialogue: "¡Director! Emergencia. Farmacia reporta quiebre de stock de insulina y losartán. El camión de la central de abastecimiento no llegará hasta en 3 días. Hay pacientes diabéticos reclamando en el hall. ¿Qué hacemos?",
        options: [
            {
                option_id: "A", text: "Compra de emergencia con caja chica en farmacia privada. Es caro, pero no podemos dejar a los pacientes sin insulina.",
                tags: { "action": "emergency_buy" },
                consequences: { budgetChange: -50000, reputationChange: 10, dialogueResponse: "Es muy costoso y Finanzas nos auditará, pero calmará a la gente. Voy a gestionar la compra." }
            },
            {
                option_id: "B", text: "Que los médicos ajusten tratamientos o den muestras médicas. No tenemos presupuesto para comprar afuera.",
                tags: { "action": "adjust" },
                consequences: { reputationChange: -20, trustChange: -5, dialogueResponse: "Los médicos van a furiosos y los pacientes más aún. Prepárese para reclamos en la OIRS." }
            }
        ]
    },

    // 3. INSPECCION MINISTERIAL
    {
        node_id: "INSPECCION_MIN_S1",
        stakeholderRole: "Jefa Sector Rojo",
        dialogue: "Director, acaba de llegar una auditoría sorpresa del Ministerio. Quieren revisar los registros de IAAS (Infecciones). Mis registros en el Rojo están impecables, pero sé que el Sector Amarillo es un desastre en el papeleo. Si revisan allá, nos sumariarán a todos.",
        options: [
            {
                option_id: "A", text: "Marcela, usted es la experta. Tome el control, vaya al Amarillo y ordene lo que pueda antes de que entren. Tiene autoridad total.",
                tags: { "action": "delegate_power" },
                consequences: { trustChange: 20, supportChange: 10, dialogueResponse: "Entendido. Pondré orden, aunque a Ríos no le guste. Gracias por la confianza." }
            },
            {
                option_id: "B", text: "Yo recibiré a los auditores y trataré de dilatar la visita al Amarillo. Usted quédese en su sector.",
                tags: { "action": "shield" },
                consequences: { trustChange: -10, supportChange: 0, reputationChange: -5, dialogueResponse: "Es arriesgado, Director. Si encuentran algo, su cabeza será la que ruede, no la mía." }
            }
        ]
    },

    // 4. GUERRA DE HORARIOS (SCHEDULE WAR) - BROKEN DOWN FOR CINEMATIC EFFECT
    {
        node_id: "SCHEDULE_WAR_INTRO",
        stakeholderRole: "Jefe Sector Azul",
        dialogue: "Director, buenos días. He adelantado trabajo: aquí está la planificación del Sector Azul. Reservé el Box 5 todas las mañanas para el equipo de investigación. Tenemos el convenio universitario respirándonos en la nuca.",
        options: [{ option_id: "NEXT", text: "Siguiente", tags: {}, consequences: { dialogueResponse: "" } }]
    },
    {
        node_id: "SCHEDULE_WAR_SOTO",
        stakeholderRole: "Jefa Sector Rojo",
        dialogue: "Un momento, Andrés. Director, en mi propuesta prioricé los bloques administrativos. Estamos atrasados con las auditorías IAAS. Además, vi que Andrés bloqueó el Box 5... eso es imposible. Mis TENS lo necesitan para curaciones complejas.",
        options: [{ option_id: "NEXT", text: "Siguiente", tags: {}, consequences: { dialogueResponse: "" } }]
    },
    {
        node_id: "SCHEDULE_WAR_RIOS",
        stakeholderRole: "Jefe Sector Amarillo",
        dialogue: "Con todo respeto, mientras ustedes pelean por auditorías y papers, la sala de espera está que explota. Mi propuesta es simple: todos a atender. Necesito Box, cualquiera, ahora. Si priorizamos 'investigación' sobre la gente, los vecinos quemarán el CESFAM.",
        options: [{ option_id: "NEXT", text: "Siguiente", tags: {}, consequences: { dialogueResponse: "" } }]
    },
    {
        node_id: "SCHEDULE_WAR_GUZMAN_RETORT",
        stakeholderRole: "Jefe Sector Azul",
        dialogue: "Daniel, por favor. Sin investigación no hay prestigio, y sin prestigio no hay fondos. Es visión estratégica.",
        options: [{ option_id: "NEXT", text: "Siguiente", tags: {}, consequences: { dialogueResponse: "" } }]
    },
    {
        node_id: "SCHEDULE_WAR_SOTO_FINAL",
        stakeholderRole: "Jefa Sector Rojo",
        dialogue: "Y sin auditoría nos cierran el CESFAM. Es legalidad. Director, usted decide.",
        options: [
            {
                option_id: "A", text: "Entiendo sus puntos. Pasemos al sistema para resolver los conflictos manualmente.",
                tags: { "action": "open_conflicted_schedule" },
                consequences: { 
                  dialogueResponse: "Bien. Veremos cómo distribuye la miseria.",
                  expected_actions: [
                    {
                      mechanic_id: "scheduler",
                      action_type: "execute_week",
                      target_ref: "global",
                      constraints: { total_resolved: 3 },
                      rule_id: "scheduler_war_rule_v1",
                      effects: {
                        TRUE: { global: { reputation: 3 } },
                        FALSE: { global: { reputation: -4 } }
                      }
                    }
                  ]
                }
            }
        ]
    }
  ],
  sequences: [
    // --- INEVITABLE EVENTS ---

    {
        sequence_id: "SCHEDULE_WAR_SEQ",
        stakeholderRole: "Jefe Sector Azul",
        initialDialogue: "(Los tres jefes entran a su oficina. El ambiente es tenso).",
        nodes: ["SCHEDULE_WAR_INTRO", "SCHEDULE_WAR_SOTO", "SCHEDULE_WAR_RIOS", "SCHEDULE_WAR_GUZMAN_RETORT", "SCHEDULE_WAR_SOTO_FINAL"],
        finalDialogue: "Procederemos a cargar las propuestas en el sistema. Verá alertas rojas donde hay conflictos.",
        consumesTime: false,
        triggerMap: { day: 1, slot: 'mañana' }, 
        isInevitable: true
    },

    {
        sequence_id: "OFFICE_INTRO_SEQ",
        stakeholderRole: "Asistente Administrativa",
        initialDialogue: "Director {playerName}. Soy Sofía Castro, su administrativa de confianza. Lamento no haber podido presentarme antes, la mañana ha sido caótica.",
        nodes: ["INTRO_S1_SALUDO","INTRO_S1_CONTEXTO","INTRO_S1_HORARIOS","INTRO_S1_MAPA","INTRO_S1_CORREOS","INTRO_S1_DOCUMENTOS","INTRO_S1_PC","INTRO_S1_ELECCION"],
        finalDialogue: "Excelente. Le dejo instalarse. Recuerde revisar el mapa para visitar a los equipos.",
        consumesTime: false,
        triggerMap: { day: 1, slot: 'mañana' }, 
        isInevitable: true
    },

    {
        sequence_id: "CRISIS_FARMACIA",
        stakeholderRole: "Asistente Administrativa",
        initialDialogue: "Director, disculpe la interrupción abrupta, pero tenemos una situación crítica en Farmacia.",
        nodes: ["CRISIS_FARM_S1"],
        finalDialogue: "Procederé con su instrucción inmediatamente.",
        triggerMap: { day: 4, slot: 'tarde' }, 
        isInevitable: true
    },
    {
        sequence_id: "INSPECCION_MINISTERIAL",
        stakeholderRole: "Jefa Sector Rojo",
        initialDialogue: "Director, no mire ahora, pero acaba de entrar una comitiva del Ministerio. Es una auditoría sorpresa.",
        nodes: ["INSPECCION_MIN_S1"],
        finalDialogue: "Bien, actuaré rápido para salvar la evaluación del CESFAM.",
        triggerMap: { day: 3, slot: 'tarde' }, 
        isInevitable: true
    },

    // --- STANDARD SEQUENCES ---
    {
      sequence_id: "AZUL_MEETING_1",
      stakeholderRole: "Jefe Sector Azul",
      initialDialogue: "Director, bienvenido. Espero que su gestión esté a la altura de la complejidad técnica de este centro. En el Sector Azul nos enorgullecemos de nuestra excelencia académica. Tenemos asuntos estratégicos que definir.",
      nodes: ["AZUL_S1_RESEARCH_TIME", "AZUL_S2_ELITISM"],
      finalDialogue: "Bien. Veremos si sus decisiones rinden frutos en los indicadores de calidad. Con permiso, tengo una videoconferencia con la Facultad."
    },
    {
      sequence_id: "ROJO_MEETING_1",
      stakeholderRole: "Jefa Sector Rojo",
      initialDialogue: "Buenos días, Director. Soy Marcela Soto. Le adelanto que en el Sector Rojo trabajamos estrictamente apegados a la normativa vigente. No toleraré improvisaciones que pongan en riesgo a mi equipo.",
      nodes: ["ROJO_S1_BURNOUT_BLOCK", "ROJO_S2_PROTOCOL"],
      finalDialogue: "Dejaré constancia de esta reunión en el acta interna. Mientras respetemos los derechos de los funcionarios, nos llevaremos bien."
    },
    {
      sequence_id: "AMARILLO_MEETING_1",
      stakeholderRole: "Jefe Sector Amarillo",
      initialDialogue: "¡Jefe! O sea, Director. Soy el Daniel. Acá en el Amarillo somos de acción, poco papel y harta calle. Pero estamos colapsados, necesitamos ayuda real, no discursos.",
      nodes: ["AMARILLO_S1_EMERGENCY", "AMARILLO_S2_DOCTOR_FLIGHT"],
      finalDialogue: "Ya jefe, gracias por escuchar. Voy volando a ver un caso social complejo. ¡Cualquier cosa me whatsappea!"
    }
  ]
};
