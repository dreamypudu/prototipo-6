import React, { useState } from 'react';
import { InboxEmail } from '../types';
import { EMAIL_TEMPLATES } from '../data/emails';
import { useMechanicContext } from '../mechanics/MechanicContext';

interface EmailClientProps {
    inbox: InboxEmail[];
    onMarkAsRead: (emailId: string) => void;
}

const EmailClient: React.FC<EmailClientProps> = ({ inbox, onMarkAsRead }) => {
    const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
    const { engine, gameState } = useMechanicContext();

    const handleSelectEmail = (email: InboxEmail) => {
        setSelectedEmailId(email.email_id);
        if (!email.isRead) {
            engine.emitEvent('inbox', 'read_email', {
                email_id: email.email_id,
                day: gameState.day,
                time_slot: gameState.timeSlot
            });
            engine.emitCanonicalAction(
                'inbox',
                'read_email',
                `email:${email.email_id}`,
                {
                    email_id: email.email_id,
                    day: gameState.day,
                    time_slot: gameState.timeSlot,
                    read_at: Date.now()
                }
            );
            onMarkAsRead(email.email_id);
        }
    };

    const sortedInbox = [...inbox].sort((a, b) => b.dayReceived - a.dayReceived);
    const selectedEmailTemplate = EMAIL_TEMPLATES.find(e => e.email_id === selectedEmailId);

    return (
        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 animate-fade-in h-[75vh] flex flex-col">
            <h2 className="text-3xl font-bold mb-6 text-blue-300 border-b-2 border-blue-500/30 pb-3 flex-shrink-0">Bandeja de Entrada</h2>
            <div className="flex-grow flex gap-6 overflow-hidden">
                {/* Inbox List */}
                <div className="w-1/3 flex-shrink-0 bg-gray-900/50 p-3 rounded-lg border border-gray-700 overflow-y-auto">
                    <ul className="space-y-2">
                        {sortedInbox.map(inboxEmail => {
                            const template = EMAIL_TEMPLATES.find(t => t.email_id === inboxEmail.email_id);
                            if (!template) return null;

                            return (
                                <li key={inboxEmail.email_id}>
                                    <button
                                        onClick={() => handleSelectEmail(inboxEmail)}
                                        className={`w-full text-left p-3 rounded-md transition-colors duration-200 ${selectedEmailId === inboxEmail.email_id ? 'bg-blue-800/50' : 'hover:bg-gray-700/50'}`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-grow overflow-hidden">
                                                <p className={`font-semibold truncate ${!inboxEmail.isRead ? 'text-white' : 'text-gray-300'}`}>{template.from}</p>
                                                <p className={`truncate text-sm ${!inboxEmail.isRead ? 'text-blue-300' : 'text-gray-400'}`}>{template.subject}</p>
                                            </div>
                                            {!inboxEmail.isRead && <div className="mt-1 w-2.5 h-2.5 bg-blue-500 rounded-full flex-shrink-0 ml-2"></div>}
                                        </div>
                                        <p className="text-xs text-gray-500 mt-1">Día {inboxEmail.dayReceived}</p>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* Email Detail View */}
                <div className="w-2/3 flex-grow bg-gray-900/50 p-5 rounded-lg border border-gray-700 overflow-y-auto">
                    {selectedEmailTemplate ? (
                        <div>
                            <div className="border-b border-gray-700 pb-4 mb-4">
                                <h3 className="text-2xl font-bold text-white">{selectedEmailTemplate.subject}</h3>
                                <p className="text-sm text-gray-400 mt-2">
                                    <span className="font-semibold">De:</span> {selectedEmailTemplate.from}
                                </p>
                                 <p className="text-sm text-gray-400">
                                    <span className="font-semibold">Fecha:</span> Día {inbox.find(e => e.email_id === selectedEmailId)?.dayReceived}
                                </p>
                            </div>
                            <p className="text-gray-300 leading-relaxed whitespace-pre-wrap font-serif">
                                {selectedEmailTemplate.body}
                            </p>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-gray-500">Seleccione un correo para leer.</p>
                        </div>
                    )}
                </div>
            </div>
            <style>{`
                @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
                .animate-fade-in { animation: fade-in 0.5s ease-in forwards; }
            `}</style>
        </div>
    );
};

export default EmailClient;
