import Image from "next/image";
import { Video } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Platform thumbnails, with a graceful placeholder. YouTube omits thumbnails
 * for some private or processing videos, so the null case is real, not defensive.
 */
export function Thumbnail({
  src,
  alt,
  className,
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const base = cn(
    "relative overflow-hidden rounded bg-muted",
    className,
  );

  if (!src) {
    return (
      <div className={cn(base, "grid place-items-center")}>
        <Video className="size-3.5 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={base}>
      <Image src={src} alt={alt} fill sizes="120px" className="object-cover" />
    </div>
  );
}
