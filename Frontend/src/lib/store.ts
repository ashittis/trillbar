import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SessionOut } from "./api";

interface StudioState {
  sessionId: string | null;
  session: SessionOut | null;
  activeActorId: string | null;
  activeDialogueLineId: string | null;

  setSession: (session: SessionOut) => void;
  clearSession: () => void;
  setActiveActorId: (id: string | null) => void;
  setActiveDialogueLineId: (id: string | null) => void;
}

export const useStudioStore = create<StudioState>()(
  persist(
    (set) => ({
      sessionId: null,
      session: null,
      activeActorId: null,
      activeDialogueLineId: null,

      setSession: (session) => set({ session, sessionId: session.id }),
      clearSession: () => set({ session: null, sessionId: null, activeActorId: null, activeDialogueLineId: null }),
      setActiveActorId: (id) => set({ activeActorId: id }),
      setActiveDialogueLineId: (id) => set({ activeDialogueLineId: id }),
    }),
    {
      name: "trillbar-studio",
      partialize: (s) => ({ sessionId: s.sessionId, session: s.session }),
    }
  )
);
