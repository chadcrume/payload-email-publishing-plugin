# User Guide: Composing & Publishing an Email

This guide is for content editors using the Payload admin UI to write and send a
newsletter-style email. It assumes the plugin is already installed and configured
(see the [README](../README.md)) — everything below happens under the **Email
Publishing** group in the admin sidebar.

## Overview

An email is assembled from reusable content blocks:

```
Posts (content)  →  Email (subject + ordered Posts)  →  Scheduler Item (when/status)
```

1. Write one or more **Posts** — the actual paragraphs/sections of content.
2. Create an **Email**, give it a subject, and pick which Posts go into it (and in
   what order).
3. Link the Email to a **Scheduler Item** to control when it sends, or send it
   immediately.
4. Watch delivery/open/click stats roll in on the Email itself once it's sent.

## 1. Write your content as Posts

Go to **Email Publishing → Posts → Create New**.

- **Title** — internal only; it's never shown to recipients. It's just how you'll
  find this Post again later.
- **Content** — rich text. This is what recipients actually see.

Posts are reusable: the same Post (e.g. a standard footer, a recurring "upcoming
events" block) can be included in multiple Emails. Posts also support drafts —
save a draft while you're still writing, and it won't render into an Email until
you're happy with it (an Email always uses the current content of whatever Posts
it references).

**Tip:** an admin can configure a **default footer Post** under **Email
Publishing Settings** that's automatically added to every new Email's Post list.
It's just a starting default — remove or swap it on any individual Email.

## 2. Assemble an Email

Go to **Email Publishing → Emails → Create New**.

- **Subject** — the email's subject line.
- **Posts** — add one or more Posts. This field is drag-to-reorder: the order
  they're listed in is the order they render in the email body, top to bottom.
- **Preview** — a live HTML preview of the assembled email, updating shortly
  after you change the Posts list. Use it to check ordering, spacing, and that
  everything renders the way you expect before scheduling anything.

An Email needs at least one Post before it can be saved.

## 3. Schedule or send it

Emails don't send on their own — a **Scheduler Item** controls when and whether
an Email goes out.

1. Go to **Email Publishing → Scheduler Items → Create New**.
2. Give it an optional **Label** (e.g. "August Newsletter") to make it easy to
   find later.
3. Set **Status** to `scheduled` and pick a **Send at** date/time (shown in your
   local time; stored in UTC). `sendAt` is required once the status is
   `scheduled`, `queued`, or `sending`.
4. Go back to your Email and set its **Scheduler Item** field (in the sidebar) to
   the one you just created.

Once linked, the Email's sidebar shows a **Scheduler Item Settings** summary
(status, send time, recipient count, sent time) so you can confirm everything
without leaving the Email.

### What happens at send time

- A recurring background job checks for Scheduler Items whose `sendAt` has
  arrived (or is coming up within the configured hand-off window) and hands them
  off to Resend.
- Recipients are resolved by the app you're running this plugin in — the plugin
  itself doesn't manage a subscriber list.
- The Scheduler Item's status moves through `scheduled → queued → sending →
  sent` (or `failed` if something went wrong — check the **Last Error** field,
  which appears automatically when status is `failed`).
- `recipientCount` fills in automatically once recipients are resolved.

If you need a campaign to go out sooner than the next scheduled sweep, ask
whoever manages your deployment to hit the manual trigger endpoint
(`/api/email-publishing/trigger-sweep`) — see the README's Endpoints table.

### Canceling or rescheduling

- To cancel before it sends, set the Scheduler Item's status to `canceled` (do
  this before it reaches `queued` — once a sweep has picked it up, it's already
  been handed to Resend).
- To reschedule, just change `sendAt` while status is still `scheduled`.

## 4. Track delivery, opens, and clicks

Once an Email has been sent, its sidebar **Stats** panel shows aggregated counts
by status (sent, delivered, opened, clicked, bounced, etc.), sourced from Resend
webhook events. For a per-recipient breakdown, an admin can look at the
read-only **Email Sends** log (Email Publishing → Email Sends), which has one
row per recipient per send.

## Quick reference

| Step | Where | What you set |
| --- | --- | --- |
| Write content | Posts | Title (internal), rich text Content |
| Assemble | Emails | Subject, ordered Posts list, review Preview |
| Schedule | Scheduler Items | Label, Status = `scheduled`, Send at |
| Link | Emails (sidebar) | Scheduler Item |
| Track | Emails (sidebar) → Stats | Read-only, fills in after sending |
