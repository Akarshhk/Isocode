import { Skeleton } from "@/components/ui";

export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-10 w-full max-w-lg" />
      <Skeleton className="h-96 w-full rounded-[var(--radius-card)]" />
    </div>
  );
}
