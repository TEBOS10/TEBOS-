import { SetPassword } from "../components/SetPassword";
import { TwoStepSettings } from "../components/TwoStep";
import { Card, PageHeader } from "../components/ui";
import { usePeople } from "../lib/people";
import { useOrg } from "../lib/session";

/** issuer: the name the person's authenticator app shows for this app's codes */
export function AccountPage({ issuer }: { issuer?: string } = {}) {
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
        <Card title="Two-step sign-in" subtitle="A code from an authenticator app, on top of your password. A stolen password alone then opens nothing.">
          <TwoStepSettings active={org.twoStep} issuer={issuer} />
        </Card>
      </div>
    </div>
  );
}
