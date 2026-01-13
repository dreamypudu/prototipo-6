import React from 'react';
import { useMechanicContext } from '../MechanicContext';
import ActionBar from '../../components/ActionBar';
import DialogueArea from '../../components/DialogueArea';
import ScheduleView from '../../components/ScheduleView';
import Spinner from '../../components/ui/Spinner';
import StakeholderList from '../../components/StakeholderList';
import { SECRETARY_ROLE, TIME_SLOTS } from '../../data/innovatec/constants';

const InnovatecOfficeMechanic: React.FC = () => {
  const { gameState, office } = useMechanicContext();

  if (!office || office.variant !== 'innovatec') {
    return null;
  }

  const {
    secretary,
    schedulingState,
    currentDialogue,
    characterInFocus,
    playerActions,
    isLoading,
    gameStatus,
    onPlayerAction,
    onSlotSelect,
    onRequestMeeting
  } = office;

  const renderCentralPanel = () => {
    switch (schedulingState) {
      case 'selecting_slot':
        return (
          <ScheduleView
            currentDay={gameState.day}
            currentTimeSlot={gameState.timeSlot}
            projectDeadline={gameState.projectDeadline}
            calendar={gameState.calendar}
            onSlotSelect={onSlotSelect}
            timeSlots={TIME_SLOTS}
          />
        );
      case 'selecting_stakeholder':
        return (
          <div className="p-4 h-full flex flex-col">
            <h2 className="text-xl font-bold mb-4 text-blue-300 border-b-2 border-blue-500/30 pb-2">
              Seleccionar stakeholder
            </h2>
            <p className="text-gray-400 mb-4 flex-shrink-0">{currentDialogue}</p>
            <div className="flex-grow overflow-y-auto">
              <StakeholderList
                stakeholders={gameState.stakeholders.filter((s) => s.role !== SECRETARY_ROLE)}
                onSelectStakeholder={onRequestMeeting}
              />
            </div>
          </div>
        );
      case 'confirming_schedule':
      case 'none':
      default:
        return characterInFocus ? (
          <DialogueArea
            key={characterInFocus.name}
            stakeholder={characterInFocus}
            dialogue={currentDialogue}
            timeSlot={gameState.timeSlot}
          />
        ) : null;
    }
  };

  return (
    <div className="relative min-h-[680px]">
      <div className="absolute left-0 top-0 h-full w-3 z-20 peer" />
      <div className="absolute left-0 top-0 h-full w-80 max-w-[80%] bg-gray-900/95 border border-gray-700 rounded-r-lg shadow-2xl p-4 transform -translate-x-full peer-hover:translate-x-0 hover:translate-x-0 transition-transform duration-200 z-30">
        {secretary && (
          <div className="text-center p-2 rounded-lg bg-gray-900/50 border border-gray-700 mb-4">
            <img
              src={secretary.portraitUrl}
              alt={secretary.name}
              className="w-24 h-24 rounded-full mx-auto border-2 border-blue-400 object-cover"
            />
            <h2 className="text-lg font-bold mt-2 text-blue-300">{secretary.name}</h2>
            <p className="text-sm text-gray-400">{secretary.role}</p>
          </div>
        )}
        <div className="flex-grow">
          <h3 className="text-xl font-bold mb-2 text-yellow-300">Novedades del proyecto</h3>
          <ul className="space-y-2 text-sm max-h-96 overflow-y-auto pr-2">
            {gameState.eventsLog.length === 0 && (
              <li className="text-gray-500">Sin nuevos eventos.</li>
            )}
            {gameState.eventsLog.slice().reverse().map((event, index) => (
              <li key={index} className="bg-gray-700/50 p-2 rounded-md">
                <span className="font-semibold text-yellow-400">{'>'} </span> {event}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-3 text-[10px] text-gray-400">
          Desliza el mouse al borde izquierdo para ver la bitacora.
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-grow flex flex-col">
          <div className="flex-grow bg-gray-800/50 rounded-t-lg border border-b-0 border-gray-700 min-h-[520px] lg:min-h-[600px] overflow-hidden">
            {renderCentralPanel()}
          </div>
          <div className="bg-gray-800/50 p-4 rounded-b-lg border border-t-0 border-gray-700 relative min-h-[140px]">
            {isLoading && (
              <div className="absolute inset-0 bg-gray-900/80 flex items-center justify-center rounded-b-lg z-10">
                <Spinner />
              </div>
            )}
            {schedulingState !== 'selecting_slot' && schedulingState !== 'selecting_stakeholder' && (
              <ActionBar
                actions={playerActions}
                onAction={onPlayerAction}
                disabled={isLoading || gameStatus !== 'playing'}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InnovatecOfficeMechanic;
