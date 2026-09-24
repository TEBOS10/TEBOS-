import { PageHeader } from "../components/ui";
import { Link } from "../lib/router";

export function NotFound() {
  return (
    <PageHeader title="Not found">
      <span>
        There's nothing at this address, or you don't have access to it. <Link to="/">Go home</Link>.
      </span>
    </PageHeader>
  );
}
