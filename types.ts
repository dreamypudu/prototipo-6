
export type TimeSlotType = 'mañana' | 'tarde' | 'noche';
export type SimulatorVersion = 'CESFAM' | 'SERCOTEC' | 'MUNICIPAL' | 'INNOVATEC';
export type GameStatus = 'playing' | 'lost' | 'won';
export type GlobalAttributeId = 'budget' | 'reputation';
export type EffectMagnitude = 'S' | 'M' | 'L';
export type EffectDirection = '+' | '-';
export type GlobalEffectsUI = Partial<Record<GlobalAttributeId, EffectMagnitude>>;
export type GlobalEffectsReal = Partial<Record<GlobalAttributeId, { magnitude: EffectMagnitude; direction: EffectDirection }>>;
export type ConversationMode = 'idle' | 'pre_sequence' | 'in_sequence' | 'post_sequence' | 'questions' | 'questions_only';

// --- PSYCHOMETRIC & ML LOGGING TYPES ---

export interface MechanicEvent {
  event_id: string;
  mechanic_id: string;
  event_type: string;
  timestamp: number;
  payload: Record<string, any>;
}

export interface CanonicalAction {
  canonical_action_id: string;
  mechanic_id: string;
  action_type: string;
  target_ref: string;
  value_final: any;
  committed_at: number;
  context?: Record<string, any>;
}

export interface ExpectedAction {
  expected_action_id: string;
  source: {
    node_id: string;
    option_id: string;
  };
  action_type: string;
  target_ref: string;
  constraints?: Record<string, any>;
  rule_id: string;
  created_at: number;
  mechanic_id?: string;
}

export interface ComparisonResult {
  expected_action_id: string;
  canonical_action_id: string | null;
  outcome: 'DONE_OK' | 'NOT_DONE' | 'DEVIATION';
  deviation?: any;
}

// --- SIMULATOR CONFIGURATION ---

export interface MechanicConfig {
  mechanic_id: string;
  label?: string;
  tab_id?: string;
  params?: Record<string, any>;
}

export interface SimulatorConfig {
  version_id: SimulatorVersion;
  title: string;
  mechanics: MechanicConfig[];
  comparison_rules: string[];
}

// --- EXISTING CORE TYPES ---

export interface Commitment {
  description: string;
  dayDue: number;
  status: 'pending' | 'completed' | 'broken';
}

export interface InformationTier {
  trustThreshold: number;
  information: string;
}

export interface QuestionRequirement {
  trust_min?: number;
  support_min?: number;
  reputation_min?: number;
}

export interface StakeholderQuestion {
  question_id: string;
  text: string;
  answer: string;
  requirements?: QuestionRequirement;
  tags?: string[];
  time_cost?: number;
}

export interface Stakeholder {
  id: string;
  shortId: string;
  name: string;
  role: string;
  power: number;
  interest: number;
  trust: number;
  support: number;
  minSupport: number;
  maxSupport: number;
  mood: string;
  personality: string;
  portraitUrl: string;
  agenda: string[];
  commitments: Commitment[];
  informationTiers: InformationTier[];
  questions: StakeholderQuestion[];
  questionsAsked: string[];
  status: 'ok' | 'critical';
  lastMetDay: number;
}

export interface InboxEmail {
    email_id: string;
    dayReceived: number;
    isRead: boolean;
}

export interface Consequences {
    budgetChange?: number;
    trustChange?: number;
    supportChange?: number;
    reputationChange?: number;
    projectProgressChange?: number;
    dialogueResponse: string;
    expected_actions?: Partial<ExpectedAction>[]; // NEW: Actions that "should" happen after this choice
    global_effects_ui?: GlobalEffectsUI;
    global_effects_real?: GlobalEffectsReal;
}

export interface DecisionLogEntry {
    day: number;
    timeSlot: TimeSlotType;
    stakeholder: string;
    nodeId: string;
    choiceId: string;
    choiceText: string;
    consequences: Consequences;
    globalEffectsShown?: GlobalEffectsUI;
    globalEffectsApplied?: GlobalEffectsReal;
    globalEffectsBefore?: { budget: number; reputation: number };
    globalEffectsAfter?: { budget: number; reputation: number };
}

export interface QuestionLogEntry {
    day: number;
    timeSlot: TimeSlotType;
    stakeholder_id: string;
    question_id: string;
    was_locked: boolean;
    trust_at_ask: number;
    support_at_ask: number;
    reputation_at_ask: number;
    timestamp: number;
}

export interface ProcessLogEntry {
    nodeId: string;
    startTime: number;
    events: {
        type: string;
        metadata: any;
        timestamp: number;
    }[];
    endTime: number;
    totalDuration: number;
    finalChoice: string;
}

export interface PlayerActionLogEntry {
    event: string;
    metadata: any;
    day: number;
    timeSlot: TimeSlotType;
    timestamp: number;
}

