
import React, { useState } from 'react';
import { GameState, StaffMember, ScheduleBlock } from '../types';
import { DAYS_OF_WEEK, CESFAM_ROOMS, getGameDate } from '../constants';
import { useMechanicContext } from '../mechanics/MechanicContext';

// =================================================================================================
// 🗺️ CONFIGURACIÓN DE IMAGEN DE FONDO
// Pega aquí la URL de tu plano, maqueta o imagen de fondo para el mapa.
// =================================================================================================
const MAP_BACKGROUND_URL = "https://i.imgur.com/WxYN5Nz.jpeg"; // Ej: "https://i.imgur.com/tu_plano.png"
// =================================================================================================

interface CesfamMapProps {
    gameState: GameState;
    onInteract: (staff: StaffMember) => boolean;
}

const CesfamMap: React.FC<CesfamMapProps> = ({ gameState, onInteract }) => {
    const { engine } = useMechanicContext();
    // Default to current game day/slot, but allow browsing
    const [viewDay, setViewDay] = useState<number>(gameState.day);
    const [viewBlock, setViewBlock] = useState<ScheduleBlock>('AM');

    // Mapping TimeSlotType to ScheduleBlock (approximate)
    const currentBlock: ScheduleBlock = gameState.timeSlot === 'mañana' ? 'AM' : 'PM';
    const dayOfWeek = DAYS_OF_WEEK[(viewDay - 1) % 5]; // Simple mod 5 for Mon-Fri loop

    // Function to calculate where everyone is
    const getOccupants = (roomId: string) => {
        return gameState.staffRoster.filter(staff => {
            const assignment = gameState.weeklySchedule.find(
                a => a.staffId === staff.id && a.day === dayOfWeek && a.block === viewBlock
            );
            
            if (!assignment) return false;

            // Priority: Check specific roomId
            if (assignment.roomId === roomId) return true;

            // Fallback: If no roomId set, infer from activity
            if (!assignment.roomId) {
                if (roomId === 'TERRENO' && assignment.activity === 'TERRAIN') return true;
                if (roomId === 'AREA_COMUN' && assignment.activity === 'TRAINING') return true;
                
                if (assignment.activity === 'ADMIN' && roomId === 'OFICINA_TECNICA') return true;
            }

            return false;
        });
    };

    return (
        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 h-full flex flex-col animate-fade-in">
             <div className="flex justify-between items-start mb-6">
                <div>
                    <h2 className="text-3xl font-bold text-blue-300">Mapa del CESFAM</h2>
                    <p className="text-gray-400 max-w-xl">
                        Visualización en tiempo real de la ubicación del personal. 
                        <br/>
                        <span className="text-yellow-400 font-bold">⚠ Costo de Movimiento: 6 segundos.</span> Haga clic en un funcionario para ir a verlo.
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2 bg-gray-900/50 p-2 rounded-lg border border-gray-600">
                    <span className="text-xs text-gray-400 uppercase">Visualizando</span>
                    <div className="flex gap-2">
                         <select 
                            value={viewDay} 
                            onChange={(e) => setViewDay(Number(e.target.value))}
                            className="bg-gray-700 text-white text-sm rounded px-2 py-1"
                        >
                            {Array.from({length: 5}, (_, i) => i + gameState.day).map(d => {
                                const date = getGameDate(d);
                                return (
                                    <option key={d} value={d}>{date.dayName} (S{date.week})</option>
                                );
                            })}
                        </select>
                        <div className="flex bg-gray-700 rounded p-1">
                            <button 
                                onClick={() => setViewBlock('AM')}
                                className={`px-3 py-0.5 rounded text-xs font-bold ${viewBlock === 'AM' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                            >AM</button>
                            <button 
                                onClick={() => setViewBlock('PM')}
                                className={`px-3 py-0.5 rounded text-xs font-bold ${viewBlock === 'PM' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}
                            >PM</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-grow grid grid-cols-3 grid-rows-5 gap-4 p-4 bg-gray-900 rounded-xl border border-gray-800 relative overflow-hidden shadow-inner">
                
                {/* 1. BACKGROUND IMAGE (CUSTOM) */}
                {MAP_BACKGROUND_URL && (
                    <div 
                        className="absolute inset-0 bg-cover bg-center opacity-50 pointer-events-none" 
                        style={{ backgroundImage: `url('${MAP_BACKGROUND_URL}')` }}
                    ></div>
                )}

                {/* 2. BACKGROUND GRID PATTERN (Fallback & Texture) */}
                <div className="absolute inset-0 opacity-10 pointer-events-none" 
                     style={{ backgroundImage: 'radial-gradient(circle, #4299e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
                </div>

                {CESFAM_ROOMS.map(room => {
                    const occupants = getOccupants(room.id);
                    return (
                        <div 
                            key={room.id} 
                            className={`relative rounded-lg border-2 p-2 flex flex-col transition-all duration-300 hover:bg-opacity-70 ${room.color} backdrop-blur-sm shadow-sm`}
                            style={{ gridArea: room.gridArea }}
                        >
                            <span className="text-xs font-bold text-white/95 bg-black/70 px-2 py-1 rounded w-max mb-2 border border-white/20 shadow-sm z-10">{room.name}</span>
                            
                            <div className="flex flex-wrap gap-2 justify-center items-center flex-grow z-10">
                                {occupants.map(staff => (
                                    <button
                                        key={staff.id}
                                        onClick={() => {
                                            const shouldLog = onInteract(staff);
                                            if (shouldLog) {
                                                engine.emitEvent('map', 'staff_clicked', {
                                                    staff_id: staff.id,
                                                    location_id: room.id,
                                                    day: gameState.day,
                                                    time_slot: gameState.timeSlot
                                                });
                                                const stakeholder = gameState.stakeholders.find(s => s.id === staff.id);
                                                if (stakeholder) {
                                                    engine.emitCanonicalAction(
                                                        'map',
                                                        'visit_stakeholder',
                                                        `stakeholder:${stakeholder.id}`,
                                                        {
                                                            day: gameState.day,
                                                            time_slot: gameState.timeSlot,
                                                            location_id: room.id,
                                                            arrived_at: Date.now()
                                                        }
                                                    );
                                                }
                                            }
                                        }}
                                        className="group relative"
                                        title={`Ir a ver a: ${staff.name}`}
                                    >
                                        <div className="w-10 h-10 lg:w-12 lg:h-12 rounded-full overflow-hidden border-2 border-white/80 shadow-md transform transition group-hover:scale-110 group-hover:border-yellow-400 bg-gray-800">
                                            <img src={staff.portraitUrl} alt={staff.name} className="w-full h-full object-cover" />
                                        </div>
                                        {staff.burnout > 70 && (
                                            <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                                            </span>
                                        )}
                                    </button>
                                ))}
                                {occupants.length === 0 && (
                                    <span className="text-gray-200/50 text-[10px] italic select-none font-semibold text-shadow-sm">Vacío</span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
             <style>{`
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.5s ease-in forwards; }
                .text-shadow-sm { text-shadow: 0 1px 2px rgba(0,0,0,0.8); }
            `}</style>
        </div>
    );
};

export default CesfamMap;
