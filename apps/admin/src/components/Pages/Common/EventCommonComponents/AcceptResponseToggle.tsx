import { useNotification } from '@/helpers/NotificationContext';
import { toggleEventAcceptResponse } from '@/services/Events/eventServices';
import React, { useState } from 'react';

interface AcceptResponseToggleProps {
    eventId: any;
    initialValue?: boolean;
    onToggle?: (newValue: boolean) => void;
} 

const AcceptResponseToggle = ({ 
  eventId, 
  initialValue = false,
  onToggle 
}: AcceptResponseToggleProps) => {
  const [isAccepting, setIsAccepting] = useState(initialValue);
  const [isLoading, setIsLoading] = useState(false);
  const {showNotification} = useNotification();

  const handleToggle = async () => {
    setIsLoading(true);
    
    try {
      const newValue = !isAccepting;
      
      await toggleEventAcceptResponse(eventId, {canAcceptResponse: newValue})
      
      setIsAccepting(newValue);
      
      if (onToggle) {
        onToggle(newValue);
      }
      
    } catch (error) {
        console.error('Error toggling response:', error);
        showNotification("error", 'Error toggling response');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-between py-3 px-4 gap-1.5">
      <span className="text-base font-medium text-gray-900">
        Accept Response
      </span>
      
      <button
        onClick={handleToggle}
        disabled={isLoading}
        className={`
          relative inline-flex h-8 w-14 items-center rounded-full
          transition-colors duration-200 ease-in-out
          focus:outline-none focus:ring-2 focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
          ${isAccepting ? 'bg-green-600 focus:ring-green-500' : 'bg-gray-300 focus:ring-blue-500'}
        `}
        role="switch"
        aria-checked={isAccepting}
        aria-label="Toggle accept response"
      >
        <span
          className={`
            inline-block h-6 w-6 transform rounded-full
            bg-white shadow-lg ring-0
            transition-transform duration-200 ease-in-out
            ${isAccepting ? 'translate-x-7' : 'translate-x-1'}
            ${isLoading ? 'animate-pulse' : ''}
          `}
        />
      </button>
    </div>
  );
};

export default AcceptResponseToggle;