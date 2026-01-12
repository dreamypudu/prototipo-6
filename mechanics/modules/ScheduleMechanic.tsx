import React from 'react';
import SchedulerInterface from '../../components/SchedulerInterface';
import { useMechanicContext } from '../MechanicContext';

const ScheduleMechanic: React.FC = () => {
  const { gameState, dispatch } = useMechanicContext();
  return (
    <SchedulerInterface
      gameState={gameState}
      onUpdateSchedule={(schedule) => dispatch({ type: 'update_schedule', schedule })}
      onExecuteWeek={() => dispatch({ type: 'execute_week' })}
    />
  );
};

export default ScheduleMechanic;
