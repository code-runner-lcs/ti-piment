import { createResource, createEffect, createSignal, Show, For, type JSX } from "solid-js";
import { createStore } from "solid-js/store";
import { type CityDto, type PhotoDto, type ProfileInput } from "@tipiment/shared";
import { api, ApiClientError } from "../api/client";
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

interface FormState {
  displayName: string;
  intention: string;
  gender: string;
  seeking: string;
  bio: string;
  commune: string;
  communeInsee: string | null;
  ageMin: number;
  ageMax: number;
  distanceKm: number;
  hydrated: boolean;
}

const DEFAULTS: FormState = {
  displayName: "", intention: "", gender: "", seeking: "", bio: "", commune: "", communeInsee: null,
  ageMin: 18, ageMax: 99, distanceKm: 50, hydrated: false,
};

export function Profile(): JSX.Element {
  const [bundle, { refetch }] = createResource(async () => api.getProfile());
  const [form, setForm] = createStore<FormState>({ ...DEFAULTS });
  const [saveMsg, setSaveMsg] = createSignal<string | null>(null);
  const [saveErr, setSaveErr] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);
  const [uploadErr, setUploadErr] = createSignal<string | null>(null);
  const [cities, setCities] = createSignal<CityDto[]>([]);

  const onCommuneInput = (v: string): void => {
    setForm("commune", v);
    setForm("communeInsee", null); // texte libre = INSEE inconnu (distance "—")
    if (v.trim().length >= 2) {
      void api.searchCities(v).then(setCities).catch(() => setCities([]));
    } else {
      setCities([]);
    }
  };

  const pickCity = (c: CityDto): void => {
    setForm("commune", c.name);
    setForm("communeInsee", c.insee);
    setCities([]);
  };

  const [delWarn, setDelWarn] = createSignal(false);

  // hydratation une seule fois quand les données arrivent
  createEffect(() => {
    const b = bundle();
    if (!b || form.hydrated) return;
    setForm({
      displayName: b.profile?.displayName ?? "",
      intention: b.profile?.intention ?? "",
      gender: b.profile?.gender ?? "",
      seeking: b.profile?.seeking ?? "",
      bio: b.profile?.bio ?? "",
      commune: b.profile?.commune ?? "",
      communeInsee: b.profile?.communeInsee ?? null,
      ageMin: b.preferences?.ageMin ?? 18,
      ageMax: b.preferences?.ageMax ?? 99,
      distanceKm: b.preferences?.distanceKm ?? 50,
      hydrated: true,
    });
  });

  const save = async (e: Event): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setSaveErr(null);
    setSaveMsg(null);
    try {
      const { displayName, intention, gender, seeking, bio, commune, communeInsee } = form;
      // les <select> bornent déjà les unions -> cast sûr
      await api.saveProfile({ displayName, intention, gender, seeking, bio, commune, communeInsee } as ProfileInput);
      await api.savePreferences({
        ageMin: Math.min(form.ageMin, form.ageMax),
        ageMax: Math.max(form.ageMin, form.ageMax),
        distanceKm: form.distanceKm,
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

  const deleteAccount = async (): Promise<void> => {
    if (!delWarn()) {
      setDelWarn(true);
      return;
    }
    await api.deleteMe().catch(() => undefined);
    clearSession();
    window.location.href = "/register";
  };

  return (
    <main class="profile">
      <h1>Mon profil</h1>
      <Show when={bundle()?.profile && bundle()!.profile!.emailVerified === false}>
        <p class="banner">⚠️ Vérifie ton email pour publier ton profil et participer. <a href="/verify-email">Renvoyer le lien</a></p>
      </Show>

      <form onSubmit={(e) => void save(e)}>
        <label>
          Prénom d'affichage (2–20 car.)
          <input required minlength={2} maxlength={20} value={form.displayName} onInput={(e) => setForm("displayName", e.currentTarget.value)} />
        </label>
        <label>
          Mon intention (affichée sur la carte)
          <select required value={form.intention} onChange={(e) => setForm("intention", e.currentTarget.value)}>
            <option value="" disabled>Sélectionner…</option>
            <For each={Object.keys(INTENTION_LABEL)}>{(k) => <option value={k}>{INTENTION_LABEL[k]!}</option>}</For>
          </select>
        </label>
        <label>
          Je suis
          <select required value={form.gender} onChange={(e) => setForm("gender", e.currentTarget.value)}>
            <option value="" disabled>Sélectionner…</option>
            <For each={Object.keys(GENDER_LABEL)}>{(k) => <option value={k}>{GENDER_LABEL[k]!}</option>}</For>
          </select>
        </label>
        <label>
          Je cherche
          <select required value={form.seeking} onChange={(e) => setForm("seeking", e.currentTarget.value)}>
            <option value="" disabled>Sélectionner…</option>
            <option value="femme">Des femmes</option>
            <option value="homme">Des hommes</option>
            <option value="tous">Tout le monde</option>
          </select>
        </label>
        <label>
          Commune (affichée)
          <input required minlength={2} maxlength={64} value={form.commune} onInput={(e) => onCommuneInput(e.currentTarget.value)} autocomplete="off" />
        </label>
        <Show when={cities().length > 0}>
          <div class="cities">
            <For each={cities()}>{(c) => (
              <button type="button" class="city-option" onClick={() => pickCity(c)}>{c.label}</button>
            )}</For>
          </div>
        </Show>
        <label>
          Bio (≤ 500 car., pas de liens ni réseaux sociaux)
          <textarea maxlength={500} rows={3} value={form.bio} onInput={(e) => setForm("bio", e.currentTarget.value)} />
        </label>
        <fieldset>
          <legend>Ma recherche</legend>
          <label>Âge min <input type="number" min={18} max={99} value={String(form.ageMin)} onInput={(e) => setForm("ageMin", Number(e.currentTarget.value) || 18)} /></label>
          <label>Âge max <input type="number" min={18} max={99} value={String(form.ageMax)} onInput={(e) => setForm("ageMax", Number(e.currentTarget.value) || 99)} /></label>
          <label>Rayon (km, 1–160) <input type="number" min={1} max={160} value={String(form.distanceKm)} onInput={(e) => setForm("distanceKm", Number(e.currentTarget.value) || 50)} /></label>
        </fieldset>
        <button type="submit" disabled={busy()}>Enregistrer</button>
        <Show when={saveMsg()}><p class="ok">{saveMsg()}</p></Show>
        <Show when={saveErr()}><p class="error">{saveErr()}</p></Show>
      </form>

      <h2>Photos (1–6)</h2>
      <Show when={uploadErr()}><p class="error">{uploadErr()}</p></Show>
      <div class="photos">
        <For each={bundle()?.photos ?? []}>{(p: PhotoDto) => (
          <div class="photo-card">
            <img src={p.thumbUrl} alt={`Photo ${p.position}`} />
            <span class="badge-status">{p.status === "approved" ? "✓ approuvée" : p.status === "pending" ? "… en attente" : "✕ refusée"}</span>
            <button type="button" onClick={() => void removePhoto(p.id)}>Supprimer</button>
          </div>
        )}</For>
      </div>
      <label class="uploader">
        Ajouter une photo (JPEG/PNG/WebP ≤ 8 Mo)
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void onUpload(e)} />
      </label>
      <Show when={bundle()?.completed}><p class="ok">Profil complet ✓ — tu apparaîtras dans les decks.</p></Show>

      <h2>Compte</h2>
      <p class="muted">Email : {session()?.user.email} {session()?.user.emailVerified === false ? "(non vérifié)" : "(vérifié)"}</p>
      <button type="button" class="danger" onClick={() => void deleteAccount()}>
        {delWarn() ? "⚠️ Confirmer la suppression (irréversible)" : "Supprimer mon compte"}
      </button>
    </main>
  );
}
