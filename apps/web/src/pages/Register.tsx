import { useNavigate } from "@solidjs/router";
import { createSignal, Show, type JSX } from "solid-js";
import { api, ApiClientError } from "../api/client";

export function Register(): JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [birthDate, setBirthDate] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.register({ email: email(), password: password(), birthDate: birthDate() });
      // M1 : écran « Vérifie ton email pour commencer » — la vérification deviendra obligatoire (CDC §4.1)
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Erreur réseau — réessaie.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main class="auth">
      <h1>TiPiment</h1>
      <p class="muted">Création de compte</p>
      <form onSubmit={submit}>
        <input type="email" placeholder="Email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
        <input type="password" placeholder="Mot de passe (8 caractères minimum)" required minlength={8} value={password()} onInput={(e) => setPassword(e.currentTarget.value)} />
        <label class="muted">
          Date de naissance (18 ans minimum)
          <input type="date" required value={birthDate()} onInput={(e) => setBirthDate(e.currentTarget.value)} />
        </label>
        <button type="submit" disabled={busy()}>Créer mon compte</button>
        <Show when={error()}><p class="error">{error()}</p></Show>
      </form>
      <p class="muted">
        Déjà un compte ? <a href="/login">Se connecter</a>
      </p>
    </main>
  );
}
