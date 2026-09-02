"use client";

import { useCallback, useRef, useState } from "react";
import { PROCESS_STATE } from "@/shared/constants/buttonProcess";

/**
 * Wrap an async action with canonical process state.
 * State reflects real operation outcome — no fake timers.
 */
export function useProcessAction({
  initialState = PROCESS_STATE.IDLE,
  onSuccess,
  onError,
} = {}) {
  const [processState, setProcessState] = useState(initialState);
  const generationRef = useRef(0);

  const reset = useCallback(() => {
    generationRef.current += 1;
    setProcessState(PROCESS_STATE.IDLE);
  }, []);

  const run = useCallback(async (action) => {
    const gen = ++generationRef.current;
    setProcessState(PROCESS_STATE.LOADING);
    try {
      const result = await action();
      if (gen !== generationRef.current) return result;
      setProcessState(PROCESS_STATE.SUCCESS);
      onSuccess?.(result);
      return result;
    } catch (error) {
      if (gen !== generationRef.current) throw error;
      setProcessState(PROCESS_STATE.ERROR);
      onError?.(error);
      throw error;
    }
  }, [onError, onSuccess]);

  return {
    processState,
    setProcessState,
    run,
    reset,
    isLoading: processState === PROCESS_STATE.LOADING,
  };
}
