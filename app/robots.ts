import type { MetadataRoute } from "next";

/** Внутренняя система: в поисковики не попадает. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
