import { createSignal, Show, type JSX } from "solid-js";
import type { CardDto, DeckDto, MatchDto, QuotasDto } from "@tipiment/shared";
import { api, ApiClientError } from "../api/client";

const INTENTION_LABEL: Record<string, string> = {
  relation_serieuse: "Relation sérieuse",
  sortir_decouvrir: "Sortir, découvrir",
  a_voir: "À voir",
};

export function Discover(): JSX.Element {
  const [deck, setDeck] = createSignal<(DeckDto & { quotas: QuotasDto }) | null>(null);
  const [idx, setIdx] = createSignal(0);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [matched, setMatched] = createSignal<MatchDto | null>(null);
  const [quotaMsg, setQuotaMsg] = createSignal<string | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    setQuotaMsg(null);
    try {
      const d = await api.getDeck();
      setDeck(d);
      setIdx(0);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Erreur réseau — réessaie.");
    } finally {
      setLoading(false);
    }
  };
  void load();

  const current = (): CardDto | undefined => deck()?.cards[idx()];

  const swipe = async (action: "pass" | "like" | "superlike"): Promise<void> => {
    const card = current();
    if (!card || loading()) return;
    setError(null);
    try {
      const res = await api.swipe({ targetProfileId: card.profileId, action });
      setDeck({ ...(deck() as DeckDto & { quotas: QuotasDto }), quotas: res.quotas });
      setIdx((i) => i + 1);
      setQuotaMsg(null);
      if (res.matched && res.match) setMatched(res.match);
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.code === "ALREADY_SWIPED") {
          setIdx((i) => i + 1); // pile déjà vue : on saute la carte
          return;
        }
        if (err.code === "QUOTA_LIKES" || err.code === "QUOTA_SUPERLIKES") {
          setQuotaMsg(err.message);
          return;
        }
      }
      setError(err instanceof ApiClientError ? err.message : "Erreur réseau — réessaie.");
    }
  };

  const exhausted = (): boolean => loading() === false && deck() !== null && deck()!.cards.length > 0 && idx() >= deck()!.cards.length;

  return (
    <main class="discover">
      <div class="quotas-bar">
        <span>❤ {deck()?.quotas.likes ?? "–"}/{deck()?.quotas.maxLikes ?? 25}</span>
        <span>⚡ {deck()?.quotas.superlikes ?? "–"}/{deck()?.quotas.maxSuperlikes ?? 1}</span>
        <span class="muted">reset à minuit</span>
      </div>

      <Show when={!loading()} fallback={<p class="muted">Chargement du deck…</p>}>
        <Show
          when={current()}
          fallback={
            <div class="empty">
              <p>Ola — personne de nouveau pour l'instant.</p>
              <Show when={exhausted()}>
                <p class="muted">Reviens plus tard ou élargis tes préférences.</p>
              </Show>
              <button type="button" onClick={() => void load()}>Rafraîchir</button>
              <a href="/me/profil">Ajuster mon profil</a>
            </div>
          }
        >
          {(card) => (
            <article class="card">
              <Show when={card().superlikedMe}>
                <div class="super">⚡ T'a envoyé un super-like</div>
              </Show>
              <img src={card().mainUrl} alt={`Photo de ${card().displayName}`} />
              <h2>
                {card().displayName} · {card().age} · {card().commune}
              </h2>
              <span class="pill">{INTENTION_LABEL[card().intention] ?? card().intention}</span>
              <Show when={card().distanceKm !== null}><span class="pill">📍 {card().distanceKm} km</span></Show>
              <Show when={card().bio}>
                <p class="bio">{card().bio}</p>
              </Show>
              <div class="actions">
                <button type="button" class="pass" onClick={() => void swipe("pass")}>✕ Passe</button>
                <button type="button" class="super" disabled={(deck()?.quotas.superlikes ?? 0) <= 0} onClick={() => void swipe("superlike")}>⚡</button>
                <button type="button" class="like" disabled={(deck()?.quotas.likes ?? 0) <= 0} onClick={() => void swipe("like")}>❤ Like</button>
              </div>
            </article>
          )}
        </Show>
      </Show>

      <Show when={quotaMsg()}><p class="error">{quotaMsg()}</p></Show>
      <Show when={error()}><p class="error">{error()}</p></Show>

      <Show when={matched()}>
        {(m) => (
          <div class="overlay">
            <div class="match-box">
              <h2>Matché ! 🎉</h2>
              <p>Tu as matché avec <strong>{m().otherProfile.displayName}</strong></p>
              <a href="/me/matches">Ouvrir mes matchs</a>
              <button type="button" onClick={() => setMatched(null)}>Continuer à swiper</button>
            </div>
          </div>
        )}
      </Show>

    </main>
  );
}
