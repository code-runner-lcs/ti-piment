import { useParams, useNavigate } from "@solidjs/router";
import { createEffect, createResource, createSignal, For, Show, type JSX } from "solid-js";
import { type MessageDto } from "@tipiment/shared";
import { api, ApiClientError } from "../api/client";
import { chatSocket, closeSocket } from "../api/socket";
import { session } from "../store/session";

export function Chat(): JSX.Element {
  const params = useParams();
  const navigate = useNavigate();
  const matchId = () => params.id ?? "";
  const [messages, setMessages] = createSignal<MessageDto[]>([]);
  const [otherName, setOtherName] = createSignal("");
  const [frozen, setFrozen] = createSignal(false);
  const [draft, setDraft] = createSignal("");
  const [error, setError] = createSignal<string | null>(null);
  const [typingOther, setTypingOther] = createSignal(false);
  const [reportOpen, setReportOpen] = createSignal(false);
  let typingTimer: ReturnType<typeof setTimeout> | undefined;

  const [meta] = createResource(async () => {
    if (!session()) return null;
    const all = await api.listMatches();
    const m = all.find((x) => x.id === matchId());
    const res = await api.listMessages(matchId(), null);
    setMessages(res.messages);
    setFrozen(res.frozen);
    setOtherName(m?.otherProfile.displayName ?? "?");
    return m ?? null;
  });

  createEffect(() => {
    void session();
    const sock = chatSocket();
    sock.on("message:new", (m: MessageDto) => {
      if (m.matchId === matchId()) setMessages((prev) => [...prev, m]);
    });
    sock.on("typing", (t: { matchId: string }) => {
      if (t.matchId === matchId()) {
        setTypingOther(true);
        setTimeout(() => setTypingOther(false), 1500);
      }
    });
    sock.on("blocked", () => setFrozen(true));
    return () => {
      sock.off("message:new");
      sock.off("typing");
      sock.off("blocked");
    };
  });

  const send = async (e: Event): Promise<void> => {
    e.preventDefault();
    const body = draft().trim();
    if (!body || frozen()) return;
    const clientUuid = crypto.randomUUID();
    setDraft("");
    const sock = chatSocket();
    sock.emit("message:send", { matchId: matchId(), clientUuid, body }, (r: { error?: string }) => {
      if (r.error === "RATE_LIMITED") setError("Trop de messages — ralentis un peu.");
      else if (r.error === "CONVERSATION_FROZEN") setFrozen(true);
      else if (r.error) setError("Envoi impossible.");
    });
    try {
      await api.sendMessageRest(matchId(), clientUuid, body); // idempotent : même uuid
    } catch (err) {
      if (!(err instanceof ApiClientError && err.code === "CONVERSATION_FROZEN") && err instanceof ApiClientError && err.code !== "ALREADY_EXISTS") {
        setError(err.message);
      }
    }
  };

  const onInput = (): void => {
    if (frozen()) return;
    const sock = chatSocket();
    sock.emit("typing", { matchId: matchId() });
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => undefined, 900);
  };

  const blockOther = async (): Promise<void> => {
    const otherId = (meta() as { otherProfile?: { userId?: string } } | undefined)?.otherProfile?.userId;
    if (!otherId) return;
    await api.blockUser({ userId: otherId }).catch(() => undefined);
    setFrozen(true);
  };

  const submitReport = async (e: Event): Promise<void> => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    try {
      await api.submitReport({
        targetProfileId: meta()?.otherProfile.profileId ?? "",
        reason: String(fd.get("reason")) as "faux_profil",
        detail: String(fd.get("detail") || "") || null,
      });
      setReportOpen(false);
      setError("Signalement envoyé — réponse < 24 h. Merci.");
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Signalement impossible.");
    }
  };

  return (
    <main class="chat">
      <header class="chathead">
        <button type="button" class="link" onClick={() => { closeSocket(); navigate("/me/matches"); }}>←</button>
        <strong>{otherName()}</strong>
        <Show when={!frozen()}>
          <button type="button" class="link danger" onClick={() => setReportOpen(!reportOpen())}>Signaler</button>
          <button type="button" class="link danger" onClick={() => void blockOther()}>Bloquer</button>
        </Show>
      </header>

      <Show when={frozen()} fallback={<Show when={typingOther()}><p class="muted">{otherName()} écrit…</p></Show>}>
        <p class="banner">Conversation figée (blocage). Tu peux débloquer depuis ton profil si besoin.</p>
      </Show>

      <div class="messages">
        <For each={messages()}>{(m) => (
          <div class={`msg ${m.senderId === session()?.user.id ? "mine" : ""}`}>{m.body}</div>
        )}</For>
      </div>

      <Show when={reportOpen()}>
        <form class="report" onSubmit={(e) => void submitReport(e)}>
          <label>Choisis un motif
            <select name="reason" required>
              <option value="faux_profil">Faux profil</option>
              <option value="contenu_inapproprie">Contenu inapproprié</option>
              <option value="harcelement">Harcèlement</option>
              <option value="escroquerie">Escroquerie</option>
              <option value="mineur">Mineur</option>
              <option value="autre">Autre</option>
            </select>
          </label>
          <textarea name="detail" placeholder="Détails (optionnel, 500 car.)" maxlength={500} />
          <button type="submit">Envoyer le signalement</button>
        </form>
      </Show>

      <form class="send" onSubmit={(e) => void send(e)}>
        <input
          placeholder={frozen() ? "Conversation figée" : "Ton message (1000 car.)"}
          maxlength={1000}
          required
          disabled={frozen()}
          value={draft()}
          onInput={(e) => { setDraft(e.currentTarget.value); onInput(); }}
        />
        <button type="submit" disabled={frozen()}>Envoyer</button>
      </form>
      <Show when={error()}><p class="error">{error()}</p></Show>
    </main>
  );
}
