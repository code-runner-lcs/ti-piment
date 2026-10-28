import { createResource, createSignal, For, Show, type JSX } from "solid-js";
import { api, ApiClientError } from "../api/client";
import { type PhotoDto, type ProfileInput } from "@tipiment/shared";
import { clearSession, session } from "../store/session";

const INTENTION_LABEL: Record<string, string> = {
  relation_serieuse: "Relation sérieuse",
  sortir_decouvrir: "Sortir, découvrir",
  a_voir: "À voir",
};
const GENDER_LABEL: Record<string, string> = {
  femme: "Femme",
  homme: "Homme",
  non_binaire: "Non-binaire",
  autre: "Autre",
};

export function Profile(): JSX.Element {
  const [bundle, { refetch }] = createResource(async () => {
    const b = await api.getProfile();
    return b;
  });

  const field = (name: "displayName" | "intention" | "gender" | "seeking" | "commune" | "bio"): string => {
    const b = bundle();
    if (!b?.profile) return "";
    const v = b.profile[name];
    return v === null ? "" : v;
  };

  const draft = () => ({
    displayName: signalStr("displayName"),
    intention: signalStr("intention"),
    gender: signalStr("gender"),
    seeking: signalStr("seeking"),
    bio: signalStr("bio"),
    commune: signalStr("commune"),
  });
  let signals: Record<string, ReturnType<typeof createSignal<string>>> = {};
  const ensureSignals = (): void => {
    if (Object.keys(signals).length === 0) {
      signals = {
        displayName: createSignal(""),
        intention: createSignal(""),
        gender: createSignal(""),
        seeking: createSignal(""),
        bio: createSignal(""),
        commune: createSignal(""),
      };
    }
  };
  const signalStr = (name: string): string => {
    ensureSignals();
    return signals[name]![0]();
  };
  const setSignal = (name: string, v: string): void => {
    ensureSignals();
    signals[name]![1](v);
  };
  const hydrate = (): void => {
    for (const name of ["displayName", "intention", "gender", "seeking", "bio", "commune"] as const) {
      ensureSignals();
      const v = field(name);
      if (signals[name]![0]() === "") signals[name]![1](v);
    }
  };

  // hydrate dès que les données arrivent
  createResource;
  void bundle();
  Promise.resolve().then(hydrate);

  const [saveMsg, setSaveMsg] = createSignal<string | null>(null);
  const [saveErr, setSaveErr] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const save = async (e: Event): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setSaveErr(null);
    setSaveMsg(null);
    try {
      // les <select> contraint déjà les valeurs aux unions -> cast sûr ici
      await api.saveProfile({
        displayName: draft().displayName,
        intention: draft().intention,
        gender: draft().gender,
        seeking: draft().seeking,
        bio: draft().bio,
        commune: draft().commune,
      } as ProfileInput);
      const prefs = bundle()?.preferences;
      await api.savePreferences({
        ageMin: prefs?.ageMin ?? 18,
        ageMax: prefs?.ageMax ?? 99,
        distanceKm: prefs?.distanceKm ?? 50,
        intention: null,
      });
      setSaveMsg("Profil enregistré ✅");
      await refetch();
    } catch (err) {
      setSaveErr(err instanceof ApiClientError ? err.message : "Erreur réseau — réessaie.");
    } finally {
      setBusy(false);
    }
  };

  const [uploadErr, setUploadErr] = createSignal<string | null>(null);
  const onUpload = async (e: Event): Promise<void> => {
    setUploadErr(null);
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      await api.uploadPhoto(file);
      await refetch();
    } catch (err) {
      setUploadErr(err instanceof ApiClientError ? err.message : "Upload impossible.");
    } finally {
      input.value = "";
    }
  };

  const removePhoto = async (id: string): Promise<void> => {
    await api.deletePhoto(id).catch(() => undefined);
    await refetch();
  };

  const [delWarn, setDelWarn] = createSignal(false);
  const deleteAccount = async (): Promise<void> => {
    if (!delWarn()) {
      setDelWarn(true);
      return;
    }
    await api.deleteMe().catch(() => undefined);
    clearSession();
    window.location.href = "/register";
  };

  const prefsValue = (name: "ageMin" | "ageMax" | "distanceKm"): number => {
    const p = bundle()?.preferences;
    if (!p) return name === "ageMin" ? 18 : name === "ageMax" ? 99 : 50;
    return p[name];
  };

  return (
    <main class="profile">
      <h1>Mon profil</h1>
      <Show when={bundle()?.profile && bundle()!.profile!.emailVerified === false}>
        <p class="banner">⚠️ Vérifie ton email pour publier ton profil et participer. <a href="/verify-email">Renvoyer le lien</a></p>
      </Show>
      <Show when={bundle()?.profile} fallback={<p class="muted">Charge le profil si tu es connecté.</p>}>
        <form onSubmit={(e) => void save(e)}>
          <label>
            Prénom d'affichage (2–20 car.)
            <input required minlength={2} maxlength={20} value={signalStr("displayName")} onInput={(e) => setSignal("displayName", e.currentTarget.value)} />
          </label>
          <label>
            Mon intention (affichée sur la carte)
            <select required value={signalStr("intention")} onChange={(e) => setSignal("intention", e.currentTarget.value)}>
              <option value="" disabled>Sélectionner…</option>
              <For each={Object.keys(INTENTION_LABEL)}>{(k) => <option value={k}>{INTENTION_LABEL[k]!}</option>}</For>
            </select>
          </label>
          <label>
            Je suis
            <select required value={signalStr("gender")} onChange={(e) => setSignal("gender", e.currentTarget.value)}>
              <option value="" disabled>Sélectionner…</option>
              <For each={Object.keys(GENDER_LABEL)}>{(k) => <option value={k}>{GENDER_LABEL[k]!}</option>}</For>
            </select>
          </label>
          <label>
            Je cherche
            <select required value={signalStr("seeking")} onChange={(e) => setSignal("seeking", e.currentTarget.value)}>
              <option value="" disabled>Sélectionner…</option>
              <option value="femme">Des femmes</option>
              <option value="homme">Des hommes</option>
              <option value="tous">Tout le monde</option>
            </select>
          </label>
          <label>
            Commune (affichée)
            <input required minlength={2} maxlength={64} value={signalStr("commune")} onInput={(e) => setSignal("commune", e.currentTarget.value)} />
          </label>
          <label>
            Bio (≤ 500 car., pas de liens ni réseaux sociaux)
            <textarea maxlength={500} rows={3} value={signalStr("bio")} onInput={(e) => setSignal("bio", e.currentTarget.value)} />
          </label>
          <fieldset>
            <legend>Recherche</legend>
            <label>
              Âge min <input type="number" min={18} max={99} value={String(prefsValue("ageMin"))} disabled />
            </label>
            <p class="muted">Les préférences deviennent éditables en M2 (deck) — valeur par défaut appliquée.</p>
          </fieldset>
          <button type="submit" disabled={busy()}>Enregistrer</button>
          <Show when={saveMsg()}><p class="ok">{saveMsg()}</p></Show>
          <Show when={saveErr()}><p class="error">{saveErr()}</p></Show>
        </form>

        <h2>Photos (1–6)</h2>
        <Show when={uploadErr()}><p class="error">{uploadErr()}</p></Show>
        <div class="photos">
          <For each={bundle()?.photos ?? []}>
            {(p: PhotoDto) => (
              <div class="photo-card">
                <img src={p.thumbUrl} alt={`Photo ${p.position}`} />
                <span class="badge-status">{p.status === "approved" ? "✓ approuvée" : p.status === "pending" ? "… en attente" : "✕ refusée"}</span>
                <button type="button" onClick={() => void removePhoto(p.id)}>Supprimer</button>
              </div>
            )}
          </For>
        </div>
        <label class="uploader">
          Ajouter une photo (JPEG/PNG/WebP ≤ 8 Mo)
          <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void onUpload(e)} />
        </label>
        <Show when={bundle()?.completed}>
          <p class="ok">Profil complet ✓</p>
        </Show>

        <h2>Compte</h2>
        <p class="muted">Email : {session()?.user.email} {session()?.user.emailVerified === false ? "(non vérifié)" : "(vérifié)"}</p>
        <button type="button" class="danger" onClick={() => void deleteAccount()}>
          {delWarn() ? "⚠️ Confirmer la suppression (irréversible)" : "Supprimer mon compte"}
        </button>
      </Show>
    </main>
  );
}
