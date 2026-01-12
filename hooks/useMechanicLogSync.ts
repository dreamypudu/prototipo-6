import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { compareExpectedVsActual } from '../services/ComparisonEngine';
import { mechanicEngine } from '../services/MechanicEngine';
import { GameState } from '../types';

type SetGameState = Dispatch<SetStateAction<GameState>>;

export const useMechanicLogSync = (setGameState: SetGameState) => {
  return useCallback(() => {
    const flushed = mechanicEngine.flush();
    if (flushed.events.length || flushed.canonical.length || flushed.expected.length) {
      setGameState((prev) => ({
        ...prev,
        mechanicEvents: [...prev.mechanicEvents, ...flushed.events],
        canonicalActions: [...prev.canonicalActions, ...flushed.canonical],
        expectedActions: [...prev.expectedActions, ...flushed.expected],
        comparisons: (() => {
          const nextExpected = [...prev.expectedActions, ...flushed.expected];
          const nextCanonical = [...prev.canonicalActions, ...flushed.canonical];
          const newComparisons = compareExpectedVsActual(
            nextExpected,
            nextCanonical,
            prev.comparisons,
            { includeNotDone: false }
          );
          if (newComparisons.length === 0) return prev.comparisons;
          return [...prev.comparisons, ...newComparisons];
        })()
      }));
    }
  }, [setGameState]);
};
