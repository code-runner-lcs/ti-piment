import { createResource, For, Show, type JSX } from "solid-js";
import { api } from "../api/client";
import { session } from "../store/session";

export function Matches(): JSX.Element {
  const [matches] = createResource(async () => {
    if (!session()) return [];
    try {
      return await api.listMatches();
    } catch {
      return [];
    }
  });

  return (
    <main class="matches">
      <h1>Mes matchs</h1>
      <Show when={!matches.loading} fallback={<p class="muted">Chargement…</p>}>
        <Show when={(matches() ?? []).length > 0} fallback={<p class="muted">Aucun match pour l'instant — retourne swiper !</p>}>
          <For each={matches()}>{(m) => (
            <a class="match-row" href={`/me/matches/${m.id}`}>
              <Show when={m.otherProfile.thumbUrl} fallback={<div class="avatar placeholder" />}>
                <img class="avatar" src={m.otherProfile.thumbUrl!} alt="" />
              </Show>
              <div>
                <strong>{m.otherProfile.displayName}</strong>
                <p class="muted">Matché le {new Date(m.created_at).toLocaleDateString("fr-FR")} — ouvrir le chat</p>
              </div>
            </a>
          )}</For>
        </Show>
      </Show>

    </main>
  );
}
