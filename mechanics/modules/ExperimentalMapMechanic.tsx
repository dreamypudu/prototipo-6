import React from 'react';
import ExperimentalMap from '../../components/ExperimentalMap';
import { useMechanicContext } from '../MechanicContext';

const ExperimentalMapMechanic: React.FC = () => {
  const { gameState, dispatch } = useMechanicContext();
  return (
    <ExperimentalMap
      gameState={gameState}
      onUpdateScenarioSchedule={(id, day, slot) =>
        dispatch({ type: 'update_scenario_schedule', id, day, slot })
      }
    />
  );
};

export default ExperimentalMapMechanic;
