import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Squelette pour la vue grille de produits */
export const POSProductGridSkeleton = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
    {Array.from({ length: 12 }).map((_, i) => (
      <Card key={i} className="overflow-hidden">
        <Skeleton className="aspect-square w-full" />
        <CardContent className="p-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-8" />
          </div>
        </CardContent>
      </Card>
    ))}
  </div>
);

/** Squelette pour la vue liste de produits */
export const POSProductListSkeleton = () => (
  <div>
    {/* Table header skeleton */}
    <div className="hidden sm:grid sm:grid-cols-[1fr_100px_100px_60px_130px] gap-2 px-3 py-2 border-b bg-muted/30 rounded-t-lg">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-3 w-16 ml-auto" />
      <Skeleton className="h-3 w-10 ml-auto" />
      <Skeleton className="h-3 w-6 mx-auto" />
      <Skeleton className="h-3 w-12 mx-auto" />
    </div>
    {/* Rows */}
    <div className="divide-y">
      {Array.from({ length: 10 }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_100px_100px_60px_130px] gap-2 items-center px-3 py-2.5"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-md" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
          <Skeleton className="h-4 w-14 hidden sm:block ml-auto" />
          <Skeleton className="h-4 w-8 hidden sm:block ml-auto" />
          <Skeleton className="h-6 w-16 hidden sm:block mx-auto" />
          <Skeleton className="h-7 w-20 hidden sm:block mx-auto" />
          <div className="flex sm:hidden items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/** Squelette pour le panneau du panier */
export const POSCartSkeleton = () => (
  <Card className="h-full flex flex-col card-elevated">
    <div className="p-4 pb-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
    <div className="flex-1 px-4 pb-0 space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-20" />
          </div>
          <div className="flex items-center gap-1">
            <Skeleton className="h-7 w-7 rounded-md" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-7 w-7 rounded-md" />
          </div>
        </div>
      ))}
    </div>
    <div className="p-4 pt-3 space-y-3">
      <Skeleton className="h-px w-full" />
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-12" />
        <Skeleton className="h-6 w-24" />
      </div>
      <Skeleton className="h-12 w-full rounded-md" />
    </div>
  </Card>
);
