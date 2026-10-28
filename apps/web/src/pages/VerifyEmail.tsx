import { useNavigate, useSearchParams } from "@solidjs/router";
import { createSignal, onMount, Show, type JSX } from "solid-js";
import { api, ApiClientError } from "../api/client";
import { session } from "../store/session";

export function VerifyEmail(): JSX.Element {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [status, setStatus] = createSignal<"pending" | "ok" | "error" | "wait">("pending");
  const [message, setMessage] = createSignal("Vérification en cours…");
  const [resendEmail, setResendEmail] = createSignal("");
  const [resendDone, setResendDone] = createSignal(false);

  onMount(() => {
    const token = search.token;
    if (typeof token !== "string" || token.length < 10) {
      setStatus("wait");
      setMessage("Ouvre ton email et clique sur le lien — ou entre ton adresse ici pour recevoir un nouveau lien.");
      return;
    }
    void api
      .verifyEmail(token)
      .then((r) => {
        setStatus("ok");
        setMessage(`Email vérifié : ${r.email} — tu peux tout faire maintenant.`);
      })
      .catch((err: unknown) => {
        setStatus("error");
        setMessage(err instanceof ApiClientError ? err.message : "Lien invalide ou expiré.");
      });
  });

  const resend = async (e: Event): Promise<void> => {
    e.preventDefault();
    setResendDone(true);
    await api.resendVerification(resendEmail()).catch(() => undefined); // réponse générique (anti-énumération)
  };

  return (
    <main class="auth">
      <h1>Vérifie ton email</h1>
      <p>
        <Show when={status() === "ok"} fallback={<span class="muted">{message()}</span>}>
          <span class="ok">{message()}</span>
        </Show>
      </p>
      <Show when={status() !== "pending" && status() !== "ok"}>
        <form onSubmit={(e) => void resend(e)}>
          <input type="email" placeholder="Ton email" required value={resendEmail()} onInput={(e) => setResendEmail(e.currentTarget.value)} />
          <button type="submit" disabled={resendDone()}>Renvoyer le lien</button>
          <Show when={resendDone()}>
            <p class="muted">Si ce compte existe, un nouveau lien part (vérifie tes spams). Réponse identique sinon.</p>
          </Show>
        </form>
      </Show>
      <Show when={status() === "ok"}>
        <button type="button" onClick={() => void navigate(session() ? "/me/profil" : "/login", { replace: true })}>
          {session() ? "Compléter mon profil" : "Se connecter"}
        </button>
      </Show>
    </main>
  );
}
