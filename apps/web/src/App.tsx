// Router and shell. Twelve routes, all readable and navigable
// (`specs/006-web-shell/contracts/routes.md`), each screen lazily loaded so the
// first paint only carries what the summary needs.

import { Route, Router } from "@solidjs/router";
import { lazy } from "solid-js";
import { AppShell } from "./shell/AppShell.jsx";

const Resumen = lazy(() => import("./routes/resumen/index.jsx"));
const Movimientos = lazy(() => import("./routes/movimientos/index.jsx"));
const MovimientoDetalle = lazy(() => import("./routes/movimientos/detail.jsx"));
const MovimientoEditar = lazy(() => import("./routes/movimientos/edit.jsx"));
const Registrar = lazy(() => import("./routes/registrar/index.jsx"));
const RegistrarForm = lazy(() => import("./routes/registrar/form.jsx"));
const Cubo = lazy(() => import("./routes/cubo/index.jsx"));
const Nucleo = lazy(() => import("./routes/nucleo/index.jsx"));
const Ajustes = lazy(() => import("./routes/ajustes/index.jsx"));
const Configuracion = lazy(() => import("./routes/ajustes/configuracion.jsx"));
const Verificacion = lazy(() => import("./routes/ajustes/verificacion.jsx"));
const Libro = lazy(() => import("./routes/libro/index.jsx"));
const NoExiste = lazy(() => import("./routes/no-existe.jsx"));

export const App = () => (
  <Router root={AppShell}>
    <Route path="/" component={Resumen} />
    <Route path="/movimientos" component={Movimientos} />
    <Route path="/movimientos/:id" component={MovimientoDetalle} />
    <Route path="/movimientos/:id/editar" component={MovimientoEditar} />
    <Route path="/registrar" component={Registrar} />
    <Route path="/registrar/:tipo" component={RegistrarForm} />
    <Route path="/nucleo" component={Nucleo} />
    <Route path="/cubo" component={Cubo} />
    <Route path="/ajustes" component={Ajustes} />
    <Route path="/ajustes/configuracion" component={Configuracion} />
    <Route path="/ajustes/verificacion" component={Verificacion} />
    <Route path="/libro" component={Libro} />
    <Route path="*" component={NoExiste} />
  </Router>
);
