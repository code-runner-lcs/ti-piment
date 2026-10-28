import { useNavigate, useSearchParams } from "@solidjs/router";
import { createSignal, Show, type JSX } from "solid-js";
import { api, ApiClientError } from "../api/client";

export function ResetPassword(): JSX.Element {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [done, setDone] = createSignal(false);

  const submit = async (e: Event): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword(String(search.token ?? ""), password());
      setDone(true);
      setTimeout(() => navigate("/login", { replace: true }), 1200);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Erreur réseau — réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="auth">
      <h1>Nouveau mot de passe</h1>
      <Show when={!done()} fallback={<p class="ok">Mot de passe changé — toutes les sessions ont été déconnectées.</p>}>
        <form onSubmit={(e) => void submit(e)}>
          <input type="password" placeholder="Nouveau mot de passe (8 min.)" required minlength={8} value={password()} onInput={(e) => setPassword(e.currentTarget.value)} />
          <button type="submit" disabled={busy()}>Changer mon mot de passe</button>
          <Show when={error()}><p class="error">{error()}</p></Show>
          <p class="muted">En changeant ton mot de passe, toutes tes autres sessions sont révoquées.</p>
        </form>
      </Show>
    </main>
  );
}
