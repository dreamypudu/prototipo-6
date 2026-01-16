import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConversationMode, GameState, GlobalEffectsUI, Stakeholder, StakeholderQuestion, PlayerAction, TimeSlotType, MeetingSequence, ScenarioNode, DecisionLogEntry, InboxEmail, MechanicConfig, SimulatorConfig, GameStatus, QuestionLogEntry } from '../types';
import { INITIAL_GAME_STATE, TIME_SLOTS, DIRECTOR_OBJECTIVES, SECRETARY_ROLE } from '../data/innovatec/constants';
import { scenarios as scenarioData } from '../data/innovatec/scenarios';
import { EMAIL_TEMPLATES } from '../data/innovatec/emails';
import { startLogging, finalizeLogging } from '../services/Timelogger';
import { mechanicEngine } from '../services/MechanicEngine';
import { compareExpectedVsActual } from '../services/ComparisonEngine';
import { buildSessionExport } from '../services/sessionExport';
import { clampReputation, resolveGlobalEffects } from '../services/globalEffects';
import type { DailyEffectSummary } from '../types';
import { INNOVATEC_REGISTRY } from '../mechanics/innovatecRegistry';
import { MechanicProvider } from '../mechanics/MechanicContext';
import { MechanicDispatchAction, OfficeState } from '../mechanics/types';
import { useMechanicLogSync } from '../hooks/useMechanicLogSync';
import { SIMULATOR_CONFIGS } from '../data/simulatorConfigs';

import Header from '../components/Header';
import EndGameScreen from '../components/EndGameScreen';
import WarningPopup from '../components/WarningPopup';
import SplashScreen from '../components/SplashScreen';
import Sidebar from '../components/Sidebar';

type ActiveTab = string;
type SchedulingState = 'none' | 'selecting_slot' | 'selecting_stakeholder' | 'confirming_schedule';
interface InnovatecGameProps {
  onExitToHome?: () => void;
}

const PERIOD_DURATION = 30; // 30 seconds per time slot
const API_BASE_URL =
  (import.meta as any)?.env?.VITE_API_URL ||
  'https://prototipo-5-41cj.onrender.com';

const summarizeDeltas = (
  day: number,
  globalDeltas: { budget?: number; reputation?: number },
  stakeholderDeltas: Record<string, any>,
  stakeholders: Stakeholder[]
): DailyEffectSummary => {
  const parts: string[] = [];
  const b = Number(globalDeltas?.budget || 0);
  const r = Number(globalDeltas?.reputation || 0);
  parts.push(`Presupuesto ${b >= 0 ? '+' : ''}${b}`);
  parts.push(`Reputación ${r >= 0 ? '+' : ''}${r}`);
  const stakeParts: string[] = [];
  Object.entries(stakeholderDeltas || {}).forEach(([id, delta]) => {
    const sh = stakeholders.find(s => s.id === id);
    if (!sh) return;
    const t = Number(delta?.trust || 0);
    const s = Number(delta?.support || 0);
    stakeParts.push(`${sh.name}: confianza ${t >= 0 ? '+' : ''}${t}, apoyo ${s >= 0 ? '+' : ''}${s}`);
  });
  return { day, summary: parts.join(' | '), stakeholderDetails: stakeParts };
};

type ResolvedMechanicConfig = MechanicConfig & {
    label: string;
    tab_id: string;
};

const resolveMechanics = (config: SimulatorConfig | null): ResolvedMechanicConfig[] => {
    if (!config) return [];
    return config.mechanics.flatMap((mechanic) => {
        const registryEntry = INNOVATEC_REGISTRY[mechanic.mechanic_id];
        if (!registryEntry) {
            console.warn(`Mechanic not registered: ${mechanic.mechanic_id}`);
            return [];
        }
        return [{
            ...registryEntry,
            ...mechanic,
            label: mechanic.label ?? registryEntry.label,
            tab_id: mechanic.tab_id ?? registryEntry.tab_id
        }];
    });
};

const getInitialSecretaryActions = (): PlayerAction[] => [
    { label: "Agendar una Reuni├│n", cost: "Gratis", action: "schedule_meeting" },
];


