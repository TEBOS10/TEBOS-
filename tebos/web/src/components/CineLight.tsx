// The slow-moving light and film grain behind a page's opening (cinematic.css). Decorative only.
export function CineLight() {
  return (
    <>
      <div className="cine-light" aria-hidden><span /><span /><span /></div>
      <div className="cine-grain" aria-hidden />
    </>
  );
}
