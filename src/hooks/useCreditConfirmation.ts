import { useState, useCallback } from 'react';

type PromiseResolve = (value: boolean) => void;

export function useCreditConfirmation() {
  const [isOpen, setIsOpen] = useState(false);
  const [cost, setCost] = useState(0);
  const [serviceName, setServiceName] = useState('');
  const [balance, setBalance] = useState(0);
  const [resolver, setResolver] = useState<PromiseResolve | null>(null);

  const requestConfirmation = useCallback((serviceCost: number, name: string, currentBalance: number = 0): Promise<boolean> => {
    return new Promise((resolve) => {
      setCost(serviceCost);
      setServiceName(name);
      setBalance(currentBalance);
      setIsOpen(true);
      setResolver((prev: PromiseResolve | null) => {
        // Una seconda richiesta (doppio click su "Genera") sostituiva il
        // resolver precedente lasciando la prima promise appesa per sempre,
        // e il flusso chiamante restava bloccato senza errore.
        if (prev) prev(false);
        return resolve;
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setIsOpen(false);
    if (resolver) resolver(true);
    setResolver(null);
  }, [resolver]);

  const handleCancel = useCallback(() => {
    setIsOpen(false);
    if (resolver) resolver(false);
    setResolver(null);
  }, [resolver]);

  return {
    isOpen,
    cost,
    serviceName,
    balance,
    requestConfirmation,
    handleConfirm,
    handleCancel
  };
}
