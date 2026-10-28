import type { ParentComponent } from "solid-js";

/** Layout racine : le children du Router root = arbre de routes résolu */
const App: ParentComponent = (props) => (
  <div class="appshell">{props.children}</div>
);

export default App;
