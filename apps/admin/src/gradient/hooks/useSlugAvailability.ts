import { useState, useEffect } from "react";

export function useSlugAvailability(
  slug: string,
  checkService: (slug: string) => Promise<{ available?: boolean; isAvailable?: boolean } | any>,
  initialSlug?: string,
  delay: number = 700
) {
  const [checkingSlug, setCheckingSlug] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!slug) {
      setSlugAvailable(null);
      return;
    }

    if (initialSlug && slug === initialSlug) {
      setSlugAvailable(true);
      setCheckingSlug(false);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingSlug(true);
      try {
        const response = await checkService(slug);
        setSlugAvailable(response?.available ?? response?.isAvailable ?? true);
      } catch (error) {
        setSlugAvailable(false);
      } finally {
        setCheckingSlug(false);
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [slug, checkService, initialSlug, delay]);

  return { slugAvailable, checkingSlug };
}
