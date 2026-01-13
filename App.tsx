
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Stakeholder, PlayerAction, TimeSlotType, Commitment, ScenarioNode, ScenarioOption, MeetingSequence, ProcessLogEntry, DecisionLogEntry, Consequences, InboxEmail, PlayerActionLogEntry, Document, ScheduleAssignment, StaffMember, SimulatorVersion, SimulatorConfig, MechanicConfig, GameStatus } from './types';
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

import Header from './components/Header';
import EndGameScreen from './components/EndGameScreen';
import WarningPopup from './components/WarningPopup';
import SplashScreen from './components/SplashScreen';
import Sidebar from './components/Sidebar';
import VersionSelector from './components/VersionSelector';
import InnovatecGame from './games/InnovatecGame';

type ActiveTab = string;
type AppStep = 'version_selection' | 'splash' | 'game';

const PERIOD_DURATION = 90;

type ResolvedMechanicConfig = MechanicConfig & {
  label: string;
  tab_id: string;
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
      comparisons: []
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
    setPlayerActions([{ label: actionLabel, cost: actionCost, action: "start_meeting_sequence" }]);
    const shouldPause = options?.pauseTimer ?? Boolean(sequence.isInevitable || sequence.isContingent);
    if (shouldPause) {
      setIsTimerPaused(true);
    }
  }, [setPersonalizedDialogue]);

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
      setEndGameMessage(`¡Gestión Exitosa! Has logrado alinear a los tres sectores. El CESFAM opera con un equilibrio razonable entre calidad, normativa y comunidad.`);
      setGameStatus('won');
      return;
    }

    const requiredStakeholders = stakeholders.filter(s => DIRECTOR_OBJECTIVES.requiredStakeholdersRoles.includes(s.role));
    let stakeholdersWereUpdated = false;
    requiredStakeholders.forEach(s => {
      if (s.trust < DIRECTOR_OBJECTIVES.minTrustWithRequired && s.status !== 'critical') {
        const warningMsg = `Crisis de Gobernabilidad: ${s.name} (${s.role}) está boicoteando activamente su gestión.`;
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

    if (day > DIRECTOR_OBJECTIVES.maxDeadline && !criticalWarnings.includes(`Gestión Fallida: Plazo Excedido.`)) {
      newWarnings.push(`Gestión Fallida: Plazo Excedido.`);
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

    if (nextSlotIndex >= TIME_SLOTS.length) {
      nextSlotIndex = 0;
      nextDay++;
      historyUpdate = { [currentState.day]: currentState.stakeholders };
    }
    const nextSlot = TIME_SLOTS[nextSlotIndex];

    let newState = { ...currentState, day: nextDay, timeSlot: nextSlot, history: { ...currentState.history, ...historyUpdate } };

    if (nextDay > currentState.day) {
      newEvents.push(`Ha comenzado el día ${nextDay}.`);
      newState.stakeholders = newState.stakeholders.map(sh => {
        const updatedCommitments = sh.commitments.map(c => (c.status === 'pending' && nextDay > c.dayDue) ? { ...c, status: 'broken' as const } : c);
        const newlyBroken = updatedCommitments.filter(c => c.status === 'broken').length - sh.commitments.filter(c => c.status === 'broken').length;
        let newTrust = Math.max(0, sh.trust - (newlyBroken * 20));
        return { ...sh, commitments: updatedCommitments, trust: newTrust };
      });
    }

    newState.eventsLog = [...newState.eventsLog, ...newEvents];
    return newState;
  }, []);

  const presentScenario = useCallback((scenario: ScenarioNode) => {
    const activeStakeholder = gameState.stakeholders.find(s => s.role === scenario.stakeholderRole);
    if (activeStakeholder) setCharacterInFocus(activeStakeholder);

    setPersonalizedDialogue(scenario.dialogue);
    setPlayerActions(scenario.options.map(opt => ({ label: opt.text, action: opt.option_id, cost: "Decisión" })));
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
          setPersonalizedDialogue(`(El ${staff.name} parece ocupado o no tiene nada urgente que tratar contigo en este momento).`);
          setPlayerActions([{ label: "Volver", cost: "Gratis", action: "conclude_meeting" }]);
      } else {
          setWarningPopupMessage(`INSPECCION RAPIDA: ${staff.name}`);
      }
      return true;
  };

  const handleCallStakeholder = (stakeholder: Stakeholder) => {
      setCharacterInFocus(stakeholder);
      setActiveTab('interaction');
      setPersonalizedDialogue(`(Por teléfono) Aló, ¿Director? Aquí ${stakeholder.name}.`);
      setPlayerActions([{ label: "Solo quería confirmar...", cost: "Corto", action: "conclude_meeting" }]);
  };

  const handleExecuteWeek = () => {
      setGameState(prev => {
          const jumpDays = 5;
          return { ...prev, day: prev.day + jumpDays, eventsLog: [...prev.eventsLog, `Semana Ejecutada. Avanzado al día ${prev.day + jumpDays}.`] };
      });
      setWarningPopupMessage("Semana ejecutada con éxito.");
      setActiveTab('interaction');
  };

  const handleSetupScheduleWar = () => {
      setActiveTab('schedule');
      setCurrentMeeting(null);
      setCharacterInFocus(null);
      setWarningPopupMessage("¡PROPUESTAS DE JEFATURAS CARGADAS!");
  };

  const handlePlayerAction = async (action: PlayerAction) => {
    if (gameStatus !== 'playing') return;
    if (action.action === 'open_conflicted_schedule') { handleSetupScheduleWar(); return; }
    
    const processLog = finalizeLogging(action.action);
    setIsLoading(true);

    if (!characterInFocus) { setIsLoading(false); return; }

    if (currentMeeting) {
        const { sequence, nodeIndex } = currentMeeting;
        switch (action.action) {
            case 'start_meeting_sequence': {
                const scenario = scenarioData.scenarios.find(s => s.node_id === sequence.nodes[0]);
                if (scenario) presentScenario(scenario);
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
                setPlayerActions([{ label: "Concluir Reunión", cost: "Finalizar", action: "conclude_meeting" }]);
                setIsLoading(false);
                return;
        }
    }
    
    if (action.action === 'conclude_meeting') {
        const justCompletedSequenceId = currentMeeting?.sequence.sequence_id;
        setCurrentMeeting(null);
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
            
            // PSYCHOMETRIC REGISTRATION
            if (consequences.expected_actions) {
              mechanicEngine.registerExpectedActions(scenario.node_id, option.option_id, consequences.expected_actions);
            }
            mechanicEngine.emitEvent('dialogue', 'decision_made', {
              node_id: scenario.node_id,
              option_id: option.option_id
            });

            setGameState(prev => {
                const newStakeholders = prev.stakeholders.map(sh => sh.name === characterInFocus.name ? { ...sh, trust: Math.max(0, Math.min(100, sh.trust + (consequences.trustChange ?? 0))), support: Math.max(sh.minSupport, Math.min(sh.maxSupport, sh.support + (consequences.supportChange ?? 0))) } : sh);
                const decisionEntry: DecisionLogEntry = {
                    day: prev.day,
                    timeSlot: prev.timeSlot,
                    stakeholder: characterInFocus.name,
                    nodeId: scenario.node_id,
                    choiceId: option.option_id,
                    choiceText: option.text,
                    consequences
                };
                return { ...prev, budget: prev.budget + (consequences.budgetChange ?? 0), reputation: Math.max(0, Math.min(100, prev.reputation + (consequences.reputationChange ?? 0))), projectProgress: Math.max(0, Math.min(100, prev.projectProgress + (consequences.projectProgressChange ?? 0))), stakeholders: newStakeholders, completedScenarios: [...prev.completedScenarios, scenario.node_id], eventsLog: [...prev.eventsLog, `Decisión: ${action.label}`], processLog: processLog ? [...prev.processLog, processLog] : prev.processLog, decisionLog: [...prev.decisionLog, decisionEntry] };
            });
            
            setPersonalizedDialogue(consequences.dialogueResponse);
            if (currentMeeting) {
                if (currentMeeting.nodeIndex >= currentMeeting.sequence.nodes.length - 1) {
                    setPlayerActions([{ label: "Finalizar Discusión", cost: "Continuar", action: "end_meeting_sequence" }]);
                } else {
                    setPlayerActions([{ label: "Continuar...", cost: "Continuar", action: "continue_meeting_sequence" }]);
                }
            } else {
                setPlayerActions([{ label: "Concluir Reunión", cost: "Finalizar", action: "conclude_meeting" }]);
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
    isLoading,
    gameStatus,
    currentMeeting,
    onPlayerAction: handlePlayerAction,
    onNavigateTab: (tabId) => setActiveTab(tabId)
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
      <Header gameState={gameState} countdown={countdown} isTimerPaused={isTimerPaused} onTogglePause={() => setIsTimerPaused(prev => !prev)} onAdvanceTime={handleManualAdvance} onOpenSidebar={() => setIsSidebarOpen(true)} />
      
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
    </div>
    </MechanicProvider>
  );
}
