/* @refresh reload */
import { Route, Router } from "@solidjs/router";
import { render } from "solid-js/web";
import App from "./App";
import { Home } from "./pages/Home";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { VerifyEmail } from "./pages/VerifyEmail";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Profile } from "./pages/Profile";
import "./app.css";

render(
  () => (
    <Router root={App}>
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/me/profil" component={Profile} />
      <Route path="/" component={Home} />
    </Router>
  ),
  document.getElementById("root")!,
);
