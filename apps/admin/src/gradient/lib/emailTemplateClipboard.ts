"use client";

import { useCallback, useEffect, useState } from "react";

import storage from "@/gradient/lib/storage";

const CLIP_KEY = "gradient:emailTemplateClip";

/**
 * The native `storage` event fires in *other* tabs only — never in the one that
 * wrote the value. Without a same-tab signal the Paste button in the tab you
 * just copied from would stay disabled until a refresh, which reads as broken
 * precisely when someone is testing the feature in a single tab.
 */
const SAME_TAB_EVENT = "gradient:emailTemplateClip";

const CLIP_VERSION = 1;

export type EmailTemplateClip = {
  version: number;
  subject: string;
  body: string;
  copiedAt: number;
  source: { eventTitle: string; type: string };
};

const parseClip = (raw: string | null): EmailTemplateClip | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);

    // A tab left open across a deploy can read a payload written by a newer
    // panel. Treat anything unrecognised as an empty clipboard rather than
    // pasting a half-understood shape into a live email.
    if (parsed?.version !== CLIP_VERSION) return null;
    if (typeof parsed.subject !== "string") return null;
    if (typeof parsed.body !== "string") return null;
    if (typeof parsed.source?.type !== "string") return null;

    return parsed as EmailTemplateClip;
  } catch {
    return null;
  }
};

/**
 * A one-slot clipboard for event email templates, backed by localStorage so it
 * is shared by every admin tab on this origin. Deliberately not the system
 * clipboard: reading that needs a permission grant (and is unavailable to web
 * pages in Firefox), and round-tripping Tiptap HTML through it loses fidelity.
 */
export function useEmailTemplateClip() {
  const [clip, setClip] = useState<EmailTemplateClip | null>(null);

  // Read inside an effect rather than seeding useState: `storage` returns null
  // during SSR, so reading it in the initialiser would mismatch on hydration.
  useEffect(() => {
    const sync = () => setClip(parseClip(storage.get(CLIP_KEY)));

    sync();

    const onStorage = (event: StorageEvent) => {
      // `key` is null when another tab calls localStorage.clear().
      if (event.key !== null && event.key !== CLIP_KEY) return;
      sync();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(SAME_TAB_EVENT, sync);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SAME_TAB_EVENT, sync);
    };
  }, []);

  const copy = useCallback(
    (input: Omit<EmailTemplateClip, "version" | "copiedAt">) => {
      const next: EmailTemplateClip = {
        ...input,
        version: CLIP_VERSION,
        copiedAt: Date.now(),
      };

      storage.set(CLIP_KEY, JSON.stringify(next));
      // Let the listener above own every state update, so this tab and the
      // others take exactly the same path.
      window.dispatchEvent(new Event(SAME_TAB_EVENT));
    },
    [],
  );

  const clear = useCallback(() => {
    storage.remove(CLIP_KEY);
    window.dispatchEvent(new Event(SAME_TAB_EVENT));
  }, []);

  return { clip, copy, clear };
}
