"use client";

import { useMemo } from "react";
import { Badge, Card } from "@/shared/components";
import { VERIFICATION_GATES } from "@/shared/data/changelog.js";
import {
  formatVerificationVerifiedAt,
  getVerificationGateLabel,
  sortVerificationGates,
} from "@/shared/data/changelogUtils.js";
import { VERIFICATION_STATUS_VARIANT } from "@/shared/data/verificationStatuses.js";

function VerificationStatusBadge({ status }) {
  const label = getVerificationGateLabel({ status });
  return (
    <Badge variant={VERIFICATION_STATUS_VARIANT[status] || "default"} size="sm">
      {label}
    </Badge>
  );
}

export default function VerificationSection() {
  const gates = useMemo(() => sortVerificationGates(VERIFICATION_GATES), []);

  if (gates.length === 0) {
    return (
      <Card padding="md">
        <h2 className="text-sm font-semibold text-text-main mb-2">Verification</h2>
        <p className="text-sm text-text-muted">No verification data recorded yet.</p>
      </Card>
    );
  }

  return (
    <Card padding="md" className="overflow-hidden">
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-text-main">Verification</h2>
        <p className="text-xs text-text-muted mt-0.5">
          Technical quality gates — PASS, PARTIAL, FAIL, or NOT RUN. Updated only when explicitly re-verified.
        </p>
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="w-full min-w-[640px] text-xs border-collapse">
          <thead>
            <tr className="border-b border-black/10 dark:border-white/10 bg-surface-2/80 text-text-muted">
              <th scope="col" className="text-left px-3 py-2 font-medium whitespace-nowrap">
                Gate
              </th>
              <th scope="col" className="text-left px-3 py-2 font-medium whitespace-nowrap">
                Status
              </th>
              <th scope="col" className="text-left px-3 py-2 font-medium">
                Command
              </th>
              <th scope="col" className="text-left px-3 py-2 font-medium whitespace-nowrap">
                Verified
              </th>
            </tr>
          </thead>
          <tbody>
            {gates.map((row) => (
              <tr
                key={row.key}
                className="border-b border-black/5 dark:border-white/5 last:border-0"
              >
                <td className="px-3 py-2.5 text-text-main align-top">
                  <span className="font-medium">{row.gate}</span>
                  {row.notes ? (
                    <p className="text-[10px] text-text-muted mt-0.5 leading-snug">{row.notes}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <VerificationStatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2.5 align-top">
                  <code className="font-mono text-[11px] text-text-muted break-all leading-relaxed">
                    {row.command}
                  </code>
                </td>
                <td className="px-3 py-2.5 text-text-muted align-top whitespace-nowrap">
                  {formatVerificationVerifiedAt(row.verifiedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
