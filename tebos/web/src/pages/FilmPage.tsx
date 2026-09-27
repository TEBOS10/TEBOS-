// The explainer film on its own, full frame: the source the home page's video
// is recorded from (scripts/record-film.mjs).
import { Film } from "../components/Film";

export function FilmPage() {
  return (
    <div style={{ background: "#000", minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <Film />
    </div>
  );
}
