import React from 'react';
import EmailClient from '../../components/EmailClient';
import { useMechanicContext } from '../MechanicContext';

const EmailMechanic: React.FC = () => {
  const { gameState, dispatch } = useMechanicContext();
  return (
    <EmailClient
      inbox={gameState.inbox}
      onMarkAsRead={(emailId) => dispatch({ type: 'mark_email_read', emailId })}
    />
  );
};

export default EmailMechanic;
