
import React, { useLayoutEffect, useRef, useState } from 'react';
import { GameState, Stakeholder } from '../types';
import { SECRETARY_ROLE } from '../constants';
import { useMechanicContext } from '../mechanics/MechanicContext';

// =================================================================================================
// 🎨 ZONA DE CONFIGURACIÓN DE IMÁGENES (PEGAR TUS URLS AQUÍ)
// =================================================================================================
const OFFICE_ASSETS = {
    // 1. LA VISTA GENERAL DE LA OFICINA
    BACKGROUND: "https://i.imgur.com/Hq7snGJ.png",
    // Aspect ratio of the background image (width / height).
    BACKGROUND_ASPECT_RATIO: 16 / 9,

    // 2. ELEMENTOS INDIVIDUALES (Opcional)
    ELEMENT_PC: "",       // Imagen del Monitor/PC
    ELEMENT_PHONE: "",    // Imagen del Teléfono
    ELEMENT_NOTEBOOK: "", // Imagen del Cuaderno/Libreta
    ELEMENT_DOOR: ""      // Imagen de la Puerta (o dejar vacía si es parte del fondo)
};
// =================================================================================================

interface DirectorDeskProps {
    gameState: GameState;
    onNavigate: (tab: string) => void;
    onCall: (stakeholder: Stakeholder) => void;
    onUpdateNotes: (notes: string) => void;
}

// --- SUB-COMPONENTS DEFINED OUTSIDE TO PREVENT RE-RENDERS ---

interface ComputerMenuProps {
    onNavigate: (tab: string) => void;
    onClose: () => void;
    hasUnreadEmails: boolean;
}

const ComputerMenu: React.FC<ComputerMenuProps> = ({ onNavigate, onClose, hasUnreadEmails }) => (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20 backdrop-blur-sm animate-fade-in">
        <div className="bg-gray-800 p-8 rounded-xl border-2 border-blue-500 shadow-2xl max-w-2xl w-full relative">
                {/* Monitor Frame Effect */}
            <div className="absolute top-0 left-0 w-full h-8 bg-gray-700 rounded-t-lg flex items-center px-4 gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500 cursor-pointer" onClick={onClose}></div>
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="ml-4 text-xs text-gray-400 font-mono">CESFAM_OS v2.0 - Director Access</span>
            </div>
            
            <div className="mt-8 grid grid-cols-3 gap-6">
                <button onClick={() => onNavigate('schedule')} className="flex flex-col items-center gap-3 p-4 rounded-lg hover:bg-gray-700/50 transition-all group">
                    <div className="w-16 h-16 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <span className="text-3xl">📅</span>
                    </div>
                    <span className="font-bold text-gray-200">Planificación</span>
                </button>
                <button onClick={() => onNavigate('emails')} className="flex flex-col items-center gap-3 p-4 rounded-lg hover:bg-gray-700/50 transition-all group">
                        <div className="w-16 h-16 bg-red-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform relative">
                            <span className="text-3xl">✉️</span>
                            {hasUnreadEmails && (
                                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full border border-gray-900">!</span>
                            )}
                    </div>
                    <span className="font-bold text-gray-200">Correos</span>
                </button>
                <button onClick={() => onNavigate('documents')} className="flex flex-col items-center gap-3 p-4 rounded-lg hover:bg-gray-700/50 transition-all group">
                        <div className="w-16 h-16 bg-yellow-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform relative">
                            <span className="text-3xl">📂</span>
                    </div>
                    <span className="font-bold text-gray-200">Documentos</span>
                </button>
            </div>
            <p className="text-center text-gray-500 text-xs mt-8">Sistema de Gestión Integrada - Servicio de Salud</p>
        </div>
    </div>
);

interface NotebookOverlayProps {
    notes: string;
    onUpdateNotes: (notes: string) => void;
    onClose: () => void;
}

const NotebookOverlay: React.FC<NotebookOverlayProps> = ({ notes, onUpdateNotes, onClose }) => (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20 backdrop-blur-sm animate-fade-in">
        <div className="bg-[#fdfbf7] text-gray-800 p-8 rounded-lg shadow-2xl max-w-xl w-full h-3/4 flex flex-col relative transform rotate-1">
            <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-red-500 font-bold text-xl">✕</button>
            <h3 className="font-handwriting text-2xl mb-4 text-gray-600 border-b-2 border-red-300 pb-2">Notas Personales (Privado)</h3>
            <textarea 
                className="flex-grow bg-transparent border-none resize-none outline-none font-handwriting text-xl leading-8 p-2"
                style={{ backgroundImage: 'linear-gradient(transparent, transparent 29px, #e5e7eb 30px)', backgroundSize: '100% 30px', lineHeight: '30px' }}
                value={notes}
                onChange={(e) => onUpdateNotes(e.target.value)}
                placeholder="Escriba sus recordatorios, promesas o impresiones aquí..."
            />
        </div>
            <style>{`
            @import url('https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap');
            .font-handwriting { font-family: 'Kalam', cursive; }
        `}</style>
    </div>
);

