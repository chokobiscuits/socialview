/**
 * Sort options, shared by the client toolbar and the server query. Kept out of
 * server/queries so importing them cannot drag Prisma into the browser bundle.
 */
export const SORTS = ["views", "newest", "oldest", "likes"] as const;
export type Sort = (typeof SORTS)[number];

export const SORT_LABELS: Record<Sort, string> = {
  views: "Most Views",
  newest: "Newest",
  oldest: "Oldest",
  likes: "Most Liked",
};

export function parseSort(raw: string | string[] | undefined): Sort {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return SORTS.includes(v as Sort) ? (v as Sort) : "views";
}
