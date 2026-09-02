import { Suspense } from "react";
import { QuotaSkeleton } from "@/shared/components/skeleton";
import ProviderLimits from "../usage/components/ProviderLimits";

export default function QuotaPage() {
  return (
    <Suspense fallback={<QuotaSkeleton />}>
      <ProviderLimits />
    </Suspense>
  );
}
