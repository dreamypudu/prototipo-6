import React from 'react';
import EmailClient from '../../components/innovatec/EmailClient';
import { useMechanicContext } from '../MechanicContext';

const InnovatecEmailMechanic: React.FC = () => {
  const { gameState, dispatch } = useMechanicContext();
  return (
    <EmailClient
      inbox={gameState.inbox}
      onMarkAsRead={(emailId) => dispatch({ type: 'mark_email_read', emailId })}
    />
  );
};

export default InnovatecEmailMechanic;