export default function InnovatecGame({ onExitToHome }: InnovatecGameProps): React.ReactElement {
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const sessionStartRef = useRef<number | null>(null);
  const sessionEndRef = useRef<number | null>(null);
  const config = SIMULATOR_CONFIGS.INNOVATEC;
  const [isGameStarted, setIsGameStarted] = useState(false);
  const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);
  const [secretary, setSecretary] = useState<Stakeholder | null>(null);
  const [characterInFocus, setCharacterInFocus] = useState<Stakeholder | null>(null);
  const [currentDialogue, setCurrentDialogue] = useState<string>("");
  const [playerActions, setPlayerActions] = useState<PlayerAction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('interaction');
  
  const [schedulingState, setSchedulingState] = useState<SchedulingState>('none');
  const [selectedSlot, setSelectedSlot] = useState<{ day: number, slot: TimeSlotType } | null>(null);
  const [stakeholderToSchedule, setStakeholderToSchedule] = useState<Stakeholder | null>(null);
  
  const [countdown, setCountdown] = useState(PERIOD_DURATION);
  const [isTimerPaused, setIsTimerPaused] = useState(true);

  const [gameStatus, setGameStatus] = useState<GameStatus>('playing');
  const [endGameMessage, setEndGameMessage] = useState<string>('');
  
  const [currentMeeting, setCurrentMeeting] = useState<{ sequence: MeetingSequence; nodeIndex: number } | null>(null);
  const [warningPopupMessage, setWarningPopupMessage] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [hoveredGlobalEffects, setHoveredGlobalEffects] = useState<GlobalEffectsUI | null>(null);
  const [conversationMode, setConversationMode] = useState<ConversationMode>('idle');
  const [questionsOrigin, setQuestionsOrigin] = useState<ConversationMode | null>(null);
  const [questionsBaseDialogue, setQuestionsBaseDialogue] = useState<string>('');
  const [dailySummary, setDailySummary] = useState<DailyEffectSummary | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const enabledMechanics = resolveMechanics(config);
  const syncLogs = useMechanicLogSync(setGameState);
  const stageTabs = [
    { id: 'stage_1', label: 'Etapa 1: Descubrimiento', status: 'active' as const },
    { id: 'stage_2', label: 'Etapa 2: Ejecucion', status: 'upcoming' as const },
    { id: 'stage_3', label: 'Etapa 3: Cierre', status: 'upcoming' as const }
  ];

  useEffect(() => {
    if (!isGameStarted) return;
    const interval = setInterval(() => {
      syncLogs();
    }, 1000);
    return () => clearInterval(interval);
  }, [isGameStarted, syncLogs]);

  useEffect(() => {
    if (activeTab !== 'data_export') return;
    syncLogs();
  }, [activeTab, syncLogs]);

  const setPersonalizedDialogue = useCallback((dialogue: string) => {
    setCurrentDialogue(dialogue.replace(/{playerName}/g, gameState.playerName));
  }, [gameState.playerName]);

  const handleActionHover = useCallback((effects: GlobalEffectsUI | null) => {
    setHoveredGlobalEffects(effects);
  }, []);

  const showToast = useCallback((msg: string, durationMs = 5000) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), durationMs);
  }, []);

  const hasQuestionsFor = (stakeholder: Stakeholder | null): boolean => {
    if (!stakeholder) return false;
    return Array.isArray(stakeholder.questions) && stakeholder.questions.length > 0;
  };

  const buildPreSequenceActions = (stakeholder: Stakeholder, allowQuestions: boolean): PlayerAction[] => {
    const actions: PlayerAction[] = [];
    if (allowQuestions && hasQuestionsFor(stakeholder)) {
      actions.push({ label: 'Hacer preguntas', cost: 'Opcional', action: 'ask_questions', uiVariant: 'success' });
    }
    actions.push({ label: 'Comenzar Discusion', cost: 'Iniciar', action: 'start_meeting_sequence' });
    return actions;
  };

  const buildPostSequenceActions = (stakeholder: Stakeholder): PlayerAction[] => {
    const actions: PlayerAction[] = [];
    if (hasQuestionsFor(stakeholder)) {
      actions.push({ label: 'Hacer preguntas', cost: 'Opcional', action: 'ask_questions', uiVariant: 'success' });
    }
    actions.push({ label: 'Concluir Reunion', cost: 'Finalizar', action: 'conclude_meeting' });
    return actions;
  };

  const getQuestionRequirementText = (question: StakeholderQuestion): string => {
    const parts: string[] = [];
    if (typeof question.requirements?.trust_min === 'number') parts.push(`Confianza >= ${question.requirements.trust_min}`);
    if (typeof question.requirements?.support_min === 'number') parts.push(`Apoyo >= ${question.requirements.support_min}`);
    if (typeof question.requirements?.reputation_min === 'number') parts.push(`Reputacion >= ${question.requirements.reputation_min}`);
    return parts.join(' | ');
  };

  const canAskQuestion = (question: StakeholderQuestion, stakeholder: Stakeholder, reputation: number): boolean => {
    const req = question.requirements;
    if (!req) return true;
    if (typeof req.trust_min === 'number' && stakeholder.trust < req.trust_min) return false;
    if (typeof req.support_min === 'number' && stakeholder.support < req.support_min) return false;
    if (typeof req.reputation_min === 'number' && reputation < req.reputation_min) return false;
    return true;
  };

  const hasCompletedSequenceForRole = (role: string, completedSequences: string[]) => {
    return scenarioData.sequences.some(
      seq => seq.stakeholderRole === role && completedSequences.includes(seq.sequence_id)
    );
  };

  const buildQuestionListActions = (
    stakeholder: Stakeholder,
    reputation: number,
    origin: ConversationMode | null
  ): PlayerAction[] => {
    const actions = stakeholder.questions
      .map(question => {
        const alreadyAsked = stakeholder.questionsAsked.includes(question.question_id);
        const canAsk = canAskQuestion(question, stakeholder, reputation);
        const suffix = canAsk ? '' : ' (Bloqueada)';
        return {
          label: `${question.text}${suffix}`,
          cost: canAsk ? 'Pregunta' : 'Bloqueada',
          action: `question:${question.question_id}`,
          uiVariant: canAsk ? (alreadyAsked ? 'muted' : 'default') : 'danger',
          isLocked: !canAsk
        };
      });

    if (origin === 'questions_only') {
      actions.push({ label: 'Concluir Reunion', cost: 'Finalizar', action: 'conclude_meeting' });
    } else {
      actions.push({ label: 'Volver', cost: 'Volver', action: 'close_questions' });
    }
    return actions;
  };

  const buildQuestionAnswerActions = (origin: ConversationMode | null): PlayerAction[] => {
    const actions: PlayerAction[] = [
      { label: 'Seguir preguntando', cost: 'Opcional', action: 'return_to_questions', uiVariant: 'success' }
    ];
    if (origin === 'pre_sequence') {
      actions.push({ label: 'Comenzar Discusion', cost: 'Iniciar', action: 'start_meeting_sequence' });
    }
    if (origin === 'post_sequence' || origin === 'questions_only') {
      actions.push({ label: 'Concluir Reunion', cost: 'Finalizar', action: 'conclude_meeting' });
    }
    return actions;
  };


 useEffect(() => {
    if (gameStatus !== 'playing' || !isGameStarted) return;

    const { stakeholders, day, budget, reputation, projectProgress, criticalWarnings } = gameState;
    let newWarnings: string[] = [];
    let stateChanges: Partial<GameState> = {};
    let updatedStakeholders = [...stakeholders];

    // --- Win Condition ---
    if (projectProgress >= DIRECTOR_OBJECTIVES.minProgress) {
        setEndGameMessage(`┬íProyecto Exitoso! Has navegado las complejidades de la organizaci├│n y la implementaci├│n de la plataforma de IA es un ├®xito. Cumpliste el plazo, te mantuviste en presupuesto y manejaste las relaciones cr├¡ticas.`);
        setGameStatus('won');
        return;
    }

    // --- Critical Warning Conditions ---
    
    // 1. Untrusted Stakeholder
    const requiredStakeholders = stakeholders.filter(s => DIRECTOR_OBJECTIVES.requiredStakeholdersRoles.includes(s.role));
    let stakeholdersWereUpdated = false;
    requiredStakeholders.forEach(s => {
        if (s.trust < DIRECTOR_OBJECTIVES.minTrustWithRequired && s.status !== 'critical') {
            const warningMsg = `Proyecto en Riesgo Cr├¡tico: La confianza con ${s.name} (${s.role}) ha colapsado, poniendo en peligro el proyecto.`;
            if (!criticalWarnings.includes(warningMsg)) {
                newWarnings.push(warningMsg);
                updatedStakeholders = updatedStakeholders.map(sh => sh.name === s.name ? { ...sh, status: 'critical' } : sh);
                stakeholdersWereUpdated = true;
            }
        }
    });
     if (stakeholdersWereUpdated) {
        stateChanges.stakeholders = updatedStakeholders;
    }
    
    // 2. Deadline
    const deadlineWarning = `Proyecto en Riesgo Cr├¡tico: Plazo Excedido. El proyecto ha superado los ${DIRECTOR_OBJECTIVES.maxDeadline} d├¡as.`;
    if (day > DIRECTOR_OBJECTIVES.maxDeadline && !criticalWarnings.includes(deadlineWarning)) {
        newWarnings.push(deadlineWarning);
    }

    // 3. Budget
    const budgetWarning = `Proyecto en Riesgo Cr├¡tico: Presupuesto Agotado. El proyecto es financieramente insolvente.`;
    if (budget < DIRECTOR_OBJECTIVES.minBudget && !criticalWarnings.includes(budgetWarning)) {
        newWarnings.push(budgetWarning);
    }
    
    // 4. Reputation
    const reputationWarning = `Proyecto en Riesgo Cr├¡tico: Reputaci├│n Colapsada. Se ha perdido el apoyo interno y del directorio.`;
    if (reputation < DIRECTOR_OBJECTIVES.minReputation && !criticalWarnings.includes(reputationWarning)) {
        newWarnings.push(reputationWarning);
    }

    if (newWarnings.length > 0) {
        setGameState(prev => ({
            ...prev,
            ...stateChanges,
            criticalWarnings: [...prev.criticalWarnings, ...newWarnings]
        }));
        setWarningPopupMessage(newWarnings[0]);
        setIsTimerPaused(true);
    }
}, [gameState, gameStatus, isGameStarted]);

  useEffect(() => {
    if (gameStatus === 'playing') return;
    if (sessionEndRef.current === null) {
      sessionEndRef.current = Date.now();
    }
    setGameState(prev => {
      const newComparisons = compareExpectedVsActual(
        prev.expectedActions,
        prev.canonicalActions,
        prev.comparisons,
        { includeNotDone: true }
      );
      if (newComparisons.length === 0) return prev;
      return { ...prev, comparisons: [...prev.comparisons, ...newComparisons] };
    });
  }, [gameStatus]);


  const advanceTime = useCallback((currentState: GameState): GameState => {
    let nextSlotIndex = TIME_SLOTS.indexOf(currentState.timeSlot) + 1;
    let nextDay = currentState.day;
    let newEvents: string[] = [];
    let historyUpdate = {};
    let completedDay: number | null = null;

    if (nextSlotIndex >= TIME_SLOTS.length) {
        nextSlotIndex = 0;
        nextDay++;
        historyUpdate = { [currentState.day]: currentState.stakeholders };
        completedDay = currentState.day;
    }
    const nextSlot = TIME_SLOTS[nextSlotIndex];

    let newState = { 
        ...currentState, 
        day: nextDay, 
        timeSlot: nextSlot,
        history: { ...currentState.history, ...historyUpdate }
     };

    if (nextDay > currentState.day) {
        newEvents.push(`Ha comenzado el d├¡a ${nextDay}. Un nuevo d├¡a trae nuevos desaf├¡os.`);
        
        const updatedStakeholders = newState.stakeholders.map(sh => {
            const updatedCommitments = sh.commitments.map(c => {
                if (c.status === 'pending' && nextDay > c.dayDue) {
                    newEvents.push(`┬íPromesa a ${sh.name} ('${c.description}') rota! La confianza ha sido da├▒ada.`);
                    return { ...c, status: 'broken' as const };
                }
                return c;
            });

            const newlyBrokenCount = updatedCommitments.filter(c => c.status === 'broken').length - sh.commitments.filter(c => c.status === 'broken').length;
            let newTrust = sh.trust - (newlyBrokenCount * 20);

            if (sh.role !== SECRETARY_ROLE && (sh.lastMetDay || 0) < currentState.day - 3) {
                 newTrust = newTrust - 2;
            }
            
            return { 
                ...sh, 
                commitments: updatedCommitments,
                trust: Math.max(0, newTrust)
            };
        });
        newState.stakeholders = updatedStakeholders;
    }

    if (completedDay !== null) {
        (newState as any).__completedDay = completedDay;
    }
    newState.eventsLog = [...newState.eventsLog, ...newEvents];
    return newState;
  }, []);

  const applyDailyDeltas = useCallback(
    (prev: GameState, completedDay: number, globalDeltas: any, stakeholderDeltas: Record<string, any>): GameState => {
      const deltaBudget = Number(globalDeltas?.budget || 0);
      const deltaReputation = Number(globalDeltas?.reputation || 0);
      const nextBudget = prev.budget + deltaBudget;
      const nextReputation = clampReputation(prev.reputation + deltaReputation);

      const updatedStakeholders = prev.stakeholders.map((sh) => {
        const deltas = stakeholderDeltas?.[sh.id];
        if (!deltas) return sh;
        const trustDelta = Number(deltas.trust || 0);
        const supportDelta = Number(deltas.support || 0);
        return {
          ...sh,
          trust: Math.max(0, Math.min(100, sh.trust + trustDelta)),
          support: Math.max(sh.minSupport, Math.min(sh.maxSupport, sh.support + supportDelta)),
        };
      });

      const summary = `Resoluci├│n d├¡a ${completedDay}: presupuesto ${deltaBudget >= 0 ? '+' : ''}${deltaBudget}, reputaci├│n ${deltaReputation >= 0 ? '+' : ''}${deltaReputation}`;
      return {
        ...prev,
        budget: nextBudget,
        reputation: nextReputation,
        stakeholders: updatedStakeholders,
        eventsLog: [...prev.eventsLog, summary],
      };
    },
    []
  );

  const syncDayWithBackend = useCallback(
    async (completedDay: number, snapshot: GameState) => {
      try {
        // 1) Persist snapshot
        const exportPayload = buildSessionExport({
          gameState: snapshot,
          config,
          sessionId: sessionIdRef.current,
          startedAt: sessionStartRef.current ?? Date.now(),
          endedAt: Date.now(),
        });
        await fetch(`${API_BASE_URL.replace(/\/$/, '')}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(exportPayload),
        });

        // 2) Resolve daily effects
        const resp = await fetch(
          `${API_BASE_URL.replace(/\/$/, '')}/sessions/${exportPayload.session_metadata.session_id}/resolve_day_effects?day=${completedDay}`,
          { method: 'POST' }
        );
        if (!resp.ok) {
          console.warn('resolve_day_effects failed', await resp.text());
          return;
        }
        const data = await resp.json();
        const globalDeltas = data.global_deltas || {};
        const stakeholderDeltas = data.stakeholder_deltas || {};

        setGameState((prev) => applyDailyDeltas(prev, completedDay, globalDeltas, stakeholderDeltas));
        const summary = summarizeDeltas(completedDay, globalDeltas, stakeholderDeltas, snapshot.stakeholders);
        setDailySummary(summary);
      } catch (err) {
        console.warn('syncDayWithBackend error', err);
      }
    },
    [config, applyDailyDeltas]
  );

  const returnToSecretary = (message: string) => {
    if (secretary) {
        setCharacterInFocus(secretary);
        setPersonalizedDialogue(message);
        setPlayerActions(getInitialSecretaryActions());
        setSchedulingState('none');
        setCountdown(PERIOD_DURATION);
        setConversationMode('idle');
        setQuestionsOrigin(null);
        setQuestionsBaseDialogue('');
    }
  };
  
  const presentScenario = useCallback((scenario: ScenarioNode) => {
    setPersonalizedDialogue(scenario.dialogue);
    setPlayerActions(
      scenario.options.map(opt => {
        const effects = resolveGlobalEffects(opt.consequences);
        return { label: opt.text, action: opt.option_id, cost: "Decisi├│n", globalEffectsUI: effects.ui };
      })
    );
    startLogging(scenario.node_id);
    mechanicEngine.emitEvent('dialogue', 'scenario_presented', { node_id: scenario.node_id });
  }, [setPersonalizedDialogue]);

  const startSequence = useCallback((sequence: MeetingSequence, stakeholder: Stakeholder) => {
    setCharacterInFocus(stakeholder);
    setCurrentMeeting({ sequence, nodeIndex: 0 });
    setPersonalizedDialogue(sequence.initialDialogue);
    setConversationMode('pre_sequence');
    const allowQuestions = hasCompletedSequenceForRole(stakeholder.role, gameState.completedSequences);
    setPlayerActions(buildPreSequenceActions(stakeholder, allowQuestions));
  }, [setPersonalizedDialogue, buildPreSequenceActions, gameState.completedSequences]);


  const advanceTimeAndUpdateFocus = useCallback((justCompletedSequenceId?: string) => {
    let currentState = { ...gameState };

    // Update completed sequences list
    if (justCompletedSequenceId && !currentState.completedSequences.includes(justCompletedSequenceId)) {
      currentState.completedSequences = [...currentState.completedSequences, justCompletedSequenceId];
    }
    
    // --- New Email Trigger Logic ---
    const previousCharacter = characterInFocus;
    if (previousCharacter && justCompletedSequenceId) {
        const hasAlreadyReceivedAvailabilityEmail = currentState.inbox.some(inboxEmail => {
            const template = EMAIL_TEMPLATES.find(t => t.email_id === inboxEmail.email_id);
            return template && 
                   template.trigger.type === 'ON_MEETING_COMPLETE' &&
                   template.trigger.stakeholder_id === previousCharacter.id;
        });

        if (!hasAlreadyReceivedAvailabilityEmail) {
            const matchingTemplates = EMAIL_TEMPLATES.filter(t => 
                t.trigger.type === 'ON_MEETING_COMPLETE' && t.trigger.stakeholder_id === previousCharacter.id
            );
            if (matchingTemplates.length > 0) {
                const chosenTemplate = matchingTemplates[Math.floor(Math.random() * matchingTemplates.length)];
                const newEmail: InboxEmail = {
                    email_id: chosenTemplate.email_id,
                    dayReceived: currentState.day,
                    isRead: false
                };
                currentState.inbox = [...currentState.inbox, newEmail];
            }
        }
    }


    // Update last met day for the stakeholder
    let stateAfterMeetingEnd = { ...currentState };
    if (previousCharacter && previousCharacter.role !== SECRETARY_ROLE) {
        stateAfterMeetingEnd.stakeholders = stateAfterMeetingEnd.stakeholders.map(sh =>
            sh.name === previousCharacter.name ? { ...sh, lastMetDay: currentState.day } : sh
        );
    }
    const newState = advanceTime(stateAfterMeetingEnd);
    setGameState(newState);
    syncLogs();
    const completedDay = (newState as any).__completedDay as number | null;
    if (completedDay !== null && completedDay > 0) {
        const snapshot = { ...newState };
        delete (snapshot as any).__completedDay;
        syncDayWithBackend(completedDay, snapshot);
    }
    
    // Check for next meeting
    const upcomingMeeting = newState.calendar.find(m => m.day === newState.day && m.slot === newState.timeSlot);

    if (upcomingMeeting) {
        const targetStakeholder = newState.stakeholders.find(s => s.name === upcomingMeeting.stakeholderName);
        if (targetStakeholder) {
            const willCancel = targetStakeholder.mood === 'hostile' && Math.random() < 0.33;
            if (willCancel) {
                setGameState(latestState => ({
                    ...latestState,
                    calendar: latestState.calendar.filter(m => m !== upcomingMeeting)
                }));
                returnToSecretary(`CTO, me acaban de informar que ${targetStakeholder.name} ha cancelado la reuni├│n. Su oficina cit├│ circunstancias imprevistas. Parece que su humor es bastante malo.`);
                return;
            }
            
            setCharacterInFocus(targetStakeholder);

            const sequence = scenarioData.sequences.find(seq => 
                seq.stakeholderRole === targetStakeholder.role &&
                !newState.completedSequences.includes(seq.sequence_id)
            );
            if (sequence) {
                startSequence(sequence, targetStakeholder);
            } else {
                const scenario = scenarioData.scenarios.find(s => s.stakeholderRole === targetStakeholder.role && !newState.completedScenarios.includes(s.node_id));
                if (scenario) {
                     presentScenario(scenario);
                } else if (hasQuestionsFor(targetStakeholder)) {
                     setConversationMode('questions_only');
                     setQuestionsOrigin('questions_only');
                     setQuestionsBaseDialogue('(No hay mas reuniones pendientes. Puedes hacer preguntas si lo deseas.)');
                     setPersonalizedDialogue('(No hay mas reuniones pendientes. Puedes hacer preguntas si lo deseas.)');
                     setPlayerActions(buildQuestionListActions(targetStakeholder, newState.reputation, 'questions_only'));
                } else {
                     setPersonalizedDialogue("Hemos discutido todo lo necesario por ahora. Gracias por tu tiempo.");
                     setPlayerActions([{ label: "Concluir Reunion", cost: "Finalizar", action: "conclude_meeting" }]);
                }
            }
            setCountdown(PERIOD_DURATION);
        }
    } else {
        let secretaryMessage = `Hemos pasado al bloque de ${newState.timeSlot} del d├¡a ${newState.day}. La agenda est├í libre. ┬┐En qu├® puedo asistirle?`;
        if (previousCharacter && previousCharacter.role !== SECRETARY_ROLE) {
             secretaryMessage = `Su reuni├│n con ${previousCharacter.name} ha concluido. Ahora estamos en el bloque de ${newState.timeSlot} del d├¡a ${newState.day}. La agenda est├í libre. ┬┐En qu├® puedo asistirle?`;
        }
        returnToSecretary(secretaryMessage);
    }
  }, [gameState, characterInFocus, secretary, advanceTime, setPersonalizedDialogue, presentScenario, startSequence, hasQuestionsFor, buildQuestionListActions, syncLogs]);
  
   useEffect(() => {
    if (isTimerPaused || activeTab !== 'interaction' || gameStatus !== 'playing' || !isGameStarted) {
        return;
    }

    const timer = setInterval(() => {
        setCountdown(prev => {
            if (prev <= 1) {
                advanceTimeAndUpdateFocus();
                return PERIOD_DURATION;
            }
            return prev - 1;
        });
    }, 1000);

    return () => clearInterval(timer);
  }, [isTimerPaused, activeTab, advanceTimeAndUpdateFocus, gameStatus, isGameStarted]);


  useEffect(() => {
    if (!isGameStarted) return;

    const secretaryChar = gameState.stakeholders.find(s => s.role === SECRETARY_ROLE);
    if (secretaryChar) {
      setSecretary(secretaryChar);
      setCharacterInFocus(secretaryChar);
      setPersonalizedDialogue(`Bienvenido, ${gameState.playerName}. El 'Proyecto Quantum Leap' es nuestra m├íxima prioridad. Estoy aqu├¡ para asistirle. ┬┐C├│mo desea proceder?`);
      setPlayerActions(getInitialSecretaryActions());
      setIsTimerPaused(true);
      
      // Trigger welcome email on start
       setGameState(prev => {
           const welcomeEmail = EMAIL_TEMPLATES.find(t => t.email_id === 'email-001-welcome');
           if (welcomeEmail && !prev.inbox.some(e => e.email_id === 'email-001-welcome')) {
               return {
                   ...prev,
                   inbox: [...prev.inbox, { email_id: 'email-001-welcome', dayReceived: 1, isRead: false }]
               }
           }
           return prev;
       });
    }
  }, [isGameStarted, gameState.playerName, setPersonalizedDialogue]);

  useEffect(() => {
    if (characterInFocus?.role === SECRETARY_ROLE && schedulingState === 'none') {
        setPlayerActions(getInitialSecretaryActions());
    }
  }, [characterInFocus, schedulingState]);

  const handleAskQuestion = (question: StakeholderQuestion) => {
    if (!characterInFocus) return;
    setGameState(prev => {
        const updatedStakeholders = prev.stakeholders.map(sh => {
            if (sh.id !== characterInFocus.id) return sh;
            const alreadyAsked = sh.questionsAsked.includes(question.question_id);
            if (alreadyAsked) return sh;
            return {
                ...sh,
                questionsAsked: [...sh.questionsAsked, question.question_id]
            };
        });

        const questionLogEntry: QuestionLogEntry = {
            day: prev.day,
            timeSlot: prev.timeSlot,
            stakeholder_id: characterInFocus.id,
            question_id: question.question_id,
            was_locked: false,
            trust_at_ask: characterInFocus.trust,
            support_at_ask: characterInFocus.support,
            reputation_at_ask: prev.reputation,
            timestamp: Date.now()
        };

        return {
            ...prev,
            stakeholders: updatedStakeholders,
            questionLog: [...prev.questionLog, questionLogEntry],
            eventsLog: [...prev.eventsLog, `Pregunta a ${characterInFocus.name}: ${question.text}`]
        };
    });
  };


  const handleRequestMeeting = (stakeholder: Stakeholder) => {
    if (!secretary || !selectedSlot) return;

    setSchedulingState('confirming_schedule');
    setCharacterInFocus(secretary);
    setStakeholderToSchedule(stakeholder);
    setPersonalizedDialogue(`Desea agendar una reuni├│n con ${stakeholder.name} el d├¡a ${selectedSlot.day}, en el bloque de ${selectedSlot.slot}. ┬┐Confirmo la cita?`);
    setPlayerActions([
        { label: "S├¡, confirmar.", cost: "Confirmar", action: "confirm_schedule" },
        { label: "No, cancelar.", cost: "Cancelar", action: "cancel_schedule" }
    ]);
  };

  const handleSlotSelect = (day: number, slot: TimeSlotType) => {
    setSelectedSlot({ day, slot });
    setSchedulingState('selecting_stakeholder');
    setPersonalizedDialogue(`Ha seleccionado el bloque de ${slot}, d├¡a ${day}. ┬┐Con qui├®n desea reunirse?`);
  };

  const handlePlayerAction = async (action: PlayerAction) => {
    if (!characterInFocus || gameStatus !== 'playing') return;
    
    if (action.action === 'ask_questions') {
        const origin = conversationMode === 'pre_sequence' || conversationMode === 'post_sequence'
          ? conversationMode
          : 'questions_only';
        setQuestionsOrigin(origin);
        setQuestionsBaseDialogue(currentDialogue);
        setConversationMode('questions');
        setPlayerActions(buildQuestionListActions(characterInFocus, gameState.reputation, origin));
        setIsLoading(false);
        return;
    }

    if (action.action === 'close_questions') {
        const origin = questionsOrigin;
        setQuestionsOrigin(null);
        setConversationMode(origin ?? 'idle');
        if (questionsBaseDialogue) {
          setPersonalizedDialogue(questionsBaseDialogue);
        }
        setQuestionsBaseDialogue('');
        if (origin === 'pre_sequence') {
            const allowQuestions = hasCompletedSequenceForRole(characterInFocus.role, gameState.completedSequences);
            setPlayerActions(buildPreSequenceActions(characterInFocus, allowQuestions));
        } else if (origin === 'post_sequence') {
            setPlayerActions(buildPostSequenceActions(characterInFocus));
        }
        setIsLoading(false);
        return;
    }

    if (action.action === 'return_to_questions') {
        const origin = questionsOrigin ?? 'questions_only';
        setConversationMode('questions');
        if (questionsBaseDialogue) {
          setPersonalizedDialogue(questionsBaseDialogue);
        }
        setPlayerActions(buildQuestionListActions(characterInFocus, gameState.reputation, origin));
        setIsLoading(false);
        return;
    }

    if (action.action.startsWith('question:')) {
        const questionId = action.action.split(':')[1];
        const question = characterInFocus.questions.find(q => q.question_id === questionId);
        if (!question) {
            setIsLoading(false);
            return;
        }
        const alreadyAsked = characterInFocus.questionsAsked.includes(question.question_id);
        const canAsk = canAskQuestion(question, characterInFocus, gameState.reputation);
        if (!canAsk) {
            const reqText = getQuestionRequirementText(question);
            const message = reqText ? `No puedo responder eso aun. Requisitos: ${reqText}.` : 'No puedo responder eso aun.';
            setPersonalizedDialogue(message);
            setPlayerActions(buildQuestionListActions(characterInFocus, gameState.reputation, questionsOrigin));
            setIsLoading(false);
            return;
        }

        handleAskQuestion(question);
        setPersonalizedDialogue(question.answer);
        setPlayerActions(buildQuestionAnswerActions(questionsOrigin));
        setIsLoading(false);
        return;
    }

    const processLog = finalizeLogging(action.action);

    setIsLoading(true);
    setPersonalizedDialogue('');

    if (currentMeeting) {
        const { sequence, nodeIndex } = currentMeeting;
        switch (action.action) {
            case 'start_meeting_sequence': {
                setConversationMode('in_sequence');
                const firstNodeId = sequence.nodes[0];
                const scenario = scenarioData.scenarios.find(s => s.node_id === firstNodeId);
                if (scenario) {
                    presentScenario(scenario);
                }
                setIsLoading(false);
                return;
            }
            case 'NEXT': {
                const nextNodeIndex = nodeIndex + 1;
                if (nextNodeIndex >= sequence.nodes.length) {
                    setPersonalizedDialogue(sequence.finalDialogue);
                    setConversationMode('post_sequence');
                    setPlayerActions(buildPostSequenceActions(characterInFocus));
                    setIsLoading(false);
                    return;
                }
                setCurrentMeeting(prev => ({ ...prev!, nodeIndex: nextNodeIndex }));
                const nextNodeId = sequence.nodes[nextNodeIndex];
                const nextScenario = scenarioData.scenarios.find(s => s.node_id === nextNodeId);
                if (nextScenario) {
                    presentScenario(nextScenario);
                }
                setIsLoading(false);
                return;
            }
            case 'continue_meeting_sequence': {
                const nextNodeIndex = nodeIndex + 1;
                setCurrentMeeting(prev => ({ ...prev!, nodeIndex: nextNodeIndex }));
                const nextNodeId = sequence.nodes[nextNodeIndex];
                const nextScenario = scenarioData.scenarios.find(s => s.node_id === nextNodeId);
                if (nextScenario) {
                    presentScenario(nextScenario);
                }
                setIsLoading(false);
                return;
            }
            case 'end_meeting_sequence':
                setPersonalizedDialogue(sequence.finalDialogue);
                setConversationMode('post_sequence');
                setPlayerActions(buildPostSequenceActions(characterInFocus));
                setIsLoading(false);
                return;
        }
    }

    if (characterInFocus.role === SECRETARY_ROLE) {
        switch (action.action) {
            case 'schedule_meeting':
                setSchedulingState('selecting_slot');
                setPersonalizedDialogue("Por favor, seleccione un bloque disponible en el calendario para la reuni├│n.");
                setPlayerActions([]);
                setIsLoading(false);
                return;
            case 'confirm_schedule':
                if (stakeholderToSchedule && selectedSlot) {
                    const newMeeting = { stakeholderName: stakeholderToSchedule.name, day: selectedSlot.day, slot: selectedSlot.slot };
                    mechanicEngine.emitEvent('calendar', 'meeting_scheduled', {
                        stakeholder_id: stakeholderToSchedule.id,
                        day: selectedSlot.day,
                        time_slot: selectedSlot.slot
                    });
                    mechanicEngine.emitCanonicalAction(
                        'calendar',
                        'schedule_meeting',
                        `stakeholder:${stakeholderToSchedule.id}`,
                        {
                            day: selectedSlot.day,
                            time_slot: selectedSlot.slot,
                            scheduled_at: Date.now()
                        }
                    );
                    setGameState(prev => {
                        const newState = {
                            ...prev,
                            calendar: [...prev.calendar, newMeeting].sort((a,b) => a.day - b.day || TIME_SLOTS.indexOf(a.slot) - TIME_SLOTS.indexOf(b.slot))
                        };
                        
                        // Implicit Decision Logging
                        const preference = newState.stakeholder_preferences[stakeholderToSchedule.id];
                        let respects_preference = null;
                        if (preference) {
                            const [dayOfWeekStr, slotStr] = preference.split('_');
                            const dayMap: { [key: string]: number } = { 'MONDAY': 0, 'TUESDAY': 1, 'WEDNESDAY': 2, 'THURSDAY': 3, 'FRIDAY': 4, 'SATURDAY': 5, 'SUNDAY': 6 };
                            const preferenceDayIndex = dayMap[dayOfWeekStr.toUpperCase()];
                            
                            const selectedDayIndex = (selectedSlot.day - 1) % 7;
                            
                            respects_preference = (preferenceDayIndex === selectedDayIndex && slotStr === selectedSlot.slot);
                        }

                        const logEntry = {
                            event: 'schedule_meeting',
                            metadata: { 
                                stakeholderId: stakeholderToSchedule.id,
                                stakeholderName: stakeholderToSchedule.name,
                                selectedSlot: selectedSlot,
                                preference: preference || 'none',
                                respects_preference: respects_preference
                             },
                            day: prev.day,
                            timeSlot: prev.timeSlot,
                            timestamp: Date.now()
                        };

                        newState.playerActionsLog = [...newState.playerActionsLog, logEntry];

                        return newState;
                    });
                    returnToSecretary(`Excelente. He confirmado su reuni├│n con ${stakeholderToSchedule.name} el d├¡a ${selectedSlot.day}, durante el bloque de ${selectedSlot.slot}.`);
                    setStakeholderToSchedule(null);
                    setSelectedSlot(null);
                }
                setIsLoading(false);
                return;
            case 'cancel_schedule':
                 returnToSecretary("Muy bien, cancelar├® la solicitud. ┬┐C├│mo procedemos?");
                 setStakeholderToSchedule(null);
                 setSelectedSlot(null);
                 setIsLoading(false);
                 return;
        }
    }
    
    if (action.action === 'conclude_meeting') {
        const justCompletedSequenceId = currentMeeting?.sequence.sequence_id;
        setCurrentMeeting(null);
        setConversationMode('idle');
        setQuestionsOrigin(null);
        setQuestionsBaseDialogue('');
        advanceTimeAndUpdateFocus(justCompletedSequenceId);
        setIsLoading(false);
        return;
    }

    const currentScenarioId = currentMeeting 
        ? currentMeeting.sequence.nodes[currentMeeting.nodeIndex]
        : scenarioData.scenarios.find(s => s.stakeholderRole === characterInFocus.role && !gameState.completedScenarios.includes(s.node_id))?.node_id;

    const scenario = scenarioData.scenarios.find(s => s.node_id === currentScenarioId);

    if (scenario) {
        const option = scenario.options.find(o => o.option_id === action.action);
        if (option) {
            const { consequences } = option;
            const globalEffects = resolveGlobalEffects(consequences);
            setHoveredGlobalEffects(null);
            mechanicEngine.emitEvent('dialogue', 'decision_made', {
                node_id: scenario.node_id,
                option_id: option.option_id
            });
            if (Array.isArray(consequences?.expected_actions) && consequences.expected_actions.length > 0) {
                mechanicEngine.registerExpectedActions(scenario.node_id, option.option_id, consequences.expected_actions);
                const toastText = characterInFocus?.name ? `${characterInFocus.name} recordará eso` : 'NPC recordará eso';
                showToast(toastText);
            }

            setGameState(prev => {
                const newStakeholders = prev.stakeholders.map(sh => {
                    if (sh.name === characterInFocus.name) {
                        return {
                            ...sh,
                            trust: Math.max(0, Math.min(100, sh.trust + (consequences.trustChange ?? 0))),
                            support: Math.max(sh.minSupport, Math.min(sh.maxSupport, sh.support + (consequences.supportChange ?? 0))),
                        };
                    }
                    return sh;
                });

                const globalEffectsBefore = { budget: prev.budget, reputation: prev.reputation };
                const nextBudget = prev.budget + globalEffects.deltas.budget;
                const nextReputation = clampReputation(prev.reputation + globalEffects.deltas.reputation);
                const globalEffectsAfter = { budget: nextBudget, reputation: nextReputation };
                const decisionLogEntry: DecisionLogEntry = {
                    day: prev.day,
                    timeSlot: prev.timeSlot,
                    stakeholder: characterInFocus.name,
                    nodeId: scenario.node_id,
                    choiceId: option.option_id,
                    choiceText: option.text,
                    consequences: consequences,
                    globalEffectsShown: globalEffects.ui,
                    globalEffectsApplied: globalEffects.real,
                    globalEffectsBefore,
                    globalEffectsAfter
                };

                return {
                    ...prev,
                    budget: nextBudget,
                    reputation: nextReputation,
                    projectProgress: Math.max(0, Math.min(100, prev.projectProgress + (consequences.projectProgressChange ?? 0))),
                    stakeholders: newStakeholders,
                    completedScenarios: [...prev.completedScenarios, scenario.node_id],
                    eventsLog: [...prev.eventsLog, `Decisi├│n con ${characterInFocus.name}: ${action.label}`],
                    decisionLog: [...prev.decisionLog, decisionLogEntry],
                    processLog: processLog ? [...prev.processLog, processLog] : prev.processLog,
                };
            });
            
            setPersonalizedDialogue(consequences.dialogueResponse);

            if (currentMeeting) {
                if (currentMeeting.nodeIndex >= currentMeeting.sequence.nodes.length - 1) {
                    setPlayerActions([{ label: "Finalizar Discusi├│n", cost: "Continuar", action: "end_meeting_sequence" }]);
                } else {
                    setPlayerActions([{ label: "Continuar...", cost: "Continuar", action: "continue_meeting_sequence" }]);
                }
            } else {
                if (hasQuestionsFor(characterInFocus)) {
                    setConversationMode('post_sequence');
                    setPlayerActions(buildPostSequenceActions(characterInFocus));
                } else {
                    setPlayerActions([{ label: "Concluir Reunion", cost: "Finalizar", action: "conclude_meeting" }]);
                }
            }
            setCountdown(PERIOD_DURATION);
        }
    }
    
    setIsLoading(false);
  };

  const handleManualAdvance = () => {
    if (gameStatus !== 'playing') return;
    advanceTimeAndUpdateFocus();
    setCountdown(PERIOD_DURATION);
  };

  const handleMarkEmailAsRead = (emailId: string) => {
    setGameState(prev => {
        const updatedInbox = prev.inbox.map(email => 
            email.email_id === emailId ? { ...email, isRead: true } : email
        );

        const emailTemplate = EMAIL_TEMPLATES.find(t => t.email_id === emailId);
        let updatedPreferences = prev.stakeholder_preferences;

        if (emailTemplate?.grants_information && emailTemplate.trigger.type === 'ON_MEETING_COMPLETE') {
            const stakeholderId = emailTemplate.trigger.stakeholder_id;
            updatedPreferences = {
                ...prev.stakeholder_preferences,
                [stakeholderId]: emailTemplate.grants_information
            };
        }
        
        const logEntry = {
            event: 'read_email',
            metadata: { email_id: emailId },
            day: prev.day,
            timeSlot: prev.timeSlot,
            timestamp: Date.now()
        };

        return {
            ...prev,
            inbox: updatedInbox,
            stakeholder_preferences: updatedPreferences,
            playerActionsLog: [...prev.playerActionsLog, logEntry]
        };
    });
 };

 const handleSidebarNavigate = (tab: ActiveTab) => {
    setActiveTab(tab);
  };

  const handleReturnHome = () => {
    if (onExitToHome) {
      onExitToHome();
      return;
    }
    setIsSidebarOpen(false);
    setGameStatus('playing');
    setEndGameMessage('');
    setWarningPopupMessage(null);
    setCurrentMeeting(null);
    setCharacterInFocus(null);
    setCurrentDialogue('');
    setPlayerActions([]);
    setIsLoading(false);
    setIsTimerPaused(true);
    setCountdown(PERIOD_DURATION);
    setActiveTab('interaction');
    setGameState(INITIAL_GAME_STATE);
    setHoveredGlobalEffects(null);
    setSecretary(null);
    setSchedulingState('none');
    setSelectedSlot(null);
    setStakeholderToSchedule(null);
    setConversationMode('idle');
    setQuestionsOrigin(null);
    setQuestionsBaseDialogue('');
    sessionStartRef.current = null;
    sessionEndRef.current = null;
    sessionIdRef.current = crypto.randomUUID();
    setIsGameStarted(false);
  };

  const handleStartGame = (name: string) => {
    sessionStartRef.current = Date.now();
    sessionEndRef.current = null;
    sessionIdRef.current = crypto.randomUUID();
    setGameState({ ...INITIAL_GAME_STATE, playerName: name });
    setConversationMode('idle');
    setQuestionsOrigin(null);
    setQuestionsBaseDialogue('');
    setIsGameStarted(true);
    if (enabledMechanics.length > 0) {
      setActiveTab(enabledMechanics[0].tab_id);
    }
  };

  const sessionExport = buildSessionExport({
    gameState,
    config,
    sessionId: sessionIdRef.current,
    startedAt: sessionStartRef.current ?? undefined,
    endedAt: sessionEndRef.current ?? undefined
  });
  const dispatch = (action: MechanicDispatchAction) => {
    switch (action.type) {
      case 'mark_email_read':
        handleMarkEmailAsRead(action.emailId);
        return;
      case 'update_notes':
        setGameState((prev) => ({ ...prev, playerNotes: action.notes }));
        return;
      case 'navigate_tab':
        setActiveTab(action.tabId);
        return;
      case 'map_interact':
        return false;
      case 'update_schedule':
      case 'execute_week':
      case 'mark_document_read':
      case 'call_stakeholder':
      case 'update_scenario_schedule':
        return;
      default:
        return;
    }
  };

  const officeState: OfficeState = {
    variant: 'innovatec',
    secretary,
    schedulingState,
    characterInFocus,
    currentDialogue,
    playerActions,
    conversationMode,
    isLoading,
    gameStatus,
    currentMeeting,
    onPlayerAction: handlePlayerAction,
    onNavigateTab: (tabId) => setActiveTab(tabId),
    onSlotSelect: handleSlotSelect,
    onRequestMeeting: handleRequestMeeting,
    onActionHover: handleActionHover,
    onAskQuestion: handleAskQuestion
  };

  const mechanicContextValue = {
    gameState,
    engine: mechanicEngine,
    dispatch,
    sessionExport,
    office: officeState
  };

  const renderMechanicTab = () => {

    const enabledEntry = enabledMechanics.find((mechanic) => mechanic.tab_id === activeTab);
    const registryEntry = enabledEntry
      ? INNOVATEC_REGISTRY[enabledEntry.mechanic_id]
      : Object.values(INNOVATEC_REGISTRY).find((entry) => entry.tab_id === activeTab);

    if (registryEntry?.Module) {
      const Module = registryEntry.Module;
      return <Module params={enabledEntry?.params} />;
    }

    return null;
  };

  if (!isGameStarted) {
    return <SplashScreen onStartGame={handleStartGame} />;
  }

  return (
    <MechanicProvider value={mechanicContextValue}>
      <div className="min-h-screen bg-gray-900 text-gray-200 font-sans p-4 flex flex-col">
        <Sidebar 
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onNavigate={handleSidebarNavigate}
          onReturnHome={handleReturnHome}
          stages={stageTabs}
        />
        {warningPopupMessage && <WarningPopup message={warningPopupMessage} onClose={() => setWarningPopupMessage(null)} />}
        {gameStatus !== 'playing' && <EndGameScreen status={gameStatus} message={endGameMessage} />}
        <Header 
          gameState={gameState} 
          countdown={countdown}
          isTimerPaused={isTimerPaused}
          onTogglePause={() => setIsTimerPaused(prev => !prev)}
          onAdvanceTime={handleManualAdvance}
          onOpenSidebar={() => setIsSidebarOpen(true)}
          periodDuration={PERIOD_DURATION}
          globalEffectsHighlight={hoveredGlobalEffects}
        />

        <div className="border-b border-gray-700 mt-4 overflow-x-auto">
          <nav className="-mb-px flex space-x-6 min-w-max" aria-label="Tabs">
            {enabledMechanics.map((mechanic) => (
              <button
                key={mechanic.mechanic_id}
                onClick={() => setActiveTab(mechanic.tab_id)}
                className={`${activeTab === mechanic.tab_id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-lg transition-colors duration-200`}
              >
                {mechanic.label}
              </button>
            ))}
          </nav>
        </div>

        <main className="flex-grow mt-4">
          {renderMechanicTab()}
        </main>
        {dailySummary && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 max-w-2xl bg-gray-800/95 text-white px-8 py-6 rounded-2xl shadow-lg border border-gray-700">
            <div className="flex justify-between items-start gap-4">
              <div>
                <div className="text-sm uppercase tracking-wide text-gray-300">Resolución día {dailySummary.day}</div>
                <div className="text-xl font-bold mt-1">{dailySummary.summary}</div>
                {dailySummary.stakeholderDetails.length > 0 && (
                  <ul className="mt-2 text-sm text-gray-200 space-y-1">
                    {dailySummary.stakeholderDetails.map((line, idx) => (
                      <li key={idx}>• {line}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                className="text-gray-300 hover:text-white text-sm"
                onClick={() => setDailySummary(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
        {toastMessage && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 max-w-xl bg-gradient-to-br from-yellow-500/95 via-orange-500/95 to-amber-600/95 text-white px-10 py-7 rounded-3xl shadow-[0_18px_60px_rgba(0,0,0,0.48)] border-2 border-yellow-100/70 text-2xl font-bold tracking-wide animate-fade-in">
            <div className="flex items-start gap-4">
              <span className="text-3xl leading-none">⚠️</span>
              <span className="leading-tight">{toastMessage}</span>
            </div>
          </div>
        )}
      </div>
    </MechanicProvider>
  );
}


