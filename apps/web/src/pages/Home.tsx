import { Navigate } from "@solidjs/router";
import { Show, type JSX } from "solid-js";
import { session } from "../store/session";

export function Home(): JSX.Element {
  return (
    <Show when={session()} fallback={<Navigate href="/login" />}>
      {(s) => (
        <main class="home">
          <h1>TiPiment</h1>
          <p>
            Connecté : <strong>{s().user.email}</strong>
          </p>
          <Show when={!s().user.emailVerified}>
            <p class="banner">Vérifie ton email pour publier ton profil. <a href="/verify-email">Lien</a></p>
          </Show>
          <a href="/me/profil">Compléter mon profil →</a>
        </main>
      )}
    </Show>
  );
}
