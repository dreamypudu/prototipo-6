
import React, { useState, useMemo } from 'react';
import { GameState, StaffMember, ActivityType, ScheduleAssignment, DayOfWeek, ScheduleBlock } from '../types';
import { DAYS_OF_WEEK, SCHEDULE_BLOCKS, CESFAM_ROOMS } from '../constants';
import { useMechanicContext } from '../mechanics/MechanicContext';

interface SchedulerInterfaceProps {
    gameState: GameState;
    onUpdateSchedule: (newSchedule: ScheduleAssignment[]) => void;
    onExecuteWeek: () => void;
}

const ACTIVITY_COLORS: Record<ActivityType, string> = {
    'CLINICAL': 'bg-red-600 hover:bg-red-500', // High stress
    'ADMIN': 'bg-blue-600 hover:bg-blue-500', // Bureaucracy
    'TERRAIN': 'bg-green-600 hover:bg-green-500', // Community
    'TRAINING': 'bg-yellow-600 hover:bg-yellow-500', // Education/Break
};

const ACTIVITY_LABELS: Record<ActivityType, string> = {
    'CLINICAL': 'Asistencial',
    'ADMIN': 'Gestión',
    'TERRAIN': 'Terreno',
    'TRAINING': 'Capacitación',
};

// Modal for editing an assignment
const AssignmentDialog: React.FC<{
    staff: StaffMember;
    day: DayOfWeek;
    block: ScheduleBlock;
    currentAssignment: ScheduleAssignment;
    onSave: (activity: ActivityType, roomId?: string) => void;
    onClose: () => void;
}> = ({ staff, day, block, currentAssignment, onSave, onClose }) => {
    const [selectedActivity, setSelectedActivity] = useState<ActivityType>(currentAssignment.activity);
    const [selectedRoomId, setSelectedRoomId] = useState<string | undefined>(currentAssignment.roomId);

    // Filter boxes: show all boxes but maybe highlight sector ones
    const availableBoxes = CESFAM_ROOMS.filter(r => r.id.startsWith('BOX'));

    const handleSave = () => {
        let finalRoomId = selectedRoomId;
        
        // Default logic if no room selected manually
        if (selectedActivity === 'ADMIN') finalRoomId = 'OFICINA_TECNICA';
        if (selectedActivity === 'TERRAIN') finalRoomId = 'TERRENO';
        if (selectedActivity === 'TRAINING') finalRoomId = 'AREA_COMUN';
        if (selectedActivity === 'CLINICAL' && !finalRoomId) {
             // Default to a sector box if none selected
             if (staff.sectorId === 'AZUL') finalRoomId = 'BOX_1';
             if (staff.sectorId === 'ROJO') finalRoomId = 'BOX_4';
             if (staff.sectorId === 'AMARILLO') finalRoomId = 'BOX_7';
        }

        onSave(selectedActivity, finalRoomId);
    };

    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-gray-800 rounded-xl border border-gray-600 p-6 w-full max-w-md shadow-2xl">
                <h3 className="text-xl font-bold text-white mb-2">{staff.name}</h3>
                <p className="text-sm text-gray-400 mb-6">{day} - {block}</p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-xs uppercase text-gray-500 font-bold mb-2">Actividad</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(Object.keys(ACTIVITY_LABELS) as ActivityType[]).map(act => (
                                <button
                                    key={act}
                                    onClick={() => {
                                        setSelectedActivity(act);
                                        // Reset room if switching away from clinical
                                        if (act !== 'CLINICAL') setSelectedRoomId(undefined);
                                    }}
                                    className={`p-3 rounded-lg text-sm font-bold border-2 transition-all ${
                                        selectedActivity === act 
                                        ? 'border-white bg-opacity-100 ' + ACTIVITY_COLORS[act] 
                                        : 'border-gray-700 bg-gray-900/50 text-gray-400 hover:border-gray-500'
                                    }`}
                                >
                                    {ACTIVITY_LABELS[act]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {selectedActivity === 'CLINICAL' && (
                        <div>
                            <label className="block text-xs uppercase text-gray-500 font-bold mb-2">Asignar Box</label>
                            <select 
                                value={selectedRoomId || ''}
                                onChange={(e) => setSelectedRoomId(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-600 text-white rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                            >
                                <option value="" disabled>Seleccione un Box...</option>
                                {availableBoxes.map(room => (
                                    <option key={room.id} value={room.id}>
                                        {room.name} {room.sector === staff.sectorId ? '(Sector)' : ''}
                                    </option>
                                ))}
                            </select>
                            {selectedRoomId && !availableBoxes.find(b => b.id === selectedRoomId)?.sector.includes(staff.sectorId) && (
                                <p className="text-xs text-yellow-500 mt-2">⚠ Advertencia: Está asignando un Box fuera de su sector.</p>
                            )}
                        </div>
                    )}
                    
                     {selectedActivity === 'ADMIN' && (
                        <p className="text-sm text-gray-400 italic bg-gray-900 p-2 rounded">Se asignará automáticamente a Oficina Técnica.</p>
                    )}
                     {selectedActivity === 'TERRAIN' && (
                        <p className="text-sm text-gray-400 italic bg-gray-900 p-2 rounded">Se asignará automáticamente a Salida a Terreno.</p>
                    )}
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-gray-700">
                    <button onClick={onClose} className="px-4 py-2 text-gray-300 hover:text-white">Cancelar</button>
                    <button 
                        onClick={handleSave}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg transition-colors"
                    >
                        Guardar Asignación
                    </button>
                </div>
            </div>
        </div>
    );
};


const SchedulerInterface: React.FC<SchedulerInterfaceProps> = ({ gameState, onUpdateSchedule, onExecuteWeek }) => {
    const { engine } = useMechanicContext();
    const [activeSector, setActiveSector] = useState<'AZUL' | 'ROJO' | 'AMARILLO'>('AZUL');
    const [editingCell, setEditingCell] = useState<{ staffId: string, day: DayOfWeek, block: ScheduleBlock } | null>(null);

    const staffInSector = gameState.staffRoster.filter(s => s.sectorId === activeSector);

    // Calculate Physical Conflicts (Double Booking rooms)
    const physicalConflicts = useMemo(() => {
        const usageMap = new Map<string, number>();
        const conflicts = new Set<string>(); // "StaffId-Day-Block"

        gameState.weeklySchedule.forEach(assign => {
            if (!assign.roomId || assign.roomId === 'TERRENO' || assign.roomId === 'AREA_COMUN' || assign.roomId === 'OFICINA_TECNICA') return;
            
            const key = `${assign.day}-${assign.block}-${assign.roomId}`;
            const current = usageMap.get(key) || 0;
            usageMap.set(key, current + 1);
        });

        // Second pass to identify which specific assignments are conflicted
        gameState.weeklySchedule.forEach(assign => {
            if (!assign.roomId || assign.roomId === 'TERRENO' || assign.roomId === 'AREA_COMUN' || assign.roomId === 'OFICINA_TECNICA') return;
            const key = `${assign.day}-${assign.block}-${assign.roomId}`;
            if (usageMap.get(key)! > 1) {
                conflicts.add(`${assign.staffId}-${assign.day}-${assign.block}`);
            }
        });

        return conflicts;
    }, [gameState.weeklySchedule]);


    const handleCellClick = (staffId: string, day: DayOfWeek, block: ScheduleBlock) => {
        setEditingCell({ staffId, day, block });
    };

    const handleSaveAssignment = (activity: ActivityType, roomId?: string) => {
        if (!editingCell) return;

        const newSchedule = [...gameState.weeklySchedule];
        const index = newSchedule.findIndex(a => a.staffId === editingCell.staffId && a.day === editingCell.day && a.block === editingCell.block);
        
        if (index >= 0) {
            newSchedule[index] = {
                ...newSchedule[index],
                activity,
                roomId
            };
            onUpdateSchedule(newSchedule);
            engine.emitEvent('scheduler', 'schedule_updated', { assignment_count: newSchedule.length });
        }
        setEditingCell(null);
    };

    const handleExecuteWeek = () => {
        const normalizedWeekSchedule = gameState.weeklySchedule.map(assignment => ({
            staff_id: assignment.staffId,
            day: assignment.day,
            block: assignment.block,
            activity: assignment.activity,
            room_id: assignment.roomId ?? null
        }));
        engine.emitCanonicalAction(
            'scheduler',
            'execute_week',
            'global',
            { week_schedule: normalizedWeekSchedule },
            { day: gameState.day, time_slot: gameState.timeSlot }
        );
        onExecuteWeek();
    };

    const getAssignment = (staffId: string, day: DayOfWeek, block: ScheduleBlock) => {
        return gameState.weeklySchedule.find(a => a.staffId === staffId && a.day === day && a.block === block);
    };

    const calculateLoad = (staff: StaffMember): { burnout: number, hoursAssigned: number } => {
        const assignments = gameState.weeklySchedule.filter(a => a.staffId === staff.id);
        const clinicalCount = assignments.filter(a => a.activity === 'CLINICAL').length;
        const terrainCount = assignments.filter(a => a.activity === 'TERRAIN').length;
        const trainingCount = assignments.filter(a => a.activity === 'TRAINING').length;
        const adminCount = assignments.filter(a => a.activity === 'ADMIN').length;
        
        // Approx 4.4 hours per block
        const totalBlocks = clinicalCount + terrainCount + trainingCount + adminCount;
        const hoursAssigned = totalBlocks * 4.4;

        let projectedBurnout = staff.burnout + (clinicalCount * 5) + (terrainCount * 2) - (trainingCount * 5);
        return { 
            burnout: Math.max(0, Math.min(100, projectedBurnout)),
            hoursAssigned 
        };
    };

    const hasCriticalConflicts = physicalConflicts.size > 0;

    return (
        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 animate-fade-in h-full flex flex-col relative">
            
            {editingCell && (
                <AssignmentDialog 
                    staff={gameState.staffRoster.find(s => s.id === editingCell.staffId)!}
                    day={editingCell.day}
                    block={editingCell.block}
                    currentAssignment={getAssignment(editingCell.staffId, editingCell.day, editingCell.block)!}
                    onSave={handleSaveAssignment}
                    onClose={() => setEditingCell(null)}
                />
            )}

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold text-blue-300">Planificación Semanal</h2>
                    <p className="text-gray-400">
                        {hasCriticalConflicts 
                            ? <span className="text-red-400 font-bold animate-pulse">⚠ Existen choques en las propuestas. Debe resolverlos antes de continuar.</span> 
                            : "Asigne actividades. Cuide las horas de contrato vs asignadas."}
                    </p>
                </div>
                <div className="flex gap-4">
                    {Object.entries(ACTIVITY_LABELS).map(([key, label]) => (
                        <div key={key} className="flex items-center gap-2">
                            <div className={`w-4 h-4 rounded ${ACTIVITY_COLORS[key as ActivityType]}`}></div>
                            <span className="text-xs text-gray-300">{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {hasCriticalConflicts && (
                <div className="bg-yellow-900/40 border border-yellow-600 text-yellow-200 px-4 py-3 rounded-lg mb-4 flex items-center gap-3 animate-pulse">
                    <span className="text-2xl">⚡</span>
                    <div>
                        <p className="font-bold">VISUALIZANDO PROPUESTAS DE JEFATURAS</p>
                        <p className="text-sm">Lo que ves son las peticiones simultáneas de los tres sectores. Los bloques en <span className="text-red-400 font-bold">ROJO</span> indican donde dos o más jefes quieren el mismo recurso. Tú tienes la última palabra.</p>
                    </div>
                </div>
            )}

            {/* Sector Tabs */}
            <div className="flex gap-2 mb-4 border-b border-gray-700 pb-2">
                {(['AZUL', 'ROJO', 'AMARILLO'] as const).map(sector => (
                    <button
                        key={sector}
                        onClick={() => setActiveSector(sector)}
                        className={`px-4 py-2 rounded-t-lg font-bold transition-colors ${
                            activeSector === sector 
                                ? 'bg-blue-600 text-white' 
                                : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                        }`}
                    >
                        Sector {sector}
                    </button>
                ))}
            </div>

            {/* Grid */}
            <div className="flex-grow overflow-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr>
                            <th className="p-2 border-b border-gray-600 bg-gray-900/50 text-gray-300 font-semibold w-48">Funcionario</th>
                            {DAYS_OF_WEEK.map(day => (
                                <th key={day} className="p-2 border-b border-gray-600 bg-gray-900/50 text-gray-300 font-semibold text-center" colSpan={2}>
                                    {day}
                                </th>
                            ))}
                            <th className="p-2 border-b border-gray-600 bg-gray-900/50 text-gray-300 font-semibold text-center w-24">Carga</th>
                        </tr>
                        <tr>
                            <th className="p-1"></th>
                            {DAYS_OF_WEEK.map(day => (
                                <React.Fragment key={`${day}-sub`}>
                                    <th className="text-xs text-center text-gray-500 bg-gray-900/30 p-1">AM</th>
                                    <th className="text-xs text-center text-gray-500 bg-gray-900/30 p-1">PM</th>
                                </React.Fragment>
                            ))}
                            <th className="p-1"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {staffInSector.map(staff => {
                            const { burnout, hoursAssigned } = calculateLoad(staff);
                            const isOverworked = hoursAssigned > staff.contractHours;
                            const isUnderworked = hoursAssigned < (staff.contractHours - 8);

                            return (
                                <tr key={staff.id} className="border-b border-gray-700/50 hover:bg-gray-800/30">
                                    <td className="p-3 font-medium text-gray-200">
                                        <div>{staff.name}</div>
                                        <div className="text-xs text-gray-500">{staff.role} ({staff.contractHours}hrs)</div>
                                    </td>
                                    {DAYS_OF_WEEK.map(day => (
                                        <React.Fragment key={`${staff.id}-${day}`}>
                                            {SCHEDULE_BLOCKS.map(block => {
                                                const assign = getAssignment(staff.id, day, block);
                                                const roomName = assign?.roomId ? CESFAM_ROOMS.find(r => r.id === assign.roomId)?.name : '';
                                                const isConflict = physicalConflicts.has(`${staff.id}-${day}-${block}`);

                                                return (
                                                    <td key={`${staff.id}-${day}-${block}`} className="p-1">
                                                        <button
                                                            onClick={() => handleCellClick(staff.id, day, block)}
                                                            className={`w-full h-12 rounded shadow-sm transition-all transform hover:scale-105 flex flex-col items-center justify-center p-1 
                                                                ${assign ? ACTIVITY_COLORS[assign.activity] : 'bg-gray-700'}
                                                                ${isConflict ? 'ring-4 ring-red-500 animate-pulse z-10' : ''}
                                                            `}
                                                            title={`${day} ${block}: ${assign ? ACTIVITY_LABELS[assign.activity] : 'Sin asignar'}`}
                                                        >
                                                            {isConflict && <span className="text-xs font-bold text-white bg-red-600 px-1 rounded absolute -top-2">CHOQUE</span>}
                                                            {assign?.activity === 'CLINICAL' && assign.roomId && (
                                                                <span className="text-[9px] font-bold text-white bg-black/20 px-1 rounded truncate w-full text-center">
                                                                    {roomName?.replace('Box ', 'B')}
                                                                </span>
                                                            )}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </React.Fragment>
                                    ))}
                                    <td className="p-2 text-center">
                                        <div className="flex flex-col items-center">
                                            <div className="w-16 h-2 bg-gray-700 rounded-full overflow-hidden mb-1">
                                                <div 
                                                    className={`h-full transition-all duration-500 ${isOverworked ? 'bg-red-500' : isUnderworked ? 'bg-yellow-500' : 'bg-green-500'}`}
                                                    style={{ width: `${Math.min(100, (hoursAssigned / staff.contractHours) * 100)}%` }}
                                                ></div>
                                            </div>
                                            <span className={`text-xs font-mono ${isOverworked ? 'text-red-400 font-bold' : 'text-gray-400'}`}>
                                                {Math.round(hoursAssigned)}/{staff.contractHours}h
                                            </span>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <div className="mt-6 flex justify-end gap-4 items-center">
                {hasCriticalConflicts && <p className="text-red-400 text-sm font-bold animate-bounce">Resuelva los conflictos de sala para continuar.</p>}
                <button
                    onClick={handleExecuteWeek}
                    disabled={hasCriticalConflicts}
                    className={`font-bold py-3 px-8 rounded-lg shadow-lg transform transition flex items-center gap-2
                        ${hasCriticalConflicts ? 'bg-gray-600 cursor-not-allowed opacity-50' : 'bg-green-600 hover:bg-green-500 hover:scale-105 text-white'}
                    `}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Ejecutar Semana
                </button>
            </div>
             <style>{`
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.5s ease-in forwards; }
            `}</style>
        </div>
    );
};

export default SchedulerInterface;
