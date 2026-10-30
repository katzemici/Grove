# All-in-One Personal Productivity

A single web app to manage **money, habits, and tasks** — built per the Product
Backlog MVP. React + TypeScript (Vite) front end with a Supabase data layer and a
local fallback so it runs with zero configuration.

## Modules (MVP)

- **Finance** — add/edit/delete income & expenses, categories, date/category
  filters, live totals and balance (`balance = income − expense`), newest-first
  history.
- **Habits** — create/edit/delete habits, daily or specific-weekday frequency,
  mark done per day, completion history, frequency-aware **streaks**.
- **Kanban** — projects + tasks CRUD, assign tasks to projects, **To Do /
  In Progress / Done** columns with button and drag-and-drop movement, task
  details (priority, due date, description).

## Running

```bash
cd app
npm install
npm run dev      # start the dev server
npm run build    # typecheck + production build
npm test         # run the Vitest suite
npm run lint     # ESLint
```

## Accounts and profiles

The app opens on a login page (`src/pages/Login.tsx`). Users sign up with name,
email and password, then each account gets its own data, profile picture and
Overview insight picture. Click the avatar at the bottom of the sidebar to edit
the profile or sign out. A picture left unset falls back to the default cat
(`/img/cat-sea.webp` for the avatar, `/img/cat-daisies.webp` for the insight card).

- **Local mode:** accounts live in this browser (`grove:auth:users`, PBKDF2-hashed
  passwords), and each user's data lives under its own key. The first account to
  sign in inherits data created before accounts existed. This only separates
  users on one device; anyone with access to the browser can read localStorage.
- **Supabase:** re-run `supabase/schema.sql`. It adds a `profiles` table (filled
  by a signup trigger), sets every table's `user_id` default to `auth.uid()`,
  turns on Row Level Security, and creates the public `profile-images` storage
  bucket. Old rows with `user_id = null` become hidden; the schema file has a
  snippet to assign them to an account. For Google/Apple/Facebook, enable the
  providers in Supabase Auth and add your site URL to the redirect list.

Journal notes (`grove:journal:vault`) are not split per user yet.

### Connecting Supabase (real, secure accounts)

1. Create a project at supabase.com. In **Project Settings > API**, copy the
   Project URL and the **anon / publishable** key into `.env`
   (`.env` is git-ignored). Never use the `service_role` / secret key; the app
   refuses it and `npm run check:supabase` flags it.
2. In **SQL Editor**, run all of `supabase/schema.sql`.
3. In **Authentication > Sign In / Providers > Email**, keep **Confirm email**
   on and set the minimum password length to 8 or more.
4. In **Authentication > URL Configuration**, set the Site URL (e.g.
   `http://localhost:5173` for dev, your real domain later) and add it to
   Redirect URLs. Confirmation and reset emails link back there.
5. Run `npm run check:supabase`, then restart `npm run dev`.

Passwords are hashed and stored by Supabase Auth, never in your tables.
Row Level Security means each signed-in user can read and change only their
own rows and pictures, even though the anon key is public.

## Persistence

All data access goes through a **single data-access layer** (`src/lib/db.ts`).
Feature modules never call Supabase directly, so authentication and per-user
filtering can be added in exactly one place later.

- **No credentials?** The app uses a local adapter (`localStorage`) and works
  end-to-end. Data survives refresh.
- **With Supabase?** Copy `.env.example` to `.env`, set `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`, and apply `supabase/schema.sql` in the Supabase SQL
  editor. The app switches to the cloud adapter automatically — no code changes.

Every table has a **nullable `user_id`** from day one. In MVP it stays `null`
(single implicit user). When auth is added, populate `user_id` and enable Row
Level Security — no schema restructuring.

## Project structure

```
app/
├─ src/
│  ├─ lib/           # types, data-access layer, adapters, business logic
│  │  ├─ db.ts            # the single data-access entry point
│  │  ├─ adapter.ts       # StorageAdapter contract
│  │  ├─ localAdapter.ts  # localStorage fallback
│  │  ├─ supabaseAdapter.ts
│  │  ├─ finance.ts       # balance/totals logic (tested)
│  │  ├─ streak.ts        # habit streak logic (tested)
│  │  └─ date.ts
│  ├─ components/    # Modal, ConfirmDialog, loading/empty/error states
│  ├─ pages/         # Dashboard, Finance, Habits, Kanban
│  └─ test/          # Vitest: finance, streak, CRUD integration
└─ supabase/schema.sql
```

## Design

The UI follows Apple's Human Interface Guidelines design principles —
simplicity (clear hierarchy, generous whitespace), familiarity (system font
stack, standard controls, segmented toggles), craft (consistent 8pt spacing
scale, smooth transitions), flexibility (responsive layout, automatic
light/dark mode), and forgiveness (confirm dialogs, escapable modals).

## Tests

`npm test` runs 26 tests: balance/totals logic, frequency-aware streak logic
(daily and weekly, with gaps and edges), and CRUD integration for every entity
including persistence-across-reload.
