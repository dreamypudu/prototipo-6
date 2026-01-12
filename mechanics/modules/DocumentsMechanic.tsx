import React from 'react';
import DocumentReader from '../../components/DocumentReader';
import { DOCUMENTS } from '../../data/documents';
import { useMechanicContext } from '../MechanicContext';

const DocumentsMechanic: React.FC = () => {
  const { gameState, dispatch } = useMechanicContext();
  return (
    <DocumentReader
      documents={DOCUMENTS}
      readDocuments={gameState.readDocuments}
      onMarkAsRead={(documentId) => dispatch({ type: 'mark_document_read', docId: documentId })}
    />
  );
};

export default DocumentsMechanic;
