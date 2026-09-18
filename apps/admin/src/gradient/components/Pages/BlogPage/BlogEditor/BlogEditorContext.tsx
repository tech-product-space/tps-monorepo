"use client";

import { createContext, useContext, useEffect, useRef } from "react";

/**
 * "saved"   — the section persisted successfully (or had nothing to persist)
 * "invalid" — validation failed, nothing was sent
 * Anything else that goes wrong should throw so the editor can surface it.
 */
export type SectionSaveResult = "saved" | "invalid";

export interface BlogEditorSectionApi {
  save: () => Promise<SectionSaveResult>;
}

interface BlogEditorContextValue {
  registerSection: (id: string, api: BlogEditorSectionApi) => void;
  unregisterSection: (id: string) => void;
  setSectionDirty: (id: string, dirty: boolean) => void;
}

const BlogEditorContext = createContext<BlogEditorContextValue | null>(null);

export const BlogEditorProvider = BlogEditorContext.Provider;

/**
 * Lets a tab hand its dirty state and save routine up to the editor shell, so a
 * single header button can save every section that actually changed.
 */
export function useBlogEditorSection(
  id: string,
  isDirty: boolean,
  save: () => Promise<SectionSaveResult>,
) {
  const ctx = useContext(BlogEditorContext);
  const saveRef = useRef(save);

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  useEffect(() => {
    if (!ctx) return;
    ctx.registerSection(id, { save: () => saveRef.current() });
    return () => ctx.unregisterSection(id);
  }, [ctx, id]);

  useEffect(() => {
    ctx?.setSectionDirty(id, isDirty);
  }, [ctx, id, isDirty]);
}
