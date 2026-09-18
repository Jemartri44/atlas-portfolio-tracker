import { systemClock } from "@atlas/adapters/clock";
import { todayInMadrid } from "@atlas/domain";
import { render } from "solid-js/web";

const App = () => <main>Atlas · {todayInMadrid(systemClock)}</main>;

const root = document.querySelector("#app");
if (root !== null) {
  render(() => <App />, root);
}
