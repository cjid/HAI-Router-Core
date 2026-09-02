"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isProcessLoading, PROCESS_STATE } from "@/shared/constants/buttonProcess";

const DEFAULT_FEEDBACK_MS = 3500;

/**
 * Real async button lifecycle: idle → loading verb → success/error → idle.
 * No fake timers before the operation completes; optional auto-reset after outcome.
 */
export function useAsyncProcess({
  loadingState = PROCESS_STATE.LOADING,
  feedbackMs = DEFAULT_FEEDBACK_MS,
} = {}) {
  const [processState, setProcessState] = useState(PROCESS_STATE.IDLE);
  const generationRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const scheduleIdle = useCallback((gen) => {
    if (feedbackMs <= 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (gen === generationRef.current) {
        setProcessState(PROCESS_STATE.IDLE);
      }
    }, feedbackMs);
  }, [feedbackMs]);

  const reset = useCallback(() => {
    generationRef.current += 1;
    if (timerRef.current) clearTimeout(timerRef.current);
    setProcessState(PROCESS_STATE.IDLE);
  }, []);

  const run = useCallback(async (action) => {
    const gen = ++generationRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    setProcessState(loadingState);
    try {
      const result = await action();
      if (gen !== generationRef.current) return result;
      const succeeded = result !== false;
      setProcessState(succeeded ? PROCESS_STATE.SUCCESS : PROCESS_STATE.ERROR);
      scheduleIdle(gen);
      return result;
    } catch (error) {
      if (gen !== generationRef.current) throw error;
      setProcessState(PROCESS_STATE.ERROR);
      scheduleIdle(gen);
      throw error;
    }
  }, [loadingState, scheduleIdle]);

  return {
    processState,
    setProcessState,
    run,
    reset,
    isLoading: isProcessLoading(processState),
  };
}
