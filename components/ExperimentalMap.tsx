import React, { useState } from 'react';
import { scenarios } from '../data/scenarios';
import { getGameDate } from '../constants';
import { ScenarioNode, MeetingSequence, ScenarioOption, GameState, DecisionLogEntry, TimeSlotType } from '../types';

type MapTab = 'proactive' | 'inevitable' | 'contingent';

const getSequenceBadge = (sequence: MeetingSequence) => {
    if (sequence.isInevitable) return 'INEVITABLE';
    if (sequence.isContingent) return 'CONTINGENT';
    return 'PROACTIVE';
};

const getInevitableDateLabel = (sequence: MeetingSequence): string => {
    if (!sequence.triggerMap) {
        return 'Fecha: sin definir';
    }
    const { week, dayName } = getGameDate(sequence.triggerMap.day);
    return `Fecha: Semana ${week} - ${dayName} (Dia ${sequence.triggerMap.day}) - ${sequence.triggerMap.slot}`;
};

const BridgeResponse: React.FC<{ option: ScenarioOption }> = ({ option }) => {
    return (
        <div className="relative group flex items-center">
            <span className="cursor-pointer">i</span>
            <div className="absolute left-full ml-2 w-72 p-2 bg-gray-900 border border-gray-600 rounded-md text-xs text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
                <p className="font-bold text-blue-400">Respuesta Puente:</p>
                <p>"{option.consequences.dialogueResponse}"</p>
            </div>
        </div>
    );
};

const ScenarioNodeDisplay: React.FC<{
    scenario: ScenarioNode;
    isExpanded: boolean;
    onToggleExpand: () => void;
    playerChoiceId: string | null;
}> = ({ scenario, isExpanded, onToggleExpand, playerChoiceId }) => {
    return (
        <div className="w-full max-w-lg mx-auto">
            <button
                onClick={onToggleExpand}
                className="w-full text-left bg-gray-800 border-2 border-blue-500/50 rounded-lg p-4 shadow-lg hover:bg-gray-700/80 transition-colors"
            >
                <p className="font-mono text-xs text-yellow-300">{scenario.node_id}</p>
                <p className="text-lg font-bold text-white mt-1">{scenario.stakeholderRole}</p>
                <p className="text-sm text-gray-400 mt-2 italic">
                    {isExpanded ? scenario.dialogue : `"${scenario.dialogue.substring(0, 80)}..."`}
                </p>
            </button>

            <div className="flex justify-center my-2">
                <div className="w-px h-6 bg-gray-600"></div>
            </div>

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

const SequenceTrack: React.FC<{
    sequence: MeetingSequence;
    decisionLog: DecisionLogEntry[];
    expandedNodeId: string | null;
    onToggleExpand: (nodeId: string) => void;
}> = ({ sequence, decisionLog, expandedNodeId, onToggleExpand }) => {
    const scenariosForSequence = sequence.nodes
        .map(nodeId => scenarios.scenarios.find(s => s.node_id === nodeId))
        .filter((s): s is ScenarioNode => !!s);

    const badge = getSequenceBadge(sequence);

    return (
        <div className="bg-gray-900/30 p-6 rounded-xl border border-gray-700">
            <div className="flex items-start justify-between mb-4 pb-2 border-b-2 border-blue-500/30 gap-3">
                <div>
                    <h3 className="text-xl font-bold text-blue-300">{sequence.sequence_id}</h3>
                    {sequence.isInevitable && (
                        <p className="text-xs text-gray-400 mt-1">{getInevitableDateLabel(sequence)}</p>
                    )}
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded bg-gray-800 text-gray-300 border border-gray-600">
                    {badge}
                </span>
            </div>
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

const ExperimentalMap: React.FC<{ gameState: GameState; onUpdateScenarioSchedule: (id: string, day: number, slot: TimeSlotType) => void }> = ({ gameState, onUpdateScenarioSchedule: _onUpdateScenarioSchedule }) => {
    const [selectedStakeholderRole, setSelectedStakeholderRole] = useState<string | null>(null);
    const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<MapTab>('proactive');

    const stakeholderRoles = [...new Set(scenarios.sequences.map(s => s.stakeholderRole))];
    const sequencesForSelectedRole = scenarios.sequences.filter(s => s.stakeholderRole === selectedStakeholderRole);

    const proactiveSequences = sequencesForSelectedRole.filter(s => !s.isInevitable && !s.isContingent);
    const inevitableSequences = sequencesForSelectedRole.filter(s => s.isInevitable);
    const contingentSequences = sequencesForSelectedRole.filter(s => s.isContingent);

    const sequencesForTab = activeTab === 'inevitable'
        ? inevitableSequences
        : activeTab === 'contingent'
            ? contingentSequences
            : proactiveSequences;

    if (!selectedStakeholderRole) {
        return (
            <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 animate-fade-in">
                <h2 className="text-3xl font-bold mb-2 text-blue-300">Mapa Experimental: Rutas Condicionales</h2>
                <p className="text-gray-400 mb-8 max-w-3xl">
                    Selecciona un stakeholder para visualizar sus escenarios y secuencias.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {stakeholderRoles.map(role => (
                        <button
                            key={role}
                            onClick={() => { setSelectedStakeholderRole(role); setActiveTab('proactive'); }}
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
            <button onClick={() => setSelectedStakeholderRole(null)} className="text-sm text-blue-400 hover:underline mb-4">
                &larr; Volver a la seleccion
            </button>
            <h2 className="text-3xl font-bold mb-2 text-blue-300">Mapa Experimental: {selectedStakeholderRole}</h2>
            <p className="text-gray-400 mb-6 max-w-3xl">
                Revisa escenarios por stakeholder. Usa las pestanas para ver Proactivos, Inevitables o Contingentes.
            </p>

            <div className="flex flex-wrap gap-2 mb-6">
                <button
                    onClick={() => setActiveTab('proactive')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold border ${activeTab === 'proactive' ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-900/50 text-gray-300 border-gray-700 hover:bg-gray-800'}`}
                >
                    Proactivos ({proactiveSequences.length})
                </button>
                <button
                    onClick={() => setActiveTab('inevitable')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold border ${activeTab === 'inevitable' ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-900/50 text-gray-300 border-gray-700 hover:bg-gray-800'}`}
                >
                    Inevitables ({inevitableSequences.length})
                </button>
                <button
                    onClick={() => setActiveTab('contingent')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold border ${activeTab === 'contingent' ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-900/50 text-gray-300 border-gray-700 hover:bg-gray-800'}`}
                >
                    Contingentes ({contingentSequences.length})
                </button>
            </div>

            {sequencesForTab.length === 0 ? (
                <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-6 text-gray-400">
                    No hay secuencias para esta categoria.
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                    {sequencesForTab.map(seq => (
                        <SequenceTrack
                            key={seq.sequence_id}
                            sequence={seq}
                            decisionLog={gameState.decisionLog}
                            expandedNodeId={expandedNodeId}
                            onToggleExpand={(nodeId) => setExpandedNodeId(prev => (prev === nodeId ? null : nodeId))}
                        />
                    ))}
                </div>
            )}
            <style>{`
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.5s ease-in forwards; }
            `}</style>
        </div>
    );
};

export default ExperimentalMap;
