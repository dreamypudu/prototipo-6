import React, { createContext, useContext } from 'react';
import { GameState } from '../types';
import { mechanicEngine } from '../services/MechanicEngine';
import { SessionExport } from '../services/sessionExport';
import { MechanicDispatch, OfficeState } from './types';

export interface MechanicContextValue {
  gameState: GameState;
  engine: typeof mechanicEngine;
  dispatch: MechanicDispatch;
  sessionExport: SessionExport;
  office?: OfficeState;
}

const MechanicContext = createContext<MechanicContextValue | null>(null);

export const MechanicProvider: React.FC<{
  value: MechanicContextValue;
  children: React.ReactNode;
}> = ({ value, children }) => {
  return <MechanicContext.Provider value={value}>{children}</MechanicContext.Provider>;
};

export const useMechanicContext = (): MechanicContextValue => {
  const context = useContext(MechanicContext);
  if (!context) {
    throw new Error('useMechanicContext must be used within a MechanicProvider');
  }
  return context;
};
