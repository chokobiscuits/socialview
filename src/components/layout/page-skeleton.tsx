import { Skeleton } from "@/components/ui/skeleton";

/** Header block shared by the dashboard/analytics loading states. */
function HeaderSkeleton() {
  return (
    <div className="flex items-center justify-between pb-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-9 w-[190px]" />
    </div>
  );
}

function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={`rounded-xl border border-border bg-card p-5 ${className ?? ""}`}>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-4 h-8 w-32" />
      <Skeleton className="mt-4 h-24 w-full" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <CardSkeleton className="min-h-[400px]" />
        <div className="flex flex-col gap-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </>
  );
}

export function AnalyticsSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-6">
          <CardSkeleton className="min-h-[340px]" />
          <CardSkeleton className="min-h-[300px]" />
        </div>
        <CardSkeleton className="min-h-[300px]" />
      </div>
    </>
  );
}

export function TableSkeleton() {
  return (
    <>
      <HeaderSkeleton />
      <div className="rounded-xl border border-border bg-card p-5">
        <Skeleton className="h-10 w-full" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-[38px] w-[68px] shrink-0" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
