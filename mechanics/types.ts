import type { ComponentType } from 'react';
import type {
  GameStatus,
  MeetingSequence,
  PlayerAction,
  ScheduleAssignment,
  StaffMember,
  Stakeholder,
  TimeSlotType
} from '../types';

export interface MechanicModuleProps {
  params?: Record<string, any>;
}

export type MechanicDispatchAction =
  | { type: 'update_schedule'; schedule: ScheduleAssignment[] }
  | { type: 'execute_week' }
  | { type: 'mark_email_read'; emailId: string }
  | { type: 'mark_document_read'; docId: string }
  | { type: 'update_notes'; notes: string }
  | { type: 'map_interact'; staff: StaffMember }
  | { type: 'call_stakeholder'; stakeholder: Stakeholder }
  | { type: 'update_scenario_schedule'; id: string; day: number; slot: TimeSlotType }
  | { type: 'navigate_tab'; tabId: string };

export type MechanicDispatch = (action: MechanicDispatchAction) => boolean | void;

export type OfficeVariant = 'default' | 'innovatec';

export interface OfficeBaseState {
  variant: OfficeVariant;
  characterInFocus: Stakeholder | null;
  currentDialogue: string;
  playerActions: PlayerAction[];
  isLoading: boolean;
  gameStatus: GameStatus;
  currentMeeting: { sequence: MeetingSequence; nodeIndex: number } | null;
  onPlayerAction: (action: PlayerAction) => void;
  onNavigateTab: (tabId: string) => void;
}

export interface DefaultOfficeState extends OfficeBaseState {
  variant: 'default';
}

export interface InnovatecOfficeState extends OfficeBaseState {
  variant: 'innovatec';
  secretary: Stakeholder | null;
  schedulingState: 'none' | 'selecting_slot' | 'selecting_stakeholder' | 'confirming_schedule';
  onSlotSelect: (day: number, slot: TimeSlotType) => void;
  onRequestMeeting: (stakeholder: Stakeholder) => void;
}

export type OfficeState = DefaultOfficeState | InnovatecOfficeState;

export interface MechanicRegistryEntry {
  mechanic_id: string;
  label: string;
  tab_id: string;
  Module?: ComponentType<MechanicModuleProps>;
}

export type MechanicRegistry = Record<string, MechanicRegistryEntry>;
