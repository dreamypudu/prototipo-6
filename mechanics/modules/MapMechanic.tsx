import React from 'react';
import CesfamMap from '../../components/CesfamMap';
import { StaffMember } from '../../types';
import { useMechanicContext } from '../MechanicContext';

const MapMechanic: React.FC = () => {
  const { gameState, dispatch } = useMechanicContext();
  const handleInteract = (staff: StaffMember) => {
    return dispatch({ type: 'map_interact', staff }) === true;
  };
  return <CesfamMap gameState={gameState} onInteract={handleInteract} />;
};

export default MapMechanic;
