"use client";

import { useEffect } from "react";
import { initRuntimeI18n, reloadTranslations } from "./runtime";

export function RuntimeI18nProvider({ children }) {
  useEffect(() => {
    initRuntimeI18n();
  }, []);

  return <>{children}</>;
}
