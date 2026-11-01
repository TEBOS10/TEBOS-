# TEBOS starter website: service business

A plain static website (HTML, CSS and about 3 KB of JavaScript, with no libraries, trackers or third-party fonts). It's
built from one config file and follows `docs/web-delivery/DESIGN_BRIEF.md`:
- one hero idea, with the client's photograph or TEBOS-made light-and-grid art in their accent;
- the client's process told as a scroll story;
- one display face and one accent;
- the call to action always in reach.

## Build it

```sh
cd tebos
npm run site:build -- templates/service-site/sample.json /tmp/sample-site            # a preview, stamped and not indexed
npm run site:build -- path/to/client/site.json path/to/out --release                 # once the client has approved
```

Images are listed in the config by path and copied from the config's folder. They must be the client's own,
licensed, or made for the client, and recorded in the project's asset register.

## What it refuses (`checkSite` in `src/domain/site-template.ts`)

**Any build:**
- missing business name, area, headline, promise, first action, services, or search description;
- an accent colour that can't carry readable button text (under 4.5:1) or doesn't stand out from the page (under 3:1);
- images without descriptions, or hosted elsewhere;
- a first action with nothing behind it (a form with no receiving address, a call with no phone number);
- a form without a consent line;
- a site that collects details but has no privacy notice;
- a testimonial without the person's permission.

**A release build, additionally:** anything the client hasn't approved, meaning the copy and the privacy notice.

## Starting from a client's brief

`draftSiteFromBrief(answers, area)` uses only what the client's submitted brief says. `checkSite` then lists what's
still needed, which becomes the project's content tasks.

## The enquiry form

It posts JSON (`name`, `contact`, `message`, `consent`, `page`) to the configured `https://` address. It shows "Sent"
only when that address answers with success. On failure it keeps the visitor's message and says so. It can't send
twice while sending, and gives up after 10 seconds.

**The receiving address is the client's own** (a form service on their account, or their own back end). Choosing one
is part of the project's integrations. With no address, use `call`, `whatsapp` or `email` as the first action: then
the site has no form.

## Hosting

Any static host serves the output. Use a host whose plan allows commercial use, on the client's own account
(`docs/web-delivery/TOOLCHAIN.md` §3).
