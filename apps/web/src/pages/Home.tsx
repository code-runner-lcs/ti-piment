import { Navigate } from "@solidjs/router";
import { createResource, Show, type JSX } from "solid-js";
import { api } from "../api/client";
import { clearSession, session } from "../store/session";

export function Home(): JSX.Element {
  const [state] = createResource(async () => {
    const me = await api.me();
    const hello = (await api.hello()).message;
    return { me, hello };
  });

  const ready = () => {
    if (state.error || !session()) return null;
    return state() ?? null;
  };

  return (
    <Show when={ready()} keyed fallback={<Navigate href="/login" />}>
      {(s) => (
        <main class="home">
          <h1>TiPiment</h1>
          <p>
            Connecté : <strong>{s.me.email}</strong>
          </p>
          <p class="ok">{s.hello}</p>
          <button onClick={() => clearSession()}>Se déconnecter</button>
        </main>
      )}
    </Show>
  );
}
