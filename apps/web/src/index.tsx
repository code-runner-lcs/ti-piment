/* @refresh reload */
import { Route, Router } from "@solidjs/router";
import { render } from "solid-js/web";
import App from "./App";
import { Discover } from "./pages/Discover";
import { Login } from "./pages/Login";
import { Register } from "./pages/Register";
import { VerifyEmail } from "./pages/VerifyEmail";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";
import { Profile } from "./pages/Profile";
import { Matches } from "./pages/Matches";
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
      <Route path="/me/matches" component={Matches} />
      <Route path="/" component={Discover} />
    </Router>
  ),
  document.getElementById("root")!,
);
