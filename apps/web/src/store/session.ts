import { createSignal } from "solid-js";
import type { SessionUser } from "@tipiment/shared";

export type Session = { user: SessionUser; accessToken: string };

/** Access token conservé en mémoire uniquement — jamais localStorage (CDC §4.4) */
const [session, setSession] = createSignal<Session | null>(null);

export { session, setSession };

export function clearSession(): void {
  setSession(null);
}