export interface Document {
  id: string;
  title: string;
  content: string;
}

export type ActivityType = 'CLINICAL' | 'ADMIN' | 'TERRAIN' | 'TRAINING';
export type DayOfWeek = 'Lunes' | 'Martes' | 'Miércoles' | 'Jueves' | 'Viernes';
export type ScheduleBlock = 'AM' | 'PM';

export interface RoomDefinition {
    id: string;
    name: string;
    sector: 'AZUL' | 'ROJO' | 'AMARILLO' | 'ADMIN' | 'COMMON' | 'OUTSIDE';
    gridArea: string;
    color: string;
}

export interface StaffMember {
    id: string;
    name: string;
    role: 'Medico' | 'Enfermera' | 'TENS';
    sectorId: 'AZUL' | 'ROJO' | 'AMARILLO';
    burnout: number;
    morale: number;
    contractHours: number;
    portraitUrl?: string;
}

export interface ScheduleAssignment {
    staffId: string;
    day: DayOfWeek;
    block: ScheduleBlock;
    activity: ActivityType;
    roomId?: string;
}

// Added StrategyState to fix missing interface error
export interface StrategyState {
  budgetAllocation: {
    community: number;
    environment: number;
    pr: number;
    legal: number;
    safety: number;
  };
  projectScope: {
    technicalApproach: string;
    mitigationMeasures: string[];
  };
  timeline: {
    schedule: string;
  };
  publicRelations: {
    transparency: string;
    narrative: string;
  };
}

// Added ScheduledMeeting to fix missing interface error
export interface ScheduledMeeting {
    day: number;
    slot: TimeSlotType;
    stakeholderName: string;
}

export interface GameState {
  playerName: string;
  projectTitle: string;
  budget: number;
  day: number;
  timeSlot: TimeSlotType;
  projectDeadline: number;
  reputation: number;
  projectProgress: number;
  stakeholders: Stakeholder[];
  staffRoster: StaffMember[];
  weeklySchedule: ScheduleAssignment[];
  calendar: ScheduledMeeting[];
  eventsLog: string[];
  history: { [day: number]: Stakeholder[] };
  completedScenarios: string[];
  completedSequences: string[];
  criticalWarnings: string[];
  decisionLog: DecisionLogEntry[];
  questionLog: QuestionLogEntry[];
  processLog: ProcessLogEntry[];
  inbox: InboxEmail[];
  stakeholder_preferences: { [stakeholderId: string]: string };
  readDocuments: string[];
  playerActionsLog: PlayerActionLogEntry[];
  playerNotes: string;
  scenarioSchedule: { [sequenceId: string]: { day: number; slot: TimeSlotType } };
  
  // Added strategy property to GameState
  strategy: StrategyState;

  mechanicState?: Record<string, any>;

  // NEW LOG BUFFERS
  mechanicEvents: MechanicEvent[];
  canonicalActions: CanonicalAction[];
  expectedActions: ExpectedAction[];
  comparisons: ComparisonResult[];
}

export interface PlayerAction {
  label: string;
  cost: string;
  action: string;
  description?: string;
  timeCost?: string;
  focusType?: string;
  riskLevel?: string;
  relationshipImpact?: string;
  informationDepth?: string;
  globalEffectsUI?: GlobalEffectsUI;
  uiVariant?: 'default' | 'success' | 'danger' | 'muted';
  isLocked?: boolean;
}

export interface ScenarioOption {
  option_id: string;
  text: string;
  tags: { [key: string]: string };
  consequences: Consequences;
}

export interface ScenarioNode {
  node_id: string;
  stakeholderRole: string;
  dialogue: string;
  options: ScenarioOption[];
}

export interface MeetingSequence {
    sequence_id: string;
    stakeholderRole: string;
    initialDialogue: string;
    nodes: string[];
    finalDialogue: string;
    triggerMap?: {
        day: number;
        slot: TimeSlotType;
    };
    isInevitable?: boolean;
    isContingent?: boolean;
    contingentRules?: ContingentRules;
}

export interface ContingentRules {
  budgetBelow?: number;
  trustBelow?: number;
  supportBelow?: number;
  stakeholderRole?: string;
}

export interface ScenarioFile {
    simulation_id: string;
    scenarios: ScenarioNode[];
    sequences: MeetingSequence[];
}

export interface DirectorObjectives {
  maxDeadline: number;
  minBudget: number;
  minReputation: number;
  minProgress: number;
  minTrustWithRequired: number;
  requiredStakeholdersRoles: string[];
}

export interface EmailTemplate {
    email_id: string;
    trigger: {
        type: 'ON_MEETING_COMPLETE';
        stakeholder_id: string;
    };
    from: string;
    subject: string;
    body: string;
    grants_information?: string;
}

// Daily effects summary used in frontend UI when resolving day effects
export type DailyEffectSummary = {
  day: number;
  summary: string;
  stakeholderDetails: string[];
};