interface PhoneOverlayProps {
    stakeholders: Stakeholder[];
    onCall: (stakeholder: Stakeholder) => void;
    onClose: () => void;
}

const PhoneOverlay: React.FC<PhoneOverlayProps> = ({ stakeholders, onCall, onClose }) => (
    <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-20 backdrop-blur-sm animate-fade-in">
        <div className="bg-gray-900 border-4 border-gray-700 rounded-3xl p-6 w-80 h-[500px] flex flex-col shadow-2xl relative">
            {/* Phone Notch/Speaker */}
            <div className="absolute top-3 left-1/2 transform -translate-x-1/2 w-20 h-4 bg-gray-800 rounded-full"></div>
            
            <div className="mt-8 mb-4">
                <h3 className="text-center text-white text-xl font-bold">Llamar</h3>
            </div>
            
            <div className="flex-grow overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {stakeholders.filter(s => s.role !== SECRETARY_ROLE).map(contact => (
                    <button 
                        key={contact.id}
                        onClick={() => onCall(contact)}
                        className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800 hover:bg-green-900/40 border border-gray-700 hover:border-green-500 transition-all group"
                    >
                        <img src={contact.portraitUrl} className="w-10 h-10 rounded-full object-cover border border-gray-500" />
                        <div className="text-left">
                            <p className="text-sm font-bold text-gray-200 group-hover:text-green-400">{contact.name}</p>
                            <p className="text-xs text-gray-500">{contact.role}</p>
                        </div>
                        <span className="ml-auto text-xl opacity-0 group-hover:opacity-100 transition-opacity">📞</span>
                    </button>
                ))}
                <div className="border-t border-gray-800 my-2"></div>
                    <button className="w-full text-left p-3 text-gray-500 text-sm hover:text-gray-300">
                    Farmacia (Anexo 402)
                </button>
                <button className="w-full text-left p-3 text-gray-500 text-sm hover:text-gray-300">
                    Seguridad (Anexo 911)
                </button>
            </div>

            <button onClick={onClose} className="mt-4 bg-red-600 hover:bg-red-500 text-white rounded-full p-3 self-center shadow-lg transition-transform hover:scale-105">
                <span className="font-bold text-sm px-4">Colgar / Salir</span>
            </button>
        </div>
    </div>
);

