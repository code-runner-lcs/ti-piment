import { A, useNavigate } from "@solidjs/router";
import { onMount, Show, type ParentComponent } from "solid-js";
import { api } from "./api/client";
import { clearSession, session, setSession } from "./store/session";

/** Bootstrap : une session cookie peut exister au démarrage -> refresh silencieux. */
let bootstrapped = false;
const bootstrap = (): void => {
  if (bootstrapped || session()) return;
  bootstrapped = true;
  api
    .refresh()
    .then(({ accessToken, user }) => setSession({ accessToken, user }))
    .catch(() => undefined);
};

const App: ParentComponent = (props) => {
  onMount(bootstrap);
  const navigate = useNavigate();

  const logout = async (): Promise<void> => {
    await api.logout().catch(() => undefined);
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <div class="appshell">
      <header class="topbar">
        <A href="/">TiPiment</A>
        <Show
          when={session()}
          fallback={
            <nav>
              <A href="/login">Connexion</A>
              <A href="/register">Inscription</A>
            </nav>
          }
        >
          <nav>
            <A href="/me/profil">Mon profil</A>
            <button type="button" class="link" onClick={() => void logout()}>
              Déconnexion
            </button>
          </nav>
        </Show>
      </header>
      {props.children}
    </div>
  );
};

export default App;
