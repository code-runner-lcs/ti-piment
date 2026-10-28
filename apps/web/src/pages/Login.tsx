import { useNavigate } from "@solidjs/router";
import { createSignal, Show, type JSX } from "solid-js";
import { api, ApiClientError } from "../api/client";
import { setSession } from "../store/session";

export function Login(): JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { accessToken, user } = await api.login({ email: email(), password: password() });
      setSession({ accessToken, user });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Erreur réseau — réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="auth">
      <h1>TiPiment</h1>
      <p class="muted">Connexion</p>
      <form onSubmit={submit}>
        <input type="email" placeholder="Email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
        <input type="password" placeholder="Mot de passe" required value={password()} onInput={(e) => setPassword(e.currentTarget.value)} />
        <button type="submit" disabled={busy()}>Se connecter</button>
        <Show when={error()}><p class="error">{error()}</p></Show>
      </form>
      <p class="muted">
        Pas de compte ? <a href="/register">Créer un compte</a>
      </p>
    </main>
  );
}
