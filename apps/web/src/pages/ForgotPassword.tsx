import { createSignal, Show, type JSX } from "solid-js";
import { api } from "../api/client";

export function ForgotPassword(): JSX.Element {
  const [email, setEmail] = createSignal("");
  const [sent, setSent] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);

  const submit = async (e: Event): Promise<void> => {
    e.preventDefault();
    setError(null);
    try {
      await api.forgotPassword(email());
      setSent(true); // TOUJOURS le même message (anti-énumération)
    } catch {
      setError("Erreur réseau — réessaie.");
    }
  };

  return (
    <main class="auth">
      <h1>Mot de passe oublié</h1>
      <Show when={!sent()} fallback={<p class="muted">Si ce compte existe, un email de réinitialisation part (valable 30 min). Vérifie tes spams.</p>}>
        <form onSubmit={(e) => void submit(e)}>
          <input type="email" placeholder="Ton email" required value={email()} onInput={(e) => setEmail(e.currentTarget.value)} />
          <button type="submit">Envoyer le lien</button>
          <Show when={error()}><p class="error">{error()}</p></Show>
        </form>
      </Show>
      <p class="muted"><a href="/login">Retour à la connexion</a></p>
    </main>
  );
}
