import { SetPassword } from "../components/SetPassword";
import { Card, PageHeader } from "../components/ui";
import { usePeople } from "../lib/people";
import { useOrg } from "../lib/session";

export function AccountPage() {
  const org = useOrg();
  const { me } = usePeople();
  return (
    <div className="stack">
      <PageHeader eyebrow="You" title="Your account">
        Signed in as <span className="mono">{org.session.user.email}</span>
        {me?.display_name ? ` (${me.display_name})` : ""}.
      </PageHeader>
      <div className="grid grid-2">
        <Card title="Change password" subtitle="Takes effect immediately. Other devices stay signed in until their session ends.">
          <SetPassword />
        </Card>
      </div>
    </div>
  );
}
