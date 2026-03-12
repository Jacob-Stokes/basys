import { useState, useEffect } from 'react';

const STORAGE_KEY = 'basys-panels-swapped';

let listeners: Array<(v: boolean) => void> = [];
let globalSwapped: boolean = localStorage.getItem(STORAGE_KEY) === 'true';

function setGlobal(val: boolean) {
  globalSwapped = val;
  localStorage.setItem(STORAGE_KEY, String(val));
  listeners.forEach(fn => fn(val));
}

export function swapPanels() {
  setGlobal(!globalSwapped);
}

export function usePanelSwap(): boolean {
  const [swapped, setSwapped] = useState(globalSwapped);

  useEffect(() => {
    listeners.push(setSwapped);
    return () => {
      listeners = listeners.filter(fn => fn !== setSwapped);
    };
  }, []);

  return swapped;
}
