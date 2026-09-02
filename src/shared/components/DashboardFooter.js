"use client";

import FooterAttribution from "@/shared/components/FooterAttribution";

export default function DashboardFooter() {
  return (
    <footer className="shrink-0 border-t border-border-subtle bg-surface/40 px-6 py-3 lg:px-10">
      <p className="text-right text-xs text-text-muted">
        <FooterAttribution />
      </p>
    </footer>
  );
}
