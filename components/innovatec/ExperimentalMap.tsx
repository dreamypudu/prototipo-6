import React, { useState } from 'react';
import { scenarios } from '../../data/innovatec/scenarios';
import { ScenarioNode, MeetingSequence, ScenarioOption, GameState, DecisionLogEntry } from '../../types';

// Helper to get scenario type icon
const getScenarioTypeIcon = (nodeId: string): string => {
    if (nodeId.includes('_E')) return '⚖️'; // Ethics
    if (nodeId.includes('_R')) return '⚠️'; // Risk
    return '💬'; // Generic
};

// Response Tooltip Component
const BridgeResponse: React.FC<{ option: ScenarioOption }> = ({ option }) => {
    return (
        <div className="relative group flex items-center">
            <span className="cursor-pointer">💬</span>
            <div className="absolute left-full ml-2 w-72 p-2 bg-gray-900 border border-gray-600 rounded-md text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
                <p className="font-bold text-blue-400">Respuesta Puente:</p>
                <p>"{option.consequences.dialogueResponse}"</p>
            </div>
        </div>
    );
};


// Node Component
const ScenarioNodeDisplay: React.FC<{ 
    scenario: ScenarioNode;
    isExpanded: boolean;
    onToggleExpand: () => void;
    playerChoiceId: string | null;
}> = ({ scenario, isExpanded, onToggleExpand, playerChoiceId }) => {
    return (
        <div className="w-full max-w-lg mx-auto">
            {/* Node Box */}
            <button
                onClick={onToggleExpand}
                className="w-full text-left bg-gray-800 border-2 border-blue-500/50 rounded-lg p-4 shadow-lg hover:bg-gray-700/80 transition-colors"
            >
                <p className="font-mono text-xs text-yellow-300">{scenario.node_id}</p>
                <p className="text-lg font-bold text-white mt-1">
                    {getScenarioTypeIcon(scenario.node_id)} {scenario.stakeholderRole}
                </p>
                <p className="text-sm text-gray-400 mt-2 italic">
                     {isExpanded ? scenario.dialogue : `"${scenario.dialogue.substring(0, 80)}..."`}
                </p>
            </button>

            {/* Options Connector */}
            <div className="flex justify-center my-2">
                <div className="w-px h-6 bg-gray-600"></div>
            </div>
            
            {/* Options List */}
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 space-y-3">
                {scenario.options.map(option => {
                    const isSelected = playerChoiceId === option.option_id;
                    const hasExpectedAction = Array.isArray(option.consequences.expected_actions) && option.consequences.expected_actions.length > 0;
                    return (
                        <div key={option.option_id} className={`p-3 rounded-md transition-all border ${isSelected ? 'bg-green-800/50 border-green-500' : 'bg-gray-800 border-transparent'}`}>
                            <div className="flex justify-between items-start gap-3">
                                <p className="text-sm text-gray-200">
                                    <span className="font-bold text-blue-400">{option.option_id}:</span> {option.text}
                                    {hasExpectedAction && (
                                        <span className="ml-2 inline-block rounded bg-blue-900/60 border border-blue-400/50 px-1.5 py-0.5 text-[9px] font-bold text-blue-200">
                                            EA
                                        </span>
                                    )}
                                </p>
                                <BridgeResponse option={option} />
                            </div>
                        </div>
                    );
                })}
            </div>

        </div>
    );
};

// Sequence Track Component
const SequenceTrack: React.FC<{ 
    sequence: MeetingSequence;
    decisionLog: DecisionLogEntry[];
    expandedNodeId: string | null;
    onToggleExpand: (nodeId: string) => void;
}> = ({ sequence, decisionLog, expandedNodeId, onToggleExpand }) => {
    const scenariosForSequence = sequence.nodes
        .map(nodeId => scenarios.scenarios.find(s => s.node_id === nodeId))
        .filter((s): s is ScenarioNode => !!s);
    
    const meetingNumber = sequence.sequence_id.split('_').pop() || 'N/A';

    return (
        <div className="bg-gray-900/30 p-6 rounded-xl border border-gray-700">
            <h3 className="text-2xl font-bold text-center text-blue-300 mb-6 pb-2 border-b-2 border-blue-500/30">
                Reunión {meetingNumber}
            </h3>
            <div className="flex flex-col items-center space-y-4">
                {scenariosForSequence.map((scenario, index) => {
                    const decisionForNode = decisionLog.find(d => d.nodeId === scenario.node_id);
                    const playerChoiceId = decisionForNode ? decisionForNode.choiceId : null;

                    return (
                        <React.Fragment key={scenario.node_id}>
                            <ScenarioNodeDisplay 
                                scenario={scenario}
                                isExpanded={expandedNodeId === scenario.node_id}
                                onToggleExpand={() => onToggleExpand(scenario.node_id)}
                                playerChoiceId={playerChoiceId}
                            />
                            {index < scenariosForSequence.length - 1 && (
                                <div className="flex flex-col items-center my-4">
                                    <p className="text-xs text-gray-500 mb-1">Todas las opciones convergen aquí</p>
                                    <div className="w-px h-8 bg-green-500"></div>
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M10 14L6 10H14L10 14Z" fill="#34d399"/>
                                    </svg>
                                </div>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>
        </div>
    );
};

const ExperimentalMap: React.FC<{ gameState: GameState }> = ({ gameState }) => {
    const [selectedStakeholderRole, setSelectedStakeholderRole] = useState<string | null>(null);
    const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);

    const handleToggleExpand = (nodeId: string) => {
        setExpandedNodeId(prev => (prev === nodeId ? null : nodeId));
    };

    const stakeholderRoles = [...new Set(scenarios.sequences.map(s => s.stakeholderRole))];
    const sequencesForSelectedRole = scenarios.sequences.filter(s => s.stakeholderRole === selectedStakeholderRole);

    if (!selectedStakeholderRole) {
        return (
            <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 animate-fade-in">
                <h2 className="text-3xl font-bold mb-2 text-blue-300">Mapa Experimental</h2>
                <p className="text-gray-400 mb-8 max-w-3xl">
                    Seleccione un stakeholder para visualizar su arquitectura narrativa.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {stakeholderRoles.map(role => (
                        <button
                            key={role}
                            onClick={() => setSelectedStakeholderRole(role)}
                            className="p-6 bg-gray-900/50 border border-gray-700 rounded-lg text-lg font-semibold text-white hover:bg-blue-800/50 hover:border-blue-500 transition-all"
                        >
                            {role}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 animate-fade-in">
            <button onClick={() => setSelectedStakeholderRole(null)} className="text-sm text-blue-400 hover:underline mb-4">&larr; Volver a la selección</button>
            <h2 className="text-3xl font-bold mb-2 text-blue-300">Mapa Experimental: {selectedStakeholderRole}</h2>
            <p className="text-gray-400 mb-8 max-w-3xl">
                Haga clic en un nodo para expandir el diálogo. Las opciones seleccionadas por el jugador se resaltan en verde.
            </p>
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                {sequencesForSelectedRole.map(seq => (
                    <SequenceTrack 
                        key={seq.sequence_id} 
                        sequence={seq} 
                        decisionLog={gameState.decisionLog}
                        expandedNodeId={expandedNodeId}
                        onToggleExpand={handleToggleExpand}
                    />
                ))}
            </div>
            <style>{`
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.5s ease-in forwards; }
            `}</style>
        </div>
    );
};

export default ExperimentalMap;
