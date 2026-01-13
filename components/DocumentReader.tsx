import React, { useState } from 'react';
import { Document } from '../types';
import { useMechanicContext } from '../mechanics/MechanicContext';

interface DocumentReaderProps {
    documents: Document[];
    readDocuments: string[];
    onMarkAsRead: (documentId: string) => void;
}

const DocumentReader: React.FC<DocumentReaderProps> = ({ documents, readDocuments, onMarkAsRead }) => {
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const { engine, gameState } = useMechanicContext();

    const handleSelectDoc = (doc: Document) => {
        setSelectedDocId(doc.id);
        if (!readDocuments.includes(doc.id)) {
            engine.emitEvent('documents', 'read_document', {
                doc_id: doc.id,
                day: gameState.day,
                time_slot: gameState.timeSlot
            });
            engine.emitCanonicalAction(
                'documents',
                'read_document',
                `doc:${doc.id}`,
                {
                    doc_id: doc.id,
                    day: gameState.day,
                    time_slot: gameState.timeSlot,
                    read_at: Date.now()
                }
            );
            onMarkAsRead(doc.id);
        }
    };
    
    React.useEffect(() => {
        if (!selectedDocId) {
            const firstUnread = documents.find(d => !readDocuments.includes(d.id));
            const firstDoc = documents[0];
            if(firstUnread) {
                handleSelectDoc(firstUnread);
            } else if (firstDoc) {
                setSelectedDocId(firstDoc.id)
            }
        }
    }, [documents, readDocuments, selectedDocId]);


    const selectedDoc = documents.find(d => d.id === selectedDocId);

    return (
        <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700 animate-fade-in h-[75vh] flex flex-col">
            <h2 className="text-3xl font-bold mb-6 text-blue-300 border-b-2 border-blue-500/30 pb-3 flex-shrink-0">Centro de Documentos</h2>
            <div className="flex-grow flex gap-6 overflow-hidden">
                {/* Document List */}
                <div className="w-1/3 flex-shrink-0 bg-gray-900/50 p-3 rounded-lg border border-gray-700 overflow-y-auto">
                    <ul className="space-y-2">
                        {documents.map(doc => {
                            const isRead = readDocuments.includes(doc.id);
                            return (
                                <li key={doc.id}>
                                    <button
                                        onClick={() => handleSelectDoc(doc)}
                                        className={`w-full text-left p-3 rounded-md transition-colors duration-200 ${selectedDocId === doc.id ? 'bg-blue-800/50' : 'hover:bg-gray-700/50'}`}
                                    >
                                        <div className="flex items-start justify-between">
                                            <p className={`font-semibold truncate ${!isRead ? 'text-white' : 'text-gray-300'}`}>{doc.title}</p>
                                            {!isRead && <div className="mt-1 w-2.5 h-2.5 bg-yellow-500 rounded-full flex-shrink-0 ml-2"></div>}
                                        </div>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* Document Detail View */}
                <div className="w-2/3 flex-grow bg-gray-900/50 p-5 rounded-lg border border-gray-700 overflow-y-auto">
                    {selectedDoc ? (
                        <div>
                            <div className="border-b border-gray-700 pb-4 mb-4">
                                <h3 className="text-2xl font-bold text-white">{selectedDoc.title}</h3>
                            </div>
                            <p className="text-gray-300 leading-relaxed whitespace-pre-wrap font-mono text-sm">
                                {selectedDoc.content}
                            </p>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full">
                            <p className="text-gray-500">Seleccione un documento para leer.</p>
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

export default DocumentReader;
