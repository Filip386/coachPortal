# CVF Villarreal Masters — Coach Portal

A mobile-first web app built as a **Microsoft Power Apps Code App**. Coaches use it to manage squad attendance, track player performance, schedule events, and monitor overdue invoices — all connected live to Microsoft Dataverse.

---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Screens & Features](#screens--features)
5. [Data Layer](#data-layer)
6. [Navigation](#navigation)
7. [Getting Started](#getting-started)
8. [Generated Code](#generated-code)
9. [Design System](#design-system)
10. [Deployment](#deployment)
11. [Key Concepts for New Developers](#key-concepts-for-new-developers)

---

## What It Does

The app gives a coach a single interface to:

- See today's session and upcoming events on a dashboard
- Mark attendance (present / late / absent) for each player per event
- Rate player performance across four attributes: **Technique, Effort, Tactical, Teamplay**
- Browse the squad filtered by position or generation (birth year cohort)
- Create new training sessions and matches with automatic title generation
- View all overdue invoices grouped by billed contact (currency: MKD)

The backend is **Microsoft Dataverse**. Every read and write goes through auto-generated service classes that wrap the Power Apps SDK connector.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | React + TypeScript | 19.2.0 / 5.9.3 |
| Bundler | Vite | 7.2.4 |
| Power Apps integration | `@microsoft/power-apps` | 1.2.2 |
| Icons | Lucide React | 1.17.0 |
| Testing | Playwright | 1.60.0 |
| Linting | ESLint 9 + typescript-eslint | 9.39.1 |

Styling is entirely **inline CSS-in-JS** (no CSS framework). Fonts (Bricolage Grotesque, JetBrains Mono) are loaded from Google Fonts.

---

## Project Structure

```
src/
├── App.tsx                  # Root component — routing, phone frame, auth
├── main.tsx                 # React entry point
├── index.css                # Global resets & animations
│
├── screens/                 # One file per screen
│   ├── HomeScreen.tsx
│   ├── CalendarScreen.tsx
│   ├── AttendanceScreen.tsx
│   ├── PlayersScreen.tsx
│   ├── InvoicesScreen.tsx
│   ├── PerformanceScreen.tsx
│   ├── CreateEventScreen.tsx
│   └── index.ts             # Barrel export
│
├── components/
│   ├── shared/              # Reusable layout pieces
│   │   ├── ActionTile.tsx
│   │   ├── BottomNav.tsx
│   │   ├── ErrorBanner.tsx
│   │   ├── LoadingSpinner.tsx
│   │   ├── ScreenHeader.tsx
│   │   ├── SectionTitle.tsx
│   │   └── StatusBar.tsx
│   └── ui/
│       └── index.tsx        # Form widgets (inputs, selects, etc.)
│
├── context/
│   ├── DataContext.tsx      # Global data state + all Dataverse calls
│   └── PhoneFrameContext.ts # Portal target for modals on desktop
│
├── generated/               # AUTO-GENERATED — do not edit by hand
│   ├── models/              # TypeScript interfaces for every Dataverse entity
│   └── services/            # CRUD service classes for every entity
│
├── utils/
│   ├── dataverse.ts         # Fetch helpers, OData formatting, lookup resolution
│   └── invoiceStatus.ts     # Overdue determination logic
│
├── constants/
│   └── design.ts            # Color tokens and font stacks
│
└── types/
    └── navigation.ts        # ScreenId union type
```

---

## Screens & Features

### Home
Dashboard that loads first. Shows today's event card, total active players, overdue invoice count, and quick-action tiles. Fetches players and events as the first priority on boot.

### Calendar
Monthly calendar grid. Tap a date to see its events. From an event, navigate directly to Attendance for that session.

### Attendance
Lists all players for a selected event. Each row has a **Present / Late / Absent** toggle. After marking attendance the coach can also rate four performance dimensions (1–5 stars) per player. Writes to `axm365_eventattendances` and `axm365_playereventperformances` in Dataverse.

### Players
Full squad list with live search and filters for **position** and **generation**. Average star rating shown per player. Tap a player to jump to their Performance screen.

### Performance
Per-player performance history. Displays an overall average rating and a breakdown bar for each attribute. Supports a generation/player selector to quickly switch between athletes.

### Create Event
Form to schedule a new event. Choose event type (Training, Tournament, League Match, Friendly Match), date, time, and facility. The title is generated automatically from the type and date. Writes to `axm365_events`.

### Invoices
Shows only **overdue** invoices, grouped by the billed contact. Displays individual amounts and a contact-level total in MKD.

---

## Data Layer

All state lives in `DataContext` (`src/context/DataContext.tsx`). Access it anywhere with the `useData()` hook.

### Boot sequence

1. Power Apps SDK resolves the logged-in user via `getContext()`.
2. The user's name is matched against coach records in Dataverse to identify the active coach.
3. **Priority fetch** (home screen needs these immediately): players, events, invoices.
4. **Background fetch** (deferred): attendances, performances, facilities, generations, generation-to-coach links.

### Caching

Data is persisted to `localStorage` with keys prefixed `cvf_` (e.g., `cvf_players`, `cvf_events`). Stale data is shown immediately on next launch while a fresh fetch runs in the background.

### Refresh

Each entity has its own refresh function (`refreshPlayers()`, `refreshEvents()`, …). `refreshAll()` triggers a full sync.

### Dataverse entities

| Logical name | Purpose |
|---|---|
| `cr9be_players` | Squad members |
| `axm365_events` | Training sessions and matches |
| `axm365_eventattendances` | Per-player attendance per event |
| `axm365_playereventperformances` | Performance ratings per event |
| `cr9be_coachs` | Coach profiles |
| `axm365_generations` | Birth-year cohorts |
| `axm365_generationstocoacheses` | Junction: which generations a coach manages |
| `equipments` | Facilities / locations |
| `invoices` | Billing records |

### OData notes

- Active records are filtered with `statecode eq 0`.
- Display names for lookups are resolved via OData formatted-value annotations (`@OData.Community.Display.V1.FormattedValue`).
- The helper `lookupName()` in `src/utils/dataverse.ts` handles this resolution.
- Pagination uses `skipToken` for large result sets.

---

## Navigation

Routing is handled entirely in `App.tsx` with a `currentScreen` state variable. There is no React Router.

```typescript
// src/types/navigation.ts
type ScreenId = "home" | "calendar" | "attendance" | "players" | "invoices" | "performance" | "create"
```

The `go(screenId, playerId?, eventId?)` callback is passed down as a prop. The **BottomNav** component drives the five primary tabs. Screens can also navigate programmatically (e.g., Calendar → Attendance with a pre-selected event ID).

---

## Getting Started

### Prerequisites

- Node.js (LTS)
- A Microsoft Power Apps / Dataverse environment (see `power.config.json`)
- Power Apps CLI (`pac`) installed if you need to regenerate models or deploy

### Install and run

```bash
npm install
npm run dev        # Starts at http://localhost:5173 with HMR
```

### Other scripts

```bash
npm run build      # TypeScript compile + Vite bundle → ./dist
npm run preview    # Serve the production build locally
npm run lint       # ESLint (strict — no unused vars/params)
```

### Environment / config

There is no `.env` file. The Dataverse org URL is hardcoded in `src/utils/dataverse.ts`:

```typescript
const ORG_URL = "https://org2560bf82.crm4.dynamics.com/";
```

Update this string if you point to a different Dataverse environment.

The Power Apps app identity is defined in `power.config.json`:

```json
{
  "appId": "c28a1c92-dccd-4e98-ae5b-4a1240e63482",
  "environmentId": "79bc9a05-e24f-e624-a029-e2725aa5864f",
  "region": "prod",
  "buildPath": "./dist"
}
```

---

## Generated Code

**Everything inside `src/generated/` is auto-generated from Dataverse metadata. Do not edit these files manually — changes will be overwritten.**

Regenerate after a schema change with the Power Apps CLI:

```bash
pac modelgen --outputDirectory ./src/generated
```

The generated `*Service.ts` files expose typed CRUD methods. The generated `*Model.ts` files are the TypeScript interfaces for each entity.

---

## Design System

Tokens live in `src/constants/design.ts`. The color palette and font stacks defined there are used directly in inline styles throughout the app. If you change a color or font, update it there first so all screens stay consistent.

**Fonts loaded via Google Fonts (`index.html`):**
- `Bricolage Grotesque` — headings and UI labels
- `JetBrains Mono` — monospaced data values (stats, numbers)

**Icons:** All from `lucide-react`. No other icon library is used. If you add an icon, import it from there.

---

## Deployment

The app is deployed as a **Power Apps Code App**.

```bash
npm run build          # Produces ./dist
pac code push          # Uploads ./dist to the configured Power Apps environment
```

The Power Apps runtime injects the authenticated user context, which is how the app identifies the coach without a separate login screen.

---

## Key Concepts for New Developers

**Phone frame on desktop.**
On non-mobile viewports the app renders inside an iPhone-style frame (390×844 px). This is purely cosmetic — it simulates how the app looks on a real device. A toggle button in the top-right corner switches to full-screen mode. The frame is implemented entirely in `App.tsx`.

**Star rating encoding.**
Dataverse stores performance ratings as integer option-set codes (`693080000` through `693080004`), not 1–5 integers. The mapping from code → star count → display percentage is centralised in `DataContext`. Do not replicate the mapping elsewhere.

**Generation / cohort filtering.**
A coach is linked to generations via two sources: the player's own generation lookup field, and the `axm365_generationstocoacheses` junction table. `DataContext` merges both and filters by the active coach ID so coaches only see their own players.

**Multi-tenant safety.**
All Dataverse queries filter by the coach's ID where relevant. Never remove these filters or coaches will see each other's data.

**LocalStorage cache keys.**
If you add a new entity, add a corresponding cache key prefixed with `cvf_` and hook it into the `DataProvider` boot sequence. Decide whether the home screen needs it immediately (priority) or can tolerate a short delay (deferred).

**No routing library.**
Screen transitions are a simple `useState` call in `App.tsx`. If the app grows to need deep-linking or browser history support, the natural upgrade path is React Router v7 or TanStack Router.

**Event type icons.**
The mapping of event type → icon is in `HomeScreen.tsx` and `CalendarScreen.tsx`. If you add a new event type to the Dataverse option set, add the corresponding icon case there too.
