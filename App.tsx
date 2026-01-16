
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConversationMode, GameState, GlobalEffectsUI, Stakeholder, StakeholderQuestion, PlayerAction, TimeSlotType, Commitment, ScenarioNode, ScenarioOption, MeetingSequence, ProcessLogEntry, DecisionLogEntry, Consequences, InboxEmail, PlayerActionLogEntry, Document, ScheduleAssignment, StaffMember, SimulatorVersion, SimulatorConfig, MechanicConfig, GameStatus, QuestionLogEntry } from './types';
import { INITIAL_GAME_STATE, TIME_SLOTS, DIRECTOR_OBJECTIVES, SECRETARY_ROLE } from './constants';
import { scenarios as scenarioData } from './data/scenarios';
import { EMAIL_TEMPLATES } from './data/emails';
import { SIMULATOR_CONFIGS } from './data/simulatorConfigs';
import { startLogging, finalizeLogging } from './services/Timelogger';
import { mechanicEngine } from './services/MechanicEngine';
import { MECHANIC_REGISTRY } from './mechanics/registry';
import { MechanicProvider } from './mechanics/MechanicContext';
import { MechanicDispatchAction, OfficeState } from './mechanics/types';
import { compareExpectedVsActual } from './services/ComparisonEngine';
import { buildSessionExport } from './services/sessionExport';
import { useMechanicLogSync } from './hooks/useMechanicLogSync';
import { clampReputation, resolveGlobalEffects } from './services/globalEffects';

import Header from './components/Header';
import EndGameScreen from './components/EndGameScreen';
import WarningPopup from './components/WarningPopup';
import SplashScreen from './components/SplashScreen';
import Sidebar from './components/Sidebar';
import VersionSelector from './components/VersionSelector';
import InnovatecGame from './games/InnovatecGame';
import type { DailyEffectSummary } from './types';

type ActiveTab = string;
type AppStep = 'version_selection' | 'splash' | 'game';

const PERIOD_DURATION = 90;
const API_BASE_URL =
  (import.meta as any)?.env?.VITE_API_URL ||
  'https://prototipo-5-41cj.onrender.com';

type ResolvedMechanicConfig = MechanicConfig & {
  label: string;
  tab_id: string;
};

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
  return {
    day,
    summary: parts.join(' | '),
    stakeholderDetails: stakeParts
  };
};

const createInitialGameState = (): GameState => {
  const initialSchedule: Record<string, {day: number, slot: TimeSlotType}> = {
      'EVENT_STORM': { day: 1, slot: 'tarde' },
      'AZUL_MEETING_BLOCKED': { day: 1, slot: 'tarde' },
  };

  scenarioData.sequences.forEach(seq => {
      if (seq.triggerMap && (seq.isInevitable || seq.isContingent)) {
          initialSchedule[seq.sequence_id] = seq.triggerMap;
      }
  });

  return {
      ...INITIAL_GAME_STATE,
      scenarioSchedule: initialSchedule,
      mechanicEvents: [],
      canonicalActions: [],
      expectedActions: [],
      comparisons: [],
      questionLog: []
  };
};

