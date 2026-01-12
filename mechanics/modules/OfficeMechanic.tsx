import React from 'react';
import { useMechanicContext } from '../MechanicContext';
import DialogueArea from '../../components/DialogueArea';
import DirectorDesk from '../../components/DirectorDesk';
import ActionBar from '../../components/ActionBar';
import Spinner from '../../components/ui/Spinner';
import { Stakeholder } from '../../types';

const OfficeMechanic: React.FC = () => {
  const { gameState, office, dispatch } = useMechanicContext();

  if (!office || office.variant !== 'default') {
    return null;
  }

  const {
    characterInFocus,
    currentDialogue,
    playerActions,
    isLoading,
    gameStatus,
    currentMeeting,
    onPlayerAction,
    onNavigateTab
  } = office;

  let sceneParticipants: Stakeholder[] | undefined;
  if (currentMeeting?.sequence.sequence_id === 'SCHEDULE_WAR_SEQ') {
    const guzman = gameState.stakeholders.find((s) => s.role === 'Jefe Sector Azul');
    const soto = gameState.stakeholders.find((s) => s.role === 'Jefa Sector Rojo');
    const rios = gameState.stakeholders.find((s) => s.role === 'Jefe Sector Amarillo');
    if (guzman && soto && rios) {
      sceneParticipants = [guzman, soto, rios];
    }
  }

  const renderCentralPanel = () => {
    if (characterInFocus) {
      return (
        <DialogueArea
          key={characterInFocus.name}
          stakeholder={characterInFocus}
          participants={sceneParticipants}
          dialogue={currentDialogue}
          timeSlot={gameState.timeSlot}
        />
      );
    }

    return (
      <DirectorDesk
        gameState={gameState}
        onNavigate={onNavigateTab}
        onCall={(stakeholder) => dispatch({ type: 'call_stakeholder', stakeholder })}
        onUpdateNotes={(notes) => dispatch({ type: 'update_notes', notes })}
      />
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 bg-gray-800/50 p-4 rounded-lg border border-gray-700 flex flex-col gap-4 max-h-[640px] overflow-hidden">
        <h3 className="text-xl font-bold mb-2 text-yellow-300">Bitacora</h3>
        <ul className="space-y-2 text-sm overflow-y-auto pr-2">
          {gameState.eventsLog.slice().reverse().map( (event, index) => (
            <li key={index} className="bg-gray-700/50 p-2 rounded-md font-mono">
              <span className="text-yellow-400">{'>'}</span> {event}
            </li>
          ))}
        </ul>
      </div>
      <div className="lg:col-span-2 flex flex-col">
        <div className="flex-grow bg-gray-800/50 rounded-t-lg border border-gray-700 min-h-[500px] overflow-hidden">
          {renderCentralPanel()}
        </div>
        {characterInFocus && (
          <div className="bg-gray-800/50 p-4 rounded-b-lg border border-t-0 border-gray-700 relative min-h-[140px]">
            {isLoading && (
              <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center rounded-b-lg z-10">
                <Spinner />
              </div>
            )}
            <ActionBar
              actions={playerActions}
              onAction={onPlayerAction}
              disabled={isLoading || gameStatus !== 'playing'}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficeMechanic;
