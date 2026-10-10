-- A marketing department: its own staff role and its own playbook.
--
-- The first department beyond sales and maintainers (ROADMAP, "TEBOS on its
-- own board", item 4). The rules:
--
--   * A platform admin invites marketing staff exactly like sales staff. A
--     marketer is staff, never a member of a client's organisation.
--   * Least privilege: marketing drafts content (content_drafts) and reads its
--     own playbook. It does not see the pipeline, leads, clients, billing or
--     the sales playbook. Every existing policy keeps naming its own roles, so
--     the new role gains nothing it isn't given here.
--   * Each playbook section belongs to one department. Sales sections are read
--     by sales and maintainers, as before; marketing sections by marketing,
--     sales and maintainers, who also draft content. Platform admins edit
--     both.

-- ---------------------------------------------------------------------------
-- The role
-- ---------------------------------------------------------------------------
alter table public.platform_staff drop constraint platform_staff_role_check;
alter table public.platform_staff add constraint platform_staff_role_check
  check (role in ('sales', 'maintainer', 'marketing'));
alter table public.staff_invitations drop constraint staff_invitations_role_check;
alter table public.staff_invitations add constraint staff_invitations_role_check
  check (role in ('sales', 'maintainer', 'marketing'));

-- Marketing staff see their colleagues' names, like every other staff member.
create or replace function public.staff_directory()
returns table (user_id uuid, display_name text, email text, roles text[])
language sql stable security definer set search_path = '' as $$
  with people as (
    select a.user_id, 'admin'::text as role from public.platform_admins a
    union all
    select s.user_id, s.role from public.platform_staff s
  )
  select p.user_id, coalesce(pr.display_name, split_part(u.email, '@', 1)), lower(u.email), array_agg(distinct p.role order by p.role)
    from people p join auth.users u on u.id = p.user_id left join public.profiles pr on pr.user_id = p.user_id
   where tebos_private.is_staff(array['sales', 'maintainer', 'marketing'])
   group by p.user_id, pr.display_name, u.email
$$;

-- Marketing drafts content; the approval rules on content_drafts are unchanged.
drop policy staff_read on public.content_drafts;
drop policy staff_write on public.content_drafts;
drop policy staff_update on public.content_drafts;
create policy staff_read on public.content_drafts for select to authenticated
  using (tebos_private.is_staff(array['sales', 'maintainer', 'marketing']));
create policy staff_write on public.content_drafts for insert to authenticated
  with check (tebos_private.is_staff(array['sales', 'maintainer', 'marketing']));
create policy staff_update on public.content_drafts for update to authenticated
  using (tebos_private.is_platform_admin() or (tebos_private.is_staff(array['sales', 'maintainer', 'marketing']) and author_id = auth.uid()))
  with check (tebos_private.is_platform_admin() or (tebos_private.is_staff(array['sales', 'maintainer', 'marketing']) and author_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Department playbooks
-- ---------------------------------------------------------------------------
alter table public.sales_playbook
  add column department text not null default 'sales' check (department in ('sales', 'marketing'));
alter table public.sales_playbook drop constraint sales_playbook_key_key;
alter table public.sales_playbook add constraint sales_playbook_department_key_key unique (department, key);

drop policy staff_read on public.sales_playbook;
create policy staff_read on public.sales_playbook for select to authenticated
  using ((department = 'sales' and tebos_private.is_staff(array['sales', 'maintainer']))
      or (department = 'marketing' and tebos_private.is_staff(array['sales', 'maintainer', 'marketing'])));

-- The first edition of the marketing playbook. No prices: marketing points to
-- the pricing page, so nothing published can quote a different price.
insert into public.sales_playbook (department, key, position, title, body) values
  ('marketing', 'voice', 10, 'What we say, and how', $pb$**TEBOS is business operating architecture for growing businesses.** We map how a business really runs, show the owner where it still runs through them, and build and run the structure so it doesn't.

## The voice

- Plain, confident, specific. Short sentences.
- Show how TEBOS works (the board, a flow, a rule, an objective measured on real numbers). Don't describe it with adjectives.
- No hype words: "revolutionary", "10x", "game-changing", "AI-powered".

## What TEBOS is not

- Not an AI agency. AI and automation are tools inside the architecture, used only where they earn their place.
- Not another platform that replaces a business's tools. We connect to what it already uses.$pb$),
  ('marketing', 'claims', 20, 'What we never publish', $pb$These protect the brand, and the database can't check them for you: the approver does.

- **Nothing invented.** No made-up clients, testimonials, results, numbers or case studies. Until a client agrees in writing to a published result, say what TEBOS does, not what it achieved.
- **No client names** without the client's written permission, kept with the draft's review note.
- **AI-made pictures and video are labelled.** Never present a generated person, office or client as real.
- **No supplier or provider names** for the technology behind TEBOS.
- **Nothing internal:** not the pipeline, this playbook, the sales playbook, client boards, screenshots of real accounts, or how a diagnostic is done. Show the public demo (a fictional agency), the tour, the film and the home-page board.
- **No prices** except a link to the pricing page. No discounts or offers: those are not marketing's to make.$pb$),
  ('marketing', 'approval', 30, 'From draft to published', $pb$Everything goes through the Marketing page. Nothing goes out unapproved, and TEBOS never publishes anything itself.

1. **Draft** on the Marketing page: pick the channel, write the text. Edit it as often as you like.
2. **Send for approval.** The text is now frozen. To change it, pull it back to a draft: it then needs approval again.
3. **A platform admin approves it, or sends it back** with a note saying why. Fix it and send it again.
4. **Publish it yourself** on the channel, exactly as approved.
5. **Record where it went live:** paste the https address on the Marketing page. Only an approved draft can be recorded as published.

If you see something published that wasn't approved, tell a platform admin the same day.$pb$),
  ('marketing', 'channels', 40, 'Channels', $pb$- **The founder's LinkedIn profile:** the main channel. Posts in the founder's own voice, approved by the founder.
- **The TEBOS LinkedIn page, Instagram, Facebook, X, TikTok:** short posts that point to the film, the tour, the demo or a blog article. The social pack in the repository has the profiles and the first 30 days.
- **Blog articles:** on the TEBOS site. One idea each, with an example from the public demo.
- **Press releases:** only for real events (an opening, a launch, a partnership the partner has approved in writing).
- **Newsletters:** only to people who asked for them, with an unsubscribe link in every issue (POPIA). Never to a bought or scraped list.$pb$),
  ('marketing', 'enquiries', 50, 'When someone gets in touch', $pb$Marketing starts conversations; sales has them.

- **Prospects:** thank them and send them to the website's enquiry form or the free self-check. Sales picks it up from there.
- **"How do you do it?" from other agencies, consultancies or builders:** answer only with what's on the public site. They may be researching TEBOS. Nothing of value is given before a client pays, including the diagnostic.
- **Journalists:** take their name, outlet, deadline and questions, and pass them to a platform admin. Don't give quotes yourself.
- **Complaints or anything legal:** don't reply publicly; pass it to a platform admin.$pb$);