const resolveMechanics = (config: SimulatorConfig | null): ResolvedMechanicConfig[] => {
  if (!config) return [];
  return config.mechanics.flatMap((mechanic) => {
    const registryEntry = MECHANIC_REGISTRY[mechanic.mechanic_id];
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

export default function App(): React.ReactElement {
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const sessionStartRef = useRef<number | null>(null);
  const sessionEndRef = useRef<number | null>(null);
  const [appStep, setAppStep] = useState<AppStep>('version_selection');
  const [config, setConfig] = useState<SimulatorConfig | null>(null);
  // Added missing selectedVersion state to fix line 439 error
  const [selectedVersion, setSelectedVersion] = useState<SimulatorVersion | null>(null);
  
  const [gameState, setGameState] = useState<GameState>(createInitialGameState);
  
  const [characterInFocus, setCharacterInFocus] = useState<Stakeholder | null>(null);
  const [currentDialogue, setCurrentDialogue] = useState<string>("");
  const [playerActions, setPlayerActions] = useState<PlayerAction[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('interaction');
  
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
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [dailySummary, setDailySummary] = useState<DailyEffectSummary | null>(null);
  const enabledMechanics = resolveMechanics(config);
  // Sync mechanic engine buffers with React state periodically or on significant events
  const syncLogs = useMechanicLogSync(setGameState);
  const stageTabs = [
    { id: 'stage_1', label: 'Etapa 1: Inicio', status: 'active' as const },
    { id: 'stage_2', label: 'Etapa 2: Progreso', status: 'upcoming' as const },
    { id: 'stage_3', label: 'Etapa 3: Cierre', status: 'upcoming' as const }
  ];

  useEffect(() => {
    if (appStep !== 'game') return;
    const interval = setInterval(() => {
      syncLogs();
    }, 1000);
    return () => clearInterval(interval);
  }, [appStep, syncLogs]);

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

  const buildPreSequenceActions = (
    stakeholder: Stakeholder,
    actionLabel: string,
    actionCost: string,
    allowQuestions: boolean
  ): PlayerAction[] => {
    const actions: PlayerAction[] = [];
    if (allowQuestions && hasQuestionsFor(stakeholder)) {
      actions.push({ label: 'Hacer preguntas', cost: 'Opcional', action: 'ask_questions', uiVariant: 'success' });
    }
    actions.push({ label: actionLabel, cost: actionCost, action: 'start_meeting_sequence' });
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

  const buildQuestionAnswerActions = (
    origin: ConversationMode | null,
    startMeta?: { label: string; cost: string }
  ): PlayerAction[] => {
    const actions: PlayerAction[] = [
      { label: 'Seguir preguntando', cost: 'Opcional', action: 'return_to_questions', uiVariant: 'success' }
    ];
    if (origin === 'pre_sequence') {
      actions.push({
        label: startMeta?.label ?? 'Comenzar Reunion',
        cost: startMeta?.cost ?? 'Tiempo',
        action: 'start_meeting_sequence'
      });
    }
    if (origin === 'post_sequence' || origin === 'questions_only') {
      actions.push({ label: 'Concluir Reunion', cost: 'Finalizar', action: 'conclude_meeting' });
    }
    return actions;
  };

  const getSequenceActionMeta = (sequence: MeetingSequence) => {
    if (sequence.isInevitable) {
      return { label: 'Atender Situacion Inevitable', cost: 'Obligatorio' };
    }
    if (sequence.isContingent) {
      return { label: 'Atender Evento Contingente', cost: 'Obligatorio' };
    }
    return { label: 'Comenzar Reunion', cost: 'Tiempo' };
  };

  const hasCompletedSequenceForRole = (role: string, completedSequences: string[]) => {
    return scenarioData.sequences.some(
      seq => seq.stakeholderRole === role && completedSequences.includes(seq.sequence_id)
    );
  };

  const shouldTriggerContingentSequence = (sequence: MeetingSequence, state: GameState) => {
    if (!sequence.isContingent || !sequence.contingentRules) return false;
    const rules = sequence.contingentRules;

    if (typeof rules.budgetBelow === 'number' && state.budget >= rules.budgetBelow) {
      return false;
    }

    if (typeof rules.trustBelow === 'number' || typeof rules.supportBelow === 'number') {
      const roleToCheck = rules.stakeholderRole ?? sequence.stakeholderRole;
      const stakeholder = state.stakeholders.find(s => s.role === roleToCheck);
      if (!stakeholder) return false;

      if (typeof rules.trustBelow === 'number' && stakeholder.trust >= rules.trustBelow) {
        return false;
      }
      if (typeof rules.supportBelow === 'number' && stakeholder.support >= rules.supportBelow) {
        return false;
      }
    }

    return true;
  };

  const startSequence = useCallback((sequence: MeetingSequence, stakeholder: Stakeholder, options?: { pauseTimer?: boolean; actionLabel?: string; actionCost?: string }) => {
    const actionLabel = options?.actionLabel ?? "Comenzar Reunion";
    const actionCost = options?.actionCost ?? "Tiempo";
    setActiveTab('interaction');
    setCharacterInFocus(stakeholder);
    setCurrentMeeting({ sequence, nodeIndex: 0 });
    setPersonalizedDialogue(sequence.initialDialogue);
    setConversationMode('pre_sequence');
    const allowQuestions = hasCompletedSequenceForRole(stakeholder.role, gameState.completedSequences);
    setPlayerActions(buildPreSequenceActions(stakeholder, actionLabel, actionCost, allowQuestions));
    const shouldPause = options?.pauseTimer ?? Boolean(sequence.isInevitable || sequence.isContingent);
    if (shouldPause) {
      setIsTimerPaused(true);
    }
  }, [setPersonalizedDialogue, buildPreSequenceActions, gameState.completedSequences]);

  const getSequenceOrder = (sequenceId: string) => {
    const match = sequenceId.match(/_(\d+)$/);
    return match ? Number(match[1]) : 0;
  };

  useEffect(() => {
    if (gameStatus === 'playing') return;
    if (appStep === 'game' && sessionEndRef.current === null) {
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
  }, [gameStatus, appStep, setGameState]);

  useEffect(() => {
    if (gameStatus !== 'playing' || appStep !== 'game') return;

    const { stakeholders, day, criticalWarnings, projectProgress } = gameState;
    let newWarnings: string[] = [];
    let stateChanges: Partial<GameState> = {};
    let updatedStakeholders = [...stakeholders];

    if (projectProgress >= DIRECTOR_OBJECTIVES.minProgress) {
      setEndGameMessage(`┬íGesti├│n Exitosa! Has logrado alinear a los tres sectores. El CESFAM opera con un equilibrio razonable entre calidad, normativa y comunidad.`);
      setGameStatus('won');
      return;
    }

    const requiredStakeholders = stakeholders.filter(s => DIRECTOR_OBJECTIVES.requiredStakeholdersRoles.includes(s.role));
    let stakeholdersWereUpdated = false;
    requiredStakeholders.forEach(s => {
      if (s.trust < DIRECTOR_OBJECTIVES.minTrustWithRequired && s.status !== 'critical') {
        const warningMsg = `Crisis de Gobernabilidad: ${s.name} (${s.role}) est├í boicoteando activamente su gesti├│n.`;
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

    if (day > DIRECTOR_OBJECTIVES.maxDeadline && !criticalWarnings.includes(`Gesti├│n Fallida: Plazo Excedido.`)) {
      newWarnings.push(`Gesti├│n Fallida: Plazo Excedido.`);
    }

    if (newWarnings.length > 0) {
      setGameState(prev => ({ ...prev, ...stateChanges, criticalWarnings: [...prev.criticalWarnings, ...newWarnings] }));
      setWarningPopupMessage(newWarnings[0]);
      setIsTimerPaused(true);
    }
  }, [gameState, gameStatus, appStep]);

  useEffect(() => {
    if (appStep !== 'game' || gameStatus !== 'playing' || currentMeeting) return;

    const inevitableSeq = scenarioData.sequences.find(seq =>
      seq.isInevitable &&
      !gameState.completedSequences.includes(seq.sequence_id) &&
      gameState.scenarioSchedule[seq.sequence_id]?.day === gameState.day &&
      gameState.scenarioSchedule[seq.sequence_id]?.slot === gameState.timeSlot
    );

    const contingentSeq = scenarioData.sequences.find(seq =>
      seq.isContingent &&
      !gameState.completedSequences.includes(seq.sequence_id) &&
      shouldTriggerContingentSequence(seq, gameState)
    );

    const sequenceToStart = inevitableSeq ?? contingentSeq;
    if (!sequenceToStart) return;

    const stakeholder = gameState.stakeholders.find(s => s.role === sequenceToStart.stakeholderRole);
    if (stakeholder) {
      const label = sequenceToStart.isInevitable ? "Atender Situacion Inevitable" : "Atender Evento Contingente";
      startSequence(sequenceToStart, stakeholder, { pauseTimer: true, actionLabel: label, actionCost: "Obligatorio" });
    }
  }, [gameState.day, gameState.timeSlot, gameState.completedSequences, appStep, gameStatus, currentMeeting, gameState.scenarioSchedule, gameState.stakeholders, startSequence]);

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

    let newState = { ...currentState, day: nextDay, timeSlot: nextSlot, history: { ...currentState.history, ...historyUpdate } };

    if (nextDay > currentState.day) {
      newEvents.push(`Ha comenzado el d├¡a ${nextDay}.`);
      newState.stakeholders = newState.stakeholders.map(sh => {
        const updatedCommitments = sh.commitments.map(c => (c.status === 'pending' && nextDay > c.dayDue) ? { ...c, status: 'broken' as const } : c);
        const newlyBroken = updatedCommitments.filter(c => c.status === 'broken').length - sh.commitments.filter(c => c.status === 'broken').length;
        let newTrust = Math.max(0, sh.trust - (newlyBroken * 20));
        return { ...sh, commitments: updatedCommitments, trust: newTrust };
      });
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
        const exportPayload = buildSessionExport({
          gameState: snapshot,
          config,
          sessionId: sessionIdRef.current,
          startedAt: sessionStartRef.current ?? Date.now(),
          endedAt: Date.now()
        });
        
        console.log(`[Backend] Attempting to connect to ${API_BASE_URL}`);
        
        const firstResp = await fetch(`${API_BASE_URL.replace(/\/$/, '')}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(exportPayload)
        });

        if (!firstResp.ok) {
          console.warn(`[Backend] POST /sessions failed with status ${firstResp.status}`);
          return;
        }

        const resp = await fetch(
          `${API_BASE_URL.replace(/\/$/, '')}/sessions/${exportPayload.session_metadata.session_id}/resolve_day_effects?day=${completedDay}`,
          { method: 'POST' }
        );
        
        if (!resp.ok) {
          const errorText = await resp.text();
          console.warn(`[Backend] resolve_day_effects failed with status ${resp.status}: ${errorText}`);
          return;
        }
        
        const data = await resp.json();
        const globalDeltas = data.global_deltas || {};
        const stakeholderDeltas = data.stakeholder_deltas || {};
        setGameState((prev) => applyDailyDeltas(prev, completedDay, globalDeltas, stakeholderDeltas));
        const summary = summarizeDeltas(completedDay, globalDeltas, stakeholderDeltas, gameState.stakeholders);
        setDailySummary(summary);
      } catch (err: any) {
        console.error('[Backend] syncDayWithBackend error:', {
          error: err?.message || String(err),
          apiUrl: API_BASE_URL,
          type: err?.name
        });
        showToast(`Error de conexión: ${err?.message || 'No se pudo conectar al servidor'}`);
      }
    },
    [config, applyDailyDeltas, gameState.stakeholders, showToast]
  );

  const presentScenario = useCallback((scenario: ScenarioNode) => {
    const activeStakeholder = gameState.stakeholders.find(s => s.role === scenario.stakeholderRole);
    if (activeStakeholder) setCharacterInFocus(activeStakeholder);

    setPersonalizedDialogue(scenario.dialogue);
    setPlayerActions(
      scenario.options.map(opt => {
        const effects = resolveGlobalEffects(opt.consequences);
        return { label: opt.text, action: opt.option_id, cost: "Decisi├│n", globalEffectsUI: effects.ui };
      })
    );
    startLogging(scenario.node_id);

    mechanicEngine.emitEvent('dialogue', 'scenario_presented', { node_id: scenario.node_id });
  }, [setPersonalizedDialogue, gameState.stakeholders]);

  const advanceTimeAndUpdateFocus = useCallback((justCompletedSequenceId?: string) => {
    let stateAfterMeetingEnd = { ...gameState };
    if (justCompletedSequenceId && !stateAfterMeetingEnd.completedSequences.includes(justCompletedSequenceId)) {
      stateAfterMeetingEnd.completedSequences = [...stateAfterMeetingEnd.completedSequences, justCompletedSequenceId];
    }

    if (characterInFocus && characterInFocus.role !== SECRETARY_ROLE) {
      stateAfterMeetingEnd.stakeholders = stateAfterMeetingEnd.stakeholders.map(sh =>
        sh.name === characterInFocus.name ? { ...sh, lastMetDay: gameState.day } : sh
      );
    }
    const newState = advanceTime(stateAfterMeetingEnd);
    setGameState(newState);
    const completedDay = (newState as any).__completedDay as number | null;
    if (completedDay !== null && completedDay > 0) {
      const snapshot = { ...newState };
      delete (snapshot as any).__completedDay;
      syncDayWithBackend(completedDay, snapshot);
    }
    setCharacterInFocus(null);
    setCountdown(PERIOD_DURATION);
    syncLogs();
  }, [gameState, characterInFocus, advanceTime, syncLogs]);

  useEffect(() => {
    if (isTimerPaused || activeTab !== 'interaction' || gameStatus !== 'playing' || appStep !== 'game') return;
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
  }, [isTimerPaused, activeTab, advanceTimeAndUpdateFocus, gameStatus, appStep]);

  useEffect(() => {
    if (appStep !== 'game') return;
    setIsTimerPaused(false);
    setGameState(prev => {
      const welcomeEmails = EMAIL_TEMPLATES.filter(t => t.trigger.stakeholder_id === 'system-startup');
      const newEmails = welcomeEmails
        .filter(t => !prev.inbox.some(e => e.email_id === t.email_id))
        .map(t => ({ email_id: t.email_id, dayReceived: 1, isRead: false }));
      return newEmails.length > 0 ? { ...prev, inbox: [...prev.inbox, ...newEmails] } : prev;
    });
  }, [appStep]);

  const handleUpdateSchedule = (newSchedule: ScheduleAssignment[]) => {
    setGameState(prev => ({ ...prev, weeklySchedule: newSchedule }));
  };

  const handleUpdateNotes = (notes: string) => {
      setGameState(prev => ({...prev, playerNotes: notes }));
  };

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
  
  const handleMapInteract = (staff: StaffMember): boolean => {
      const MOVEMENT_COST = 6;
      let timeAdvanced = false;
      setCountdown(prev => {
          const newVal = prev - MOVEMENT_COST;
          if (newVal <= 0) { timeAdvanced = true; return 0; }
          return newVal;
      });
      if (timeAdvanced) { advanceTimeAndUpdateFocus(); return false; }

      const blockingInevitable = scenarioData.sequences.find(seq =>
          seq.isInevitable &&
          !gameState.completedSequences.includes(seq.sequence_id) &&
          gameState.scenarioSchedule[seq.sequence_id]?.day === gameState.day &&
          gameState.scenarioSchedule[seq.sequence_id]?.slot === gameState.timeSlot
      );
      if (blockingInevitable) {
          setWarningPopupMessage("Hay un evento inevitable pendiente. Debes atenderlo antes de iniciar uno proactivo.");
          return false;
      }
      const blockingContingent = scenarioData.sequences.find(seq =>
          seq.isContingent &&
          !gameState.completedSequences.includes(seq.sequence_id) &&
          shouldTriggerContingentSequence(seq, gameState)
      );
      if (blockingContingent) {
          setWarningPopupMessage("Hay un evento contingente pendiente. Debes atenderlo antes de iniciar uno proactivo.");
          return false;
      }

      const stakeholder = gameState.stakeholders.find(s => s.id === staff.id);
      if (stakeholder) {
          setCharacterInFocus(stakeholder);
          setActiveTab('interaction');
          const proactiveSequence = scenarioData.sequences
              .filter(seq =>
                  seq.stakeholderRole === stakeholder.role &&
                  !seq.isInevitable &&
                  !seq.isContingent
              )
              .sort((a, b) => getSequenceOrder(a.sequence_id) - getSequenceOrder(b.sequence_id))
              .find(seq => !gameState.completedSequences.includes(seq.sequence_id));
          if (proactiveSequence) {
               startSequence(proactiveSequence, stakeholder, { pauseTimer: false });
               return true;
          }
          if (hasQuestionsFor(stakeholder)) {
              setConversationMode('questions_only');
              setQuestionsOrigin('questions_only');
              setQuestionsBaseDialogue('(No hay mas reuniones pendientes. Puedes hacer preguntas si lo deseas.)');
              setPersonalizedDialogue('(No hay mas reuniones pendientes. Puedes hacer preguntas si lo deseas.)');
              setPlayerActions(buildQuestionListActions(stakeholder, gameState.reputation, 'questions_only'));
          } else {
              setConversationMode('idle');
              setPersonalizedDialogue(`(El ${staff.name} parece ocupado o no tiene nada urgente que tratar contigo en este momento).`);
              setPlayerActions([{ label: "Volver", cost: "Gratis", action: "conclude_meeting" }]);
          }
      } else {
          setWarningPopupMessage(`INSPECCION RAPIDA: ${staff.name}`);
      }
      return true;
  };

  const handleCallStakeholder = (stakeholder: Stakeholder) => {
      setCharacterInFocus(stakeholder);
      setActiveTab('interaction');
      setPersonalizedDialogue(`(Por tel├®fono) Al├│, ┬┐Director? Aqu├¡ ${stakeholder.name}.`);
      setPlayerActions([{ label: "Solo quer├¡a confirmar...", cost: "Corto", action: "conclude_meeting" }]);
  };

  const handleExecuteWeek = () => {
      setGameState(prev => {
          const jumpDays = 5;
          return { ...prev, day: prev.day + jumpDays, eventsLog: [...prev.eventsLog, `Semana Ejecutada. Avanzado al d├¡a ${prev.day + jumpDays}.`] };
      });
      setWarningPopupMessage("Semana ejecutada con ├®xito.");
      setActiveTab('interaction');
  };

  const handleSetupScheduleWar = () => {
      setActiveTab('schedule');
      setCurrentMeeting(null);
      setCharacterInFocus(null);
      setWarningPopupMessage("┬íPROPUESTAS DE JEFATURAS CARGADAS!");
  };

  const handlePlayerAction = async (action: PlayerAction) => {
    if (gameStatus !== 'playing') return;
    if (action.action === 'open_conflicted_schedule') { handleSetupScheduleWar(); return; }

    if (action.action === 'ask_questions' && characterInFocus) {
        const origin = conversationMode === 'pre_sequence' || conversationMode === 'post_sequence'
          ? conversationMode
          : 'questions_only';
        setQuestionsOrigin(origin);
        setQuestionsBaseDialogue(currentDialogue);
        setConversationMode('questions');
        setPlayerActions(buildQuestionListActions(characterInFocus, gameState.reputation, origin));
        return;
    }

    if (action.action === 'close_questions' && characterInFocus) {
        const origin = questionsOrigin;
        setQuestionsOrigin(null);
        setConversationMode(origin ?? 'idle');
        if (questionsBaseDialogue) {
          setPersonalizedDialogue(questionsBaseDialogue);
        }
        setQuestionsBaseDialogue('');
        if (origin === 'pre_sequence' && currentMeeting?.sequence) {
            const meta = getSequenceActionMeta(currentMeeting.sequence);
            const allowQuestions = hasCompletedSequenceForRole(characterInFocus.role, gameState.completedSequences);
            setPlayerActions(buildPreSequenceActions(characterInFocus, meta.label, meta.cost, allowQuestions));
        } else if (origin === 'post_sequence') {
            setPlayerActions(buildPostSequenceActions(characterInFocus));
        }
        return;
    }

    if (action.action === 'return_to_questions' && characterInFocus) {
        const origin = questionsOrigin ?? 'questions_only';
        setConversationMode('questions');
        if (questionsBaseDialogue) {
          setPersonalizedDialogue(questionsBaseDialogue);
        }
        setPlayerActions(buildQuestionListActions(characterInFocus, gameState.reputation, origin));
        return;
    }

    if (action.action.startsWith('question:') && characterInFocus) {
        const questionId = action.action.split(':')[1];
        const question = characterInFocus.questions.find(q => q.question_id === questionId);
        if (!question) return;
        const alreadyAsked = characterInFocus.questionsAsked.includes(question.question_id);
        const canAsk = canAskQuestion(question, characterInFocus, gameState.reputation);
        if (!canAsk) {
            const reqText = getQuestionRequirementText(question);
            const message = reqText ? `No puedo responder eso aun. Requisitos: ${reqText}.` : 'No puedo responder eso aun.';
            setPersonalizedDialogue(message);
            setPlayerActions(buildQuestionListActions(characterInFocus, gameState.reputation, questionsOrigin));
            return;
        }

        handleAskQuestion(question);
        setPersonalizedDialogue(question.answer);
        const meta = questionsOrigin === 'pre_sequence' && currentMeeting?.sequence
          ? getSequenceActionMeta(currentMeeting.sequence)
          : undefined;
        setPlayerActions(buildQuestionAnswerActions(questionsOrigin, meta));
        return;
    }
    
    const processLog = finalizeLogging(action.action);
    setIsLoading(true);

    if (!characterInFocus) { setIsLoading(false); return; }

    if (currentMeeting) {
        const { sequence, nodeIndex } = currentMeeting;
        switch (action.action) {
            case 'start_meeting_sequence': {
                setConversationMode('in_sequence');
                const scenario = scenarioData.scenarios.find(s => s.node_id === sequence.nodes[0]);
                if (scenario) presentScenario(scenario);
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
                const nextScenario = scenarioData.scenarios.find(s => s.node_id === sequence.nodes[nextNodeIndex]);
                if (nextScenario) presentScenario(nextScenario);
                setIsLoading(false);
                return;
            }
            case 'continue_meeting_sequence': {
                const nextNodeIndex = nodeIndex + 1;
                setCurrentMeeting(prev => ({ ...prev!, nodeIndex: nextNodeIndex }));
                const nextScenario = scenarioData.scenarios.find(s => s.node_id === sequence.nodes[nextNodeIndex]);
                if (nextScenario) presentScenario(nextScenario);
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

    const currentScenarioId = currentMeeting ? currentMeeting.sequence.nodes[currentMeeting.nodeIndex] : '';
    const scenario = scenarioData.scenarios.find(s => s.node_id === currentScenarioId);

    if (scenario) {
        const option = scenario.options.find(o => o.option_id === action.action);
        if (option) {
            const { consequences } = option;
            const globalEffects = resolveGlobalEffects(consequences);
            setHoveredGlobalEffects(null);
            
            // PSYCHOMETRIC REGISTRATION
            if (consequences.expected_actions) {
              mechanicEngine.registerExpectedActions(scenario.node_id, option.option_id, consequences.expected_actions);
              const toastText = characterInFocus?.name ? `${characterInFocus.name} recordará eso` : 'NPC recordará eso';
              showToast(toastText);
            }
            mechanicEngine.emitEvent('dialogue', 'decision_made', {
              node_id: scenario.node_id,
              option_id: option.option_id
            });

            setGameState(prev => {
                const newStakeholders = prev.stakeholders.map(sh => sh.name === characterInFocus.name ? { ...sh, trust: Math.max(0, Math.min(100, sh.trust + (consequences.trustChange ?? 0))), support: Math.max(sh.minSupport, Math.min(sh.maxSupport, sh.support + (consequences.supportChange ?? 0))) } : sh);
                const globalEffectsBefore = { budget: prev.budget, reputation: prev.reputation };
                const nextBudget = prev.budget + globalEffects.deltas.budget;
                const nextReputation = clampReputation(prev.reputation + globalEffects.deltas.reputation);
                const globalEffectsAfter = { budget: nextBudget, reputation: nextReputation };
                const decisionEntry: DecisionLogEntry = {
                    day: prev.day,
                    timeSlot: prev.timeSlot,
                    stakeholder: characterInFocus.name,
                    nodeId: scenario.node_id,
                    choiceId: option.option_id,
                    choiceText: option.text,
                    consequences,
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
                    eventsLog: [...prev.eventsLog, `Decisi├│n: ${action.label}`],
                    processLog: processLog ? [...prev.processLog, processLog] : prev.processLog,
                    decisionLog: [...prev.decisionLog, decisionEntry]
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

  const handleManualAdvance = () => { advanceTimeAndUpdateFocus(); };
  const handleMarkEmailAsRead = (emailId: string) => {
    setGameState(prev => ({ ...prev, inbox: prev.inbox.map(e => e.email_id === emailId ? { ...e, isRead: true } : e) }));
  };
  const handleMarkDocumentAsRead = (docId: string) => {
    setGameState(prev => prev.readDocuments.includes(docId) ? prev : { ...prev, readDocuments: [...prev.readDocuments, docId] });
  };
  const handleSidebarNavigate = (tab: any) => { setActiveTab(tab); };
  const handleReturnHome = () => {
    setIsSidebarOpen(false);
    setWarningPopupMessage(null);
    setGameStatus('playing');
    setEndGameMessage('');
    setCurrentMeeting(null);
    setCharacterInFocus(null);
    setCurrentDialogue('');
    setPlayerActions([]);
    setIsLoading(false);
    setIsTimerPaused(true);
    setCountdown(PERIOD_DURATION);
    setActiveTab('interaction');
    setHoveredGlobalEffects(null);
    setConversationMode('idle');
    setQuestionsOrigin(null);
    setQuestionsBaseDialogue('');
    setGameState(createInitialGameState());
    sessionStartRef.current = null;
    sessionEndRef.current = null;
    sessionIdRef.current = crypto.randomUUID();
    setConfig(null);
    setSelectedVersion(null);
    setAppStep('version_selection');
  };
  const sessionExport = buildSessionExport({
    gameState,
    config,
    sessionId: sessionIdRef.current,
    startedAt: sessionStartRef.current ?? undefined,
    endedAt: sessionEndRef.current ?? undefined
  });
  const handleStartGame = (name: string) => {
    sessionStartRef.current = Date.now();
    sessionEndRef.current = null;
    sessionIdRef.current = crypto.randomUUID();
    setGameState(prev => ({...prev, playerName: name}));
    setQuestionsBaseDialogue('');
    setAppStep('game');
  };
  const handleSelectVersion = (version: SimulatorVersion) => {
    const nextConfig = SIMULATOR_CONFIGS[version];
    const nextMechanics = resolveMechanics(nextConfig);
    setSelectedVersion(version);
    setConfig(nextConfig);
    if (nextMechanics.length > 0) {
      setActiveTab(nextMechanics[0].tab_id);
    }
    setAppStep('splash');
  };
  const handleUpdateScenarioSchedule = (id: string, day: number, slot: TimeSlotType) => { setGameState(prev => ({ ...prev, scenarioSchedule: { ...prev.scenarioSchedule, [id]: { day, slot } } })); };
  const dispatch = (action: MechanicDispatchAction) => {
    switch (action.type) {
      case 'update_schedule':
        handleUpdateSchedule(action.schedule);
        return;
      case 'execute_week':
        handleExecuteWeek();
        return;
      case 'mark_email_read':
        handleMarkEmailAsRead(action.emailId);
        return;
      case 'mark_document_read':
        handleMarkDocumentAsRead(action.docId);
        return;
      case 'update_notes':
        handleUpdateNotes(action.notes);
        return;
      case 'map_interact':
        return handleMapInteract(action.staff);
      case 'call_stakeholder':
        handleCallStakeholder(action.stakeholder);
        return;
      case 'update_scenario_schedule':
        handleUpdateScenarioSchedule(action.id, action.day, action.slot);
        return;
      case 'navigate_tab':
        setActiveTab(action.tabId);
        return;
      default:
        return;
    }
  };

  const officeState: OfficeState = {
    variant: 'default',
    characterInFocus,
    currentDialogue,
    playerActions,
    conversationMode,
    isLoading,
    gameStatus,
    currentMeeting,
    onPlayerAction: handlePlayerAction,
    onNavigateTab: (tabId) => setActiveTab(tabId),
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
      ? MECHANIC_REGISTRY[enabledEntry.mechanic_id]
      : Object.values(MECHANIC_REGISTRY).find((entry) => entry.tab_id === activeTab);

    if (registryEntry?.Module) {
      const Module = registryEntry.Module;
      return <Module params={enabledEntry?.params} />;
    }

    return null;
  };


  if (selectedVersion === 'INNOVATEC') return <InnovatecGame onExitToHome={handleReturnHome} />;
  if (appStep === 'version_selection') return <VersionSelector onSelect={handleSelectVersion} />;
  if (appStep === 'splash') return <SplashScreen onStartGame={handleStartGame} />;

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
        globalEffectsHighlight={hoveredGlobalEffects}
      />
      
      {/* Dynamic Tabs based on Registry */}
      <div className="border-b border-gray-700 mt-4 overflow-x-auto">
        <nav className="-mb-px flex space-x-6 min-w-max" aria-label="Tabs">
          {enabledMechanics.map((m) => (
            <button
              key={m.mechanic_id}
              onClick={() => setActiveTab(m.tab_id)}
              className={`${activeTab === m.tab_id ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-lg transition-colors duration-200`}
            >
              {m.label}
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

