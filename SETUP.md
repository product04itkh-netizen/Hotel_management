# OnlyOne Homestay — Management System Setup Guide

## Stack
- **Framework**: Next.js 14 (App Router + TypeScript)
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **Notifications**: Telegram Bot API
- **Branches**: OnlyOne Homestay (Kampot) · OnlyOne Homestay (Srae Ambel)

---

## 1. Install dependencies

```bash
npm install
```

---

## 2. Set up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the **SQL Editor**, run the migration file:
   ```
   supabase/migrations/001_initial.sql
   supabase/migrations/002_add_branches.sql
   ```
   This creates all tables, RLS policies, indexes, seeds rooms + staff,
   and creates the **two branch records** (Kampot & Srae Ambel).

3. In **Authentication > Providers**, make sure **Email** is enabled
4. Create your admin user in **Authentication > Users** (Add User)

---

## 3. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in your values:

```bash
cp .env.local.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
```

Get your Supabase URL and Anon Key from:
**Project Settings → API → Project URL & Project API Keys**

---

## 4. Set up Telegram Notifications (optional)

1. Open Telegram, search for **@BotFather**
2. Send `/newbot` and follow prompts to create a bot
3. Copy the **bot token**
4. Add the bot to your hotel's Telegram channel/group
5. Get the **chat ID** using [@userinfobot](https://t.me/userinfobot) or the Telegram API
6. In the app: go to **Settings → Telegram Notifications** and enter the token + chat ID
7. Click **Send Test Notification** to verify

---

## 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with your Supabase user.

---

## Modules

| Module | Path | Description |
|---|---|---|
| Dashboard | `/dashboard` | KPIs, occupancy chart, recent reservations |
| Reservations | `/reservations` | Full booking management with CRUD |
| Front Desk | `/front-desk` | Check-in / check-out + walk-in |
| Room Management | `/rooms` | Visual floor grid, room CRUD |
| Housekeeping | `/housekeeping` | Task assignment and tracking |
| Billing | `/billing` | Invoices and payment recording |
| Reports | `/reports` | Revenue charts, KPIs, analytics |
| Staff | `/staff` | Staff directory and role management |
| Settings | `/settings` | Property config + Telegram setup |

---

## Multi-Branch Architecture

All core data tables carry a `branch_id` foreign key that links every record to a specific branch.

| Table | Branch Isolation |
|---|---|
| `branches` | Master list of branches (Kampot, Srae Ambel) |
| `rooms` | Each room belongs to one branch |
| `staff` | Each staff member is assigned to one branch |
| `reservations` | Each booking is scoped to one branch |
| `invoices` | Invoices inherit the branch of their reservation |
| `housekeeping_tasks` | Tasks are branch-scoped |
| `hotel_settings` | One settings row per branch (name, Telegram, timings) |

> **Never mix data across branches.** Always filter queries by `branch_id` when displaying branch-specific views.

---

## Telegram Notification Events

| Event | Trigger |
|---|---|
| `new_reservation` | When a reservation is created |
| `checkin` | When a guest checks in |
| `checkout` | When a guest checks out |
| `payment` | When an invoice is fully paid |
| `housekeeping_complete` | When a cleaning task is completed |
| `room_maintenance` | When a room is flagged for maintenance |
| `cancellation` | When a reservation is cancelled |

---

## Deploy to Vercel

```bash
npm run build  # verify no errors
```

Then push to GitHub and connect to Vercel. Add your environment variables in the Vercel dashboard.