const DirectorDesk: React.FC<DirectorDeskProps> = ({ gameState, onNavigate, onCall, onUpdateNotes }) => {
    const { engine } = useMechanicContext();
    const [activeView, setActiveView] = useState<'office' | 'pc_menu' | 'notebook' | 'phone'>('office');
    const deskRef = useRef<HTMLDivElement>(null);
    const [imageBounds, setImageBounds] = useState({ top: 0, left: 0, width: 0, height: 0 });

    useLayoutEffect(() => {
        const element = deskRef.current;
        if (!element) return;

        const ratio = OFFICE_ASSETS.BACKGROUND_ASPECT_RATIO;
        if (!ratio) return;

        const updateBounds = () => {
            const rect = element.getBoundingClientRect();
            const containerRatio = rect.width / rect.height;
            let width = rect.width;
            let height = rect.height;
            let left = 0;
            let top = 0;

            if (containerRatio > ratio) {
                height = rect.height;
                width = height * ratio;
                left = (rect.width - width) / 2;
            } else {
                width = rect.width;
                height = width / ratio;
                top = (rect.height - height) / 2;
            }

            setImageBounds({ top, left, width, height });
        };

        updateBounds();
        const observer = new ResizeObserver(updateBounds);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const imageStyle = imageBounds.width
        ? { top: imageBounds.top, left: imageBounds.left, width: imageBounds.width, height: imageBounds.height }
        : { top: 0, left: 0, width: '100%', height: '100%' };
    const handleNotesUpdate = (notes: string) => {
        engine.emitEvent('office', 'notes_updated', { notes_length: notes.length });
        onUpdateNotes(notes);
    };
    const handleCall = (stakeholder: Stakeholder) => {
        engine.emitEvent('office', 'phone_call', { stakeholder_id: stakeholder.id });
        onCall(stakeholder);
    };

    return (
        <div ref={deskRef} className="relative w-full h-full min-h-[620px] bg-gray-900 rounded-xl overflow-hidden shadow-inner border border-gray-800 select-none">
            {/* BACKGROUND IMAGE - OFFICE */}
            <div 
                className="absolute bg-cover bg-center transition-transform duration-500"
                style={{ 
                    ...imageStyle,
                    backgroundImage: `url('${OFFICE_ASSETS.BACKGROUND}')`, 
                    filter: activeView !== 'office' ? 'blur(4px) brightness(0.5)' : 'none',
                    transform: activeView !== 'office' ? 'scale(1.02)' : 'scale(1)'
                }}
            />

            {/* --- HOTSPOTS (Only active in office view) --- */}
            {activeView === 'office' && (
                <div className="absolute z-10" style={imageStyle}>
                    {/* 1. DOOR - EXIT TO MAP */}
                    <div 
                        className="absolute top-[20%] right-[5%] w-[15%] h-[60%] cursor-pointer group z-10 border-2 border-white/20 hover:border-blue-400 rounded-lg"
                        onClick={() => onNavigate('map')}
                        title="Salir al Mapa"
                    >
                        {OFFICE_ASSETS.ELEMENT_DOOR && <img src={OFFICE_ASSETS.ELEMENT_DOOR} className="w-full h-full object-contain" alt="Door" />}
                        
                        <div className="absolute inset-0 bg-blue-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="bg-black/80 text-white text-xs px-2 py-1 rounded">
                                Salir al CESFAM
                            </span>
                        </div>
                    </div>

                    {/* 2. WINDOW - TIME DISPLAY */}
                    <div className="absolute top-[15%] left-[10%] w-[20%] h-[35%] pointer-events-none z-0 flex items-end justify-center pb-4 border-2 border-transparent hover:border-white/10">
                         <div className="bg-black/60 px-3 py-1 rounded text-white text-sm font-mono backdrop-blur-sm border border-gray-600">
                            {gameState.timeSlot === 'mañana' ? '☀️ Mañana' : '🌇 Tarde'} - Día {gameState.day}
                         </div>
                    </div>

                    {/* 3. PC MONITOR - HUB */}
                    <div 
                        className="absolute bottom-[20%] left-[35%] w-[30%] h-[30%] cursor-pointer group z-10 border-2 border-white/20 hover:border-cyan-400 rounded-lg"
                        onClick={() => setActiveView('pc_menu')}
                        title="Usar Computador"
                    >
                         {OFFICE_ASSETS.ELEMENT_PC && <img src={OFFICE_ASSETS.ELEMENT_PC} className="w-full h-full object-contain" alt="PC" />}

                         <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="bg-black/80 text-cyan-300 text-xs px-2 py-1 rounded">
                                Acceder al Sistema
                            </span>
                        </div>
                    </div>

                    {/* 4. NOTEBOOK - NOTES */}
                    <div 
                        className="absolute bottom-[10%] right-[25%] w-[12%] h-[15%] cursor-pointer group z-10 transform rotate-3 border-2 border-white/20 hover:border-yellow-400 rounded-sm"
                        onClick={() => setActiveView('notebook')}
                        title="Notas Personales"
                    >
                         {OFFICE_ASSETS.ELEMENT_NOTEBOOK && <img src={OFFICE_ASSETS.ELEMENT_NOTEBOOK} className="w-full h-full object-contain" alt="Notebook" />}

                         <div className="absolute inset-0 bg-yellow-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <span className="bg-black/80 text-yellow-200 text-xs px-2 py-1 rounded">
                                Notas
                            </span>
                         </div>
                    </div>

                    {/* 5. PHONE - CALLS */}
                    <div 
                        className="absolute bottom-[15%] left-[20%] w-[8%] h-[12%] cursor-pointer group z-10 border-2 border-white/20 hover:border-green-400 rounded-full"
                        onClick={() => setActiveView('phone')}
                        title="Teléfono"
                    >
                         {OFFICE_ASSETS.ELEMENT_PHONE && <img src={OFFICE_ASSETS.ELEMENT_PHONE} className="w-full h-full object-contain" alt="Phone" />}

                         <div className="absolute inset-0 bg-green-500/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <span className="bg-black/80 text-green-300 text-xs px-2 py-1 rounded">
                                Llamar
                            </span>
                         </div>
                    </div>
                </div>
            )}

            {/* --- OVERLAYS --- */}
            {activeView === 'pc_menu' && (
                <ComputerMenu 
                    onNavigate={onNavigate} 
                    onClose={() => setActiveView('office')} 
                    hasUnreadEmails={gameState.inbox.some(e => !e.isRead)} 
                />
            )}
            {activeView === 'notebook' && (
                <NotebookOverlay 
                    notes={gameState.playerNotes} 
                    onUpdateNotes={handleNotesUpdate} 
                    onClose={() => setActiveView('office')} 
                />
            )}
            {activeView === 'phone' && (
                <PhoneOverlay 
                    stakeholders={gameState.stakeholders} 
                    onCall={handleCall} 
                    onClose={() => setActiveView('office')} 
                />
            )}

            <style>{`
                @keyframes fade-in { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                .animate-fade-in { animation: fade-in 0.2s ease-out forwards; }
            `}</style>
        </div>
    );
};

export default DirectorDesk;
