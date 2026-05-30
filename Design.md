# Sealio — Design Document

> **Visual Reference:** Twingate.com screenshot provided by user. Dark-first (#09090B canvas), bold editorial typography, vivid product card glows, pastel testimonial floaters, minimal dark nav. Adapted with Sealio's teal accent (#6EE7B7) and e-signature context.

---

## 1. Design Philosophy

**4 Core Design Principles:**

1. **Clarity over cleverness** — Every UI element must be understood in 2 seconds. If it requires explanation, it needs redesign.
2. **Mobile-first, always** — Every screen is designed at 375px width first, then expanded. No "responsive" shrinking of desktop UIs.
3. **Fast paths for common actions** — Sending a document for signature should take under 90 seconds. Signing should take under 60 seconds.
4. **Trust through transparency** — Every action the platform takes must be visible. Audit trails, compliance status, and pricing are never hidden.

**Visual Language:**
- **Tone:** Professional but approachable. Trustworthy without being bureaucratic. Modern without being trendy.
- **Inspiration:** Twingate (dark-first enterprise SaaS), Linear (developer-grade clarity), Stripe (trust + DX obsession)
- **Anti-inspiration:** DocuSign (cluttered, legacy feel), Adobe Sign (enterprise bloat)

---

## 2. Design System

### Design Mode: Dark-First

Dark is the **default** — not a toggle. The entire app and landing page are built dark-canvas-first at 375px (mobile), then expanded to desktop. Matching the Twingate reference exactly.

---

### Color Palette

```
── FOUNDATION ──────────────────────────────────────────────────
Background Base:   #09090B   (Near-black — main canvas)
Background Raised: #111113   (Cards, sidebars, panels)
Background Float:  #18181B   (Modals, dropdowns, elevated surfaces)
Border Subtle:     #27272A   (Dividers, card edges)
Border Default:    #3F3F46   (Interactive borders, inputs)

── TYPOGRAPHY ──────────────────────────────────────────────────
Text Primary:      #FAFAFA   (Near-white — headings, key content)
Text Secondary:    #A1A1AA   (Muted gray — body, descriptions)
Text Disabled:     #52525B   (Inactive labels, placeholders)

── BRAND ACCENT ────────────────────────────────────────────────
Accent:            #6EE7B7   (Mint Teal — CTAs, links, active states)
                             (Twingate uses yellow; Sealio uses teal
                              for "seal" / trust / signature feel)
Accent Hover:      #34D399   (Deeper teal on hover/active)
Accent Subtle:     #6EE7B714  (8% teal — highlight backgrounds)
Accent Text:       #6EE7B7   (Used on dark bg for key words in headlines)

── FEATURE CARD GLOWS (Twingate-style colored product cards) ───
Glow Violet:       #7C3AED   (Card 1 — document workflow)
Glow Blue:         #2563EB   (Card 2 — developer API)
Glow Green:        #16A34A   (Card 3 — compliance / audit trail)
Glow Amber:        #D97706   (Card 4 — analytics / engagement)

── STATUS COLORS ───────────────────────────────────────────────
Success:           #22C55E   (Signed, completed — green)
Warning:           #F59E0B   (Awaiting signature — amber)
Danger:            #EF4444   (Declined, error, expired — red)
Info:              #38BDF8   (In-progress, info — sky blue)

── PASTEL TESTIMONIAL CARDS (Twingate-style customer floaters) ─
Card Purple:       #EDE9FE   (Light violet — testimonial 1)
Card Yellow:       #FEF9C3   (Light yellow — testimonial 2)
Card Green:        #DCFCE7   (Light green — testimonial 3)
Text on Pastel:    #1C1C1E   (Dark text on light pastel cards)
```

---

### Typography

```
Font Family:
  Display / Headings:  Cal Sans or Geist Sans (free, editorial, modern)
                       Fallback: Inter
  Body:                Inter (clean, readable at all sizes)
  Code / Monospace:    JetBrains Mono or Geist Mono

Type Scale (rem):
  xs:   0.75    (12px) — labels, badges, helper text
  sm:   0.875   (14px) — body small, table content, captions
  base: 1.0     (16px) — body default
  lg:   1.125   (18px) — subheadings
  xl:   1.25    (20px) — section labels
  2xl:  1.5     (24px) — card headings
  3xl:  1.875   (30px) — page headings
  4xl:  2.25    (36px) — section heroes
  5xl:  3.0     (48px) — landing page hero (desktop)
  6xl:  3.75    (60px) — max hero (large screens)

Font Weights:
  regular:   400  — body text, descriptions
  medium:    500  — UI labels, nav items, table content
  semibold:  600  — card titles, subheadings, button labels
  bold:      700  — section headings
  extrabold: 800  — hero headline ("Sign. Verify. Trust.")

Letter Spacing:
  Headings:    -0.02em  (tight, editorial — matches Twingate feel)
  Body:         0em     (normal)
  All-caps labels: +0.06em  (slightly loose for badge/tag caps)

Hero Headline Pattern (Twingate-inspired):
  "Sign."    — white, extrabold, tight tracking
  "Verify."  — white, extrabold, tight tracking
  "Trust."   — #6EE7B7 teal, extrabold  ← the accent pop word
```

---

### Spacing System (8px base grid, generous whitespace)

```
4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 192  (px)

Section vertical padding (landing page): 96px–160px
  — Matches Twingate's editorial breathing room between sections

Component padding:
  Card inner:     24px
  Button:         12px 20px (sm) / 14px 24px (default) / 16px 32px (lg)
  Input:          12px 16px
  Modal:          32px
  Sidebar:        16px
```

---

### Border Radius

```
none: 0px    — dividers, full-bleed elements
sm:   4px    — small inputs, inline elements
md:   8px    — buttons, badges, tags
lg:   12px   — cards, standard modals
xl:   16px   — product screenshot frames
2xl:  24px   — floating feature cards (the colored glow cards)
3xl:  32px   — large hero cards on landing page
full: 9999px — pill badges, avatars, toggle switches
```

---

### Elevation & Glow Effects

Core to Sealio's visual identity — directly from the Twingate reference.

```
── FEATURE GLOW CARDS (landing page + feature sections) ────────

Base state:
  background: linear-gradient(135deg, #111113, #18181B)
  border: 1px solid {glow-color}33        (20% opacity border)
  box-shadow: 0 0 40px 0 {glow-color}14  (8% opacity outer glow)
  border-radius: 24px

Hover state:
  border: 1px solid {glow-color}66        (40% opacity border)
  box-shadow: 0 0 60px 0 {glow-color}33  (20% opacity glow)
  transform: translateY(-2px)
  transition: all 150ms ease

Violet card  → {glow-color}: #7C3AED
Blue card    → {glow-color}: #2563EB
Green card   → {glow-color}: #16A34A
Amber card   → {glow-color}: #D97706

── APP SURFACE ELEVATION ────────────────────────────────────────

Level 0:  #09090B — base canvas (page background)
Level 1:  #111113 — cards, sidebar panels (1dp shadow)
Level 2:  #18181B — modals, sheets, dropdowns (4dp shadow)
Level 3:  #27272A — tooltips, context menus (8dp shadow)

── PASTEL TESTIMONIAL FLOATERS (landing page only) ─────────────

background: #EDE9FE / #FEF9C3 / #DCFCE7
color: #1C1C1E
box-shadow: 0 8px 32px rgba(0,0,0,0.45)
border-radius: 16px
transform: rotate(-1deg) or rotate(1.5deg)  ← slight tilt for "floaty" feel

── ACCENT GLOW (teal — used on CTAs and key UI elements) ────────

Teal button glow:
  box-shadow: 0 0 24px 0 #6EE7B733
  On hover: 0 0 32px 0 #6EE7B755
```

---

### Navigation

```
Dark minimal sticky navbar — matches Twingate reference exactly.

Properties:
  background: rgba(9, 9, 11, 0.85) + backdrop-filter: blur(12px)
  height: 64px desktop / 56px mobile
  border-bottom: 1px solid #27272A
  position: sticky, top: 0, z-index: 50

Contents (left → right):
  [Sealio logo — white wordmark + teal "S" seal icon]
  [Nav links: Product · Pricing · Docs · Blog]   ← Text Secondary, hover → Primary
  [Sign In]  [Get Started →]                      ← teal CTA button

Logo:
  — "Sealio" wordmark in white (#FAFAFA), extrabold
  — Small wax seal icon to the left, in teal (#6EE7B7)
  — Icon: stylized "S" or stamp/seal shape

CTA Button ("Get Started"):
  background: #6EE7B7
  color: #09090B  (dark text on teal — high contrast)
  border-radius: 8px
  font-weight: 600
  padding: 10px 20px
  hover: background #34D399 + slight glow

Mobile nav:
  Hamburger → full-screen dark overlay (#09090B at 98% opacity)
  Links stacked vertically, large tap targets (48px min height)
  CTA button full-width at bottom
```

---

### Animation Tokens

```
Durations:
  instant:  80ms   — micro feedback (button press)
  fast:     120ms  — hover states, color transitions
  normal:   200ms  — card lift, modal open
  slow:     300ms  — page transitions, status color changes
  glacial:  500ms  — skeleton-to-content reveal

Easing:
  ease-out:    cubic-bezier(0, 0, 0.2, 1)   — enter animations
  ease-in:     cubic-bezier(0.4, 0, 1, 1)   — exit animations
  ease-in-out: cubic-bezier(0.4, 0, 0.2, 1) — state changes

Specific animations:
  Page transition:    opacity 0→1 + translateY(8px→0), 120ms ease-out
  Card hover lift:    translateY(0→-2px) + glow intensify, 150ms ease
  CTA shimmer:        left-to-right teal sheen sweep on hover, 400ms
  Status badge flash: background color fade (warning→success), 300ms
  Skeleton shimmer:   #27272A → #3F3F46 → #27272A, 1.5s infinite
  Signature ink draw: stroke appears with slight trail delay, 80ms
  OTP input focus:    teal border glow expands, 120ms ease-out
  Modal open:         scale(0.97→1) + opacity(0→1), 200ms ease-out
```

---

### Component Library

```
Base:  Shadcn/ui (headless, fully accessible, ARIA-compliant)
Style: Tailwind CSS v4 + CSS custom properties for design tokens
Dark:  class="dark" on <html> — dark is default, no toggle needed

Custom Components (beyond Shadcn):
  SignatureCanvas     — HTML5 canvas, variable-width Bézier strokes,
                        teal ink color, clear + undo
  DocumentViewer      — PDF.js wrapper with dark chrome, page nav,
                        zoom, field overlay canvas layer on top
  FieldOverlay        — Drag-and-drop field placement layer (sits above
                        DocumentViewer), color-coded per signer
  AuditTimeline       — Vertical timeline, colored status dots,
                        event details on expand
  StatusBadge         — Pill badge: success/warning/danger/info variants
  GlowCard            — Feature card: dark bg + colored border + glow,
                        violet/blue/green/amber variants
  PastelFloater       — Testimonial card: pastel bg, dark text,
                        slight rotation, drop shadow
  ProgressStepper     — Wizard steps: horizontal desktop / vertical mobile
                        Teal active step, muted incomplete
  OTPInput            — 6 individual character boxes, auto-advance,
                        teal focus ring, shake animation on wrong code
  SignerChip          — Avatar + name pill, color-coded (each signer
                        gets a unique color for field assignment)
  ComplianceBadge     — Shield icon + standard name (ESIGN, GDPR, SOC2)
                        Used in document footer and compliance dashboard

Icon Set: Lucide React
  — Consistent 24px stroke icons, works perfectly on dark backgrounds
  — Subset: FileText, PenTool, Users, BarChart2, Shield, Clock,
    CheckCircle, XCircle, AlertTriangle, Download, Send, Link, Key
```

---

## 3. Landing Page Visual Structure

Section-by-section breakdown following Twingate's rhythm.

```
┌─────────────────────────────────────────────────────────────────┐
│ SECTION 1 — HERO                                                │
│ Dark canvas (#09090B), centered layout, generous padding        │
│                                                                 │
│   Sign.                    ← white, extrabold, 60px            │
│   Verify.                  ← white, extrabold, 60px            │
│   Trust.                   ← teal #6EE7B7, extrabold, 60px     │
│                                                                 │
│   The e-signature platform built for developers and             │
│   teams who've outgrown DocuSign.                               │
│                       ← Text Secondary, 18px                   │
│                                                                 │
│   [Start for Free →]   [Watch Demo ▶]                          │
│    teal button          ghost button                           │
│                                                                 │
│   ↓ floating product screenshot in violet glow card             │
│     (dashboard or document editor view)                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SECTION 2 — TRUST STRIP                                         │
│ "Trusted by teams at Acme, Stripe, Linear, Notion, ..."        │
│ Company logos: muted (#52525B), on dark bg                      │
│ Scrolling marquee on mobile                                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SECTION 3 — 3 FEATURE GLOW CARDS (Twingate's core pattern)     │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ 🟣 VIOLET GLOW   │  │ 🔵 BLUE GLOW     │  │ 🟢 GREEN     │  │
│  │                  │  │                  │  │    GLOW      │  │
│  │ Documents signed │  │ Developer API.   │  │ Legally      │  │
│  │ in under         │  │ 3 lines.         │  │ defensible.  │  │
│  │ 90 seconds.      │  │ Any stack.       │  │ Always.      │  │
│  │                  │  │                  │  │              │  │
│  │ [product shot]   │  │ [code snippet]   │  │ [audit trail]│  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SECTION 4 — CTA BLOCK                                           │
│ Full-width dark section, centered                               │
│ "Powerful signing deployed in minutes."                         │
│ [Get started for free →]   ← teal button with glow             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SECTION 5 — CUSTOMER STORY FLOATERS (Twingate pastel cards)    │
│ "We've helped hundreds of teams sign faster"                    │
│                                                                 │
│  ┌────────────────────┐     ┌─────────────────────┐            │
│  │ 🟣 Light Purple    │     │ 🟡 Light Yellow      │            │
│  │                    │     │                      │            │
│  │ "Acme Corp uses    │     │ "Sealio helped us    │            │
│  │ Sealio to close    │     │ cut contract signing │            │
│  │ deals 3x faster"   │     │ time from days to    │            │
│  │          → [Read]  │     │ minutes"   → [Read]  │            │
│  └────────────────────┘     └─────────────────────┘            │
│                                                                 │
│              ┌────────────────────┐                            │
│              │ 🟢 Light Green     │                            │
│              │                    │                            │
│              │ "Our field team    │                            │
│              │ signs offline now  │                            │
│              │ — game changer"    │                            │
│              └────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SECTION 6 — SOCIAL PROOF / REVIEWS                             │
│ ★★★★★ 4.9  G2 badge  Capterra badge                           │
│ 3 dark review cards with quote + avatar + name + role          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SECTION 7 — FEATURE DEEP DIVES (alternating, like Twingate)    │
│                                                                 │
│  Feature A:                                                     │
│  [Text left]              [Product screenshot right]           │
│  "AI-powered signing"     [Document editor with AI badges]     │
│                                                                 │
│  Feature B:                                                     │
│  [Product screenshot left]  [Text right]                       │
│  [Analytics dashboard]    "Know who's reading"                 │
│                                                                 │
│  Feature C:                                                     │
│  [Text left]              [Product screenshot right]           │
│  "Built for developers"   [Code snippet + API docs]            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SECTION 8 — DEVELOPER SECTION                                   │
│ Dark code editor aesthetic, monospace font                      │
│ "Build once. Sign anywhere."                                    │
│ Shows TypeScript SDK usage, webhook payload examples            │
│ [View API Docs →]  [npm install @sealio/sdk]                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ SECTION 9 — PRICING PREVIEW                                     │
│ 3 tier cards (Starter / Pro / Business) on dark bg             │
│ Teal highlight on Pro (recommended)                            │
│ "No envelope limits. No surprises."                            │
│ [See Full Pricing →]                                           │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ FOOTER — Dark, minimal, 4-column                               │
│ [Sealio logo]                                                  │
│ Product | Developers | Company | Legal                         │
│ © 2026 Sealio · Privacy · Terms · Status                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Information Architecture

```
Sealio App
├── /                         — Landing page (marketing)
├── /pricing                  — Pricing page
├── /docs                     — Developer documentation
│
├── /dashboard                — Overview: stats, recent docs, quick actions
├── /documents
│   ├── /documents/new        — Send new document (4-step wizard)
│   ├── /documents/:id        — Document detail: status + signers + audit trail
│   ├── /documents/:id/edit   — Field placement editor
│   └── /documents/:id/analytics  — Engagement analytics
├── /templates
│   ├── /templates/new        — Create template
│   └── /templates/:id        — Template detail + edit
├── /contacts                 — Signer address book
├── /team
│   ├── /team/members         — Members + roles
│   ├── /team/branding        — Custom logo, colors, email domain
│   └── /team/integrations    — Connected apps (Zapier, HubSpot, etc.)
├── /analytics                — Org-level analytics dashboard
├── /settings
│   ├── /settings/account     — Profile, password, 2FA
│   ├── /settings/billing     — Plan, usage, invoices
│   ├── /settings/api         — API keys, webhook endpoints
│   └── /settings/compliance  — Compliance posture + certificates
│
└── PUBLIC (no auth required)
    ├── /sign/:token          — Signer experience
    ├── /verify/:documentId   — Public document verification
    └── /declined/:token      — Decline confirmation
```

---

## 5. Key User Flows

### Flow 1: Sender — Send a Document (Primary Flow)

```
Step 1: Upload
  → Drag & drop or click to upload (PDF, DOCX, image)
  → DOCX auto-converted to PDF server-side
  → Instant PDF preview in browser

Step 2: Add Recipients
  → Add signers: name + email
  → Set order: sequential or parallel
  → Add CC (view-only)
  → Set expiry date

Step 3: Place Fields
  → AI suggests field positions (confidence score shown)
  → Drag-and-drop: accept / reposition / add / remove
  → Field types: Signature, Initials, Date, Name, Text, Checkbox, Dropdown
  → Assign each field to a specific signer (color-coded)
  → Required vs optional toggle

Step 4: Configure & Send
  → Write custom message to signers
  → Choose auth method per signer: Email OTP / SMS OTP / ID Verify
  → Preview as signer
  → Send

Step 5: Track
  → Real-time status in document detail view
  → Notification per event (opened, signed, declined)
  → Engagement analytics: open time, page reading time
  → One-click reminder nudge
```

**Target: < 90 seconds for a standard NDA**

---

### Flow 2: Signer Experience (No Account Needed)

```
Email received → [View & Sign Document] button

Step 1: Identity Verification
  → Email OTP (6-digit, 10min expiry)
  → Optional: SMS OTP if configured by sender
  → Verified → document access granted

Step 2: Document Review
  → Clean dark reader mode (dark bg, white text on doc)
  → Page time tracked silently
  → Progress bar: "2 of 5 fields completed"
  → "Jump to next field" floating bar at bottom

Step 3: Sign Fields
  → Tap/click field → signature modal (bottom sheet on mobile)
  → Tabs: Draw · Type · Upload
  → Draw: variable-width Bézier canvas, teal ink
  → Type: name → choose from 5 script-style fonts
  → Upload: image file, max 2MB
  → "Apply to all signature fields" checkbox

Step 4: Complete
  → All required fields done → "Complete Signing" activates (teal)
  → Confirmation: dark screen, teal checkmark, "Document sealed."
  → Download copy instantly
  → Soft nudge: "Start signing with Sealio free"

Step 5: Certificate
  → Sender + all signers receive:
    — Signed PDF (tamper-sealed, SHA-256 hash)
    — Certificate of Completion PDF (full audit trail)
```

**Target: < 60 seconds to sign a pre-placed document**

---

### Flow 3: Developer Embed

```javascript
// 3-line embed — the target developer experience

import { Sealio } from '@sealio/sdk';

const client = new Sealio({ apiKey: 'sk_live_...' });

const session = await client.documents.createSigningSession({
  documentId: 'doc_abc123',
  signer: { email: 'client@company.com', name: 'Jane Client' },
  redirectUrl: 'https://yourapp.com/contract-signed'
});

// Drop into any React/Vue/Angular/HTML app
<SealioEmbed sessionToken={session.token} onComplete={handleDone} />
```

- White-labeled iframe (Sealio branding removed on Business+)
- Events: `onLoad` · `onComplete` · `onDecline` · `onError`
- Full TypeScript types for all events and payloads
- Works in React, Vue, Angular, vanilla JS

---

### Flow 4: AI Contract Risk Analysis

```
User opens document → clicks [Analyze with AI] in toolbar

AI scans via GPT-4V → right sidebar panel appears:

  ┌────────────────────────────────────────────────────┐
  │ ⚠️  AI Analysis — 3 clauses flagged                │
  ├────────────────────────────────────────────────────┤
  │ 🔴 HIGH — Auto-renewal (Section 8.2)               │
  │     Renews 24 months unless cancelled 90 days      │
  │     prior. You may miss the window.                │
  │     [Jump to Clause]  [Add Calendar Reminder]      │
  ├────────────────────────────────────────────────────┤
  │ 🟡 MEDIUM — Unlimited liability (Section 12.1)     │
  │     No cap on damages specified.                   │
  │     [Jump to Clause]                               │
  ├────────────────────────────────────────────────────┤
  │ 🟡 MEDIUM — Non-compete 36 months (Section 9.3)   │
  │     May be unenforceable in CA, NY.                │
  │     [Jump to Clause]  [Learn more]                 │
  └────────────────────────────────────────────────────┘

  ✅ Standard: Termination, Confidentiality, Governing Law

  ─ AI analysis only. Not legal advice. ─
```

---

### Flow 5: Document Engagement Analytics

```
Document detail → [Analytics] tab

  ┌─────────────────────────────────────────────────┐
  │ ACME_Contract_2026.pdf — Jane Smith             │
  ├─────────────────────────────────────────────────┤
  │ Sent:         May 24, 2:30 PM                   │
  │ First opened: May 24, 4:15 PM (1h 45m later)   │
  │ Total review: 8m 32s                            │
  │ Device:       iPhone 15 Pro · Safari            │
  ├─────────────────────────────────────────────────┤
  │ PAGE READING TIME                               │
  │ p1 Intro       ████████░░  82s                 │
  │ p2 Terms       ██████████  3m 12s  🔥          │
  │ p3 Payment     █████████░  2m 45s  🔥          │
  │ p4 Termination ████░░░░░░  34s                 │
  │ p5 Signatures  ██████████  1m 21s              │
  ├─────────────────────────────────────────────────┤
  │ Forwarded:    Yes → legal@acme.com              │
  │ Downloaded:   Yes, May 24, 5:02 PM              │
  ├─────────────────────────────────────────────────┤
  │ 💡 Signer lingered 3× on payment terms.        │
  │    Consider following up on pricing.            │
  ├─────────────────────────────────────────────────┤
  │ [Send Reminder]  [Message Signer]               │
  └─────────────────────────────────────────────────┘
```

---

## 6. Screen Wireframes

### Screen 1: Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ [🔏 Sealio]  Documents  Templates  Analytics  Team      [+ New] │
│ bg:#09090B  border-bottom: 1px #27272A                         │
│─────────────────────────────────────────────────────────────────│
│                                                                 │
│  Good morning, Akash                        [+ New Document]    │
│  Text Primary, 24px bold                   teal button         │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ 24               │  │ 8                │  │ 91%          │  │
│  │ Docs This Month  │  │ Awaiting Sign.   │  │ Completion   │  │
│  │ ↑ 12% vs last mo │  │ 3 overdue        │  │ Rate         │  │
│  │ bg:#111113       │  │ bg:#111113       │  │ bg:#111113   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────┘  │
│                                                                 │
│  RECENT DOCUMENTS                              [View all →]     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 📄 ACME_NDA_2026.pdf     Jane Smith    🟡 Awaiting  [→] │   │
│  │ 📄 Contractor_SOW.pdf    Mark Lee      🟢 Completed [→] │   │
│  │ 📄 Office_Lease.pdf      Sarah, Tom    🟠 Partial   [→] │   │
│  │ 📄 Employee_Offer.pdf    Chris Wang    🔴 Declined  [→] │   │
│  │ bg:#111113, border: 1px #27272A, border-radius: 12px   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  NEEDS ATTENTION                                                │
│  ⚠️  Invoice_Agreement.pdf — Expired 2 days ago   [Resend]     │
│  ⏰  Marketing_Contract.pdf — Jane unopened (3 days) [Nudge]   │
│  bg:#18181B, border-left: 3px #F59E0B                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Screen 2: Document Field Placement Editor

```
┌─────────────────────────────────────────────────────────────────┐
│ [← Back]  Contract.pdf              [Preview]  [Settings]  [Send →]│
│ bg:#09090B  border-bottom: 1px #27272A                    teal  │
│─────────────────────────────────────────────────────────────────│
│ LEFT PANEL    │  CENTER: PDF VIEW (scrollable)  │ RIGHT PANEL   │
│ bg:#111113    │  bg:#18181B, field overlays      │ bg:#111113    │
│ w:200px       │                                 │ w:220px       │
│               │  ┌───────────────────────────┐  │               │
│ FIELD TYPES   │  │ [PDF page renders here]   │  │ SIGNERS       │
│ ─────────     │  │                           │  │ ─────────     │
│ ✍ Signature   │  │ Lorem ipsum dolor         │  │ 🔵 Jane Smith │
│ ✍ Initials    │  │ sit amet...               │  │ 🟢 Mark Lee   │
│ 📅 Date       │  │                           │  │               │
│ 📝 Full Name  │  │  ┌──────────────┐ ◄ AI   │  │ Active: Jane  │
│ 💬 Text       │  │  │ ✍ Signature  │ label  │  │ (blue fields) │
│ ☑ Checkbox    │  │  │  Jane Smith  │        │  │               │
│ ▼ Dropdown    │  │  └──────────────┘        │  │ AI DETECTED   │
│               │  │                           │  │ 3 fields      │
│ ─────────     │  │  📅 Date: _______ ◄ AI   │  │ suggested     │
│ 🤖 AI Detect  │  │                           │  │               │
│ Suggests      │  └───────────────────────────┘  │ [Accept All]  │
│ all fields    │  Page 1 of 4        [‹] [›]     │ [Review 1×1]  │
│               │                                 │               │
└───────────────┴─────────────────────────────────┴───────────────┘
```

---

### Screen 3: Signer Experience (Mobile, 375px)

```
┌─────────────────────────────┐    ┌─────────────────────────────┐
│ bg:#09090B                  │    │ bg:#09090B                  │
│                             │    │                             │
│     🔏                      │    │ ← Exit    p.1/4    [2/3 ✍] │
│                             │    │─────────────────────────────│
│  Consulting Agreement       │    │                             │
│  from Jane Smith            │    │  [PDF renders in dark       │
│  Text Primary, 20px bold    │    │   reader mode here]         │
│                             │    │                             │
│  4 pages · 3 signature      │    │  Lorem ipsum dolor sit      │
│  fields required            │    │  amet, consectetur...       │
│  Text Secondary, 14px       │    │                             │
│                             │    │─────────────────────────────│
│  ── VERIFY IDENTITY ──      │    │ Next field: SIGNATURE       │
│                             │    │ [TAP TO SIGN ↓]  teal bar  │
│  Code sent to               │    └─────────────────────────────┘
│  j***@company.com           │
│                             │    ┌─────────────────────────────┐
│  ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐ │ │ Sign Here                   │
│  │  │ │  │ │  │ │  │ │  │ │  │ │ │─────────────────────────────│
│  └──┘ └──┘ └──┘ └──┘ └──┘ └──┘ │ │  Draw  │  Type  │  Upload  │
│  teal border on focus       │    │─────────────────────────────│
│                             │    │ ┌─────────────────────────┐ │
│  Didn't receive? [Resend]   │    │ │                         │ │
│                             │    │ │   draw signature here   │ │
│  [Continue →]  teal, full W │    │ │                         │ │
│                             │    │ └─────────────────────────┘ │
└─────────────────────────────┘    │ [Clear]                     │
                                   │                             │
  OTP verified →                   │ [Apply Signature]  teal btn │
  Document reader →                └─────────────────────────────┘
  Sign field tap →
  Signature modal (bottom sheet)
```

---

### Screen 4: Analytics Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│ Analytics                             [Last 30 days ▼]  [Export]│
│─────────────────────────────────────────────────────────────────│
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────┐  │
│  │ 247         │  │ 91.2%       │  │ 18 min      │  │ 4.2d  │  │
│  │ Docs Sent   │  │ Completed   │  │ Avg Read    │  │ Avg   │  │
│  │ ↑ 23% MoM   │  │ ↑ 5%        │  │ Time        │  │ Sign  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────┘  │
│  bg:#111113, border:1px #27272A, border-radius:12px            │
│                                                                 │
│  SIGNING ACTIVITY — May 2026                                    │
│  [bar chart — teal bars on #111113 bg, 30 days]                 │
│                                                                 │
│  TEMPLATE PERFORMANCE                                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Template              Sent  Done   Avg Time   Rate      │   │
│  │ Standard NDA          45    43     2.1 days   96%  🟢   │   │
│  │ Consulting SOW        38    33     4.7 days   87%  🟢   │   │
│  │ Employment Offer      27    26     1.2 days   96%  🟢   │   │
│  │ Partnership Agmt      18    13     9.3 days   72%  🟡   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  SIGNING HEATMAP (time of day)                                  │
│  ░░░░█░░░░░████████████░░░░░████░░░░░░░░                       │
│  12a    4a    8a   12p    4p    8p   12a                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Technical Architecture

### Tech Stack

**Frontend:**
- Framework: Next.js 14+ (App Router, RSC)
- Language: TypeScript (strict)
- Styling: Tailwind CSS v4 + Shadcn/ui + CSS custom properties
- PDF: react-pdf (viewer) + custom canvas overlay (field placement)
- Signature: react-signature-canvas (variable-width Bézier, custom teal stroke)
- State: TanStack Query (server) + Zustand (client)
- Forms: react-hook-form + Zod
- Real-time: native WebSocket (status updates, presence)
- Deployment: Vercel

**Backend:**
- API: Node.js + Fastify (REST, webhooks, auth)
- AI service: Python 3.12 + FastAPI (document analysis, field detection)
- ORM: Prisma (TypeScript-native)
- Database: PostgreSQL 16 (Supabase managed)
- Cache: Redis (sessions, job queues, rate limiting)
- Queue: BullMQ (retry, scheduling, reminders)
- PDF ops: pdf-lib (MIT) + Apryse SDK (advanced)
- Crypto: node-forge (JS PKI) / Python cryptography library
- Email: Resend
- SMS: Twilio
- Storage: AWS S3 + CloudFront
- Secrets: AWS Secrets Manager
- Deployment: Railway → AWS ECS Fargate (scale)

**Infrastructure:**
- Docker + Docker Compose (local + self-hosting)
- CI/CD: GitHub Actions
- Monitoring: Sentry + Axiom + Uptime Robot
- CDN: Cloudflare

---

### Database Schema (Core Tables)

```sql
organizations:    id, name, slug, plan, branding_config, created_at
users:            id, org_id, email, name, role, avatar_url, created_at
documents:        id, org_id, creator_id, title, status, file_path,
                  signed_file_path, hash_sha256, expires_at, created_at
document_fields:  id, document_id, type, page, x, y, width, height,
                  required, assigned_to_signer_id
signing_requests: id, document_id, signer_email, signer_name,
                  order, status, auth_method, token, signed_at
signatures:       id, signing_request_id, field_id, value,
                  capture_method, signed_at
audit_events:     id, document_id, signing_request_id, event_type,
                  actor_email, ip_address, user_agent, geo_country,
                  geo_city, metadata_json, prev_hash, event_hash, created_at
templates:        id, org_id, name, description, file_path, field_config_json
webhook_endpoints: id, org_id, url, events[], secret, is_active
api_keys:         id, org_id, key_hash, name, last_used_at, created_at
```

---

### API Design

**Base URL:** `https://api.sealio.io/v1`
**Auth:** `Authorization: Bearer sk_live_...`

```
POST   /documents                     Upload + create
GET    /documents                     List (paginated)
GET    /documents/:id                 Detail
POST   /documents/:id/send            Send for signing
POST   /documents/:id/void            Cancel
GET    /documents/:id/audit-trail     Full audit log
GET    /documents/:id/download        Signed PDF
GET    /documents/:id/analytics       Engagement analytics

GET    /sign/:token                   Get signing session
POST   /sign/:token/authenticate      Verify OTP
GET    /sign/:token/document          PDF stream
POST   /sign/:token/fields/:fieldId   Submit field value
POST   /sign/:token/complete          Complete signing

POST   /templates                     Create template
GET    /templates/:id/documents       Create doc from template

POST   /webhooks                      Register endpoint
DELETE /webhooks/:id                  Remove

GET    /analytics/overview            Org-level summary
```

**Webhook events:**
```
document.created  document.sent    document.viewed
document.signed   document.completed  document.declined
document.expired  document.voided
```

---

### Security Architecture

```
Layer 1 — Network:      Cloudflare WAF, TLS 1.3, HSTS
Layer 2 — Auth:         JWT RS256 (15min/7day), Argon2 API keys,
                        time-limited OTP, single-use signing tokens
Layer 3 — Authorization: PostgreSQL RLS, org-scoped resources,
                         RBAC: Owner → Admin → Member → Viewer
Layer 4 — Data:         AES-256-GCM at rest, AWS KMS (90-day rotation),
                        append-only audit table, tamper-detection on download
Layer 5 — Crypto:       SHA-256 doc fingerprint, hash-chained audit events,
                        RSA-2048 Certificate of Completion, DigiCert/Sectigo CA
Layer 6 — Ops:          Quarterly pen testing, Snyk in CI,
                        secrets via AWS Secrets Manager, SOC 2 prep month 6
```

---

## 8. Compliance Posture

| Timeline | Standards |
|---|---|
| MVP (Day 1) | ESIGN Act, UETA, basic GDPR, eIDAS SES |
| Month 6-12 | eIDAS AES, HIPAA BAA, SOC 2 Type II audit begins |
| Year 2+ | eIDAS QES, 21 CFR Part 11, ISO 27001 |

---

## 9. Open Source Strategy

**Model:** Open-core (GitLab/Metabase pattern)

- **Open source (AGPL-3.0):** Core signing engine, audit trail, REST API, self-hosting via Docker
- **Proprietary SaaS:** AI analysis, engagement analytics, team collab, compliance dashboards
- **Repo:** `github.com/sealio/sealio`

**Reference implementations to study (do not copy AGPL code):**
- Documenso — `github.com/documenso/documenso` (Next.js + Prisma, best modern reference)
- DocuSeal — `github.com/docusealco/docuseal` (Ruby, mature feature reference)
- OpenSign — `github.com/OpenSignLabs/OpenSign` (privacy-focused reference)

---

## 10. Implementation Timeline

| Period | Milestone |
|---|---|
| Month 1-2 | Next.js + Fastify monorepo, DB schema, auth, PDF viewer, field placement |
| Month 3 | Signature capture, Email OTP, signing workflow, doc sealing, Certificate of Completion |
| Month 4 | REST API v1, TypeScript SDK, embedded signing, webhooks, docs site, sandbox |
| Month 5 | Templates, bulk send, Stripe billing, analytics dashboard, public launch |
| Month 6-8 | AI field detection, AI risk analysis, engagement analytics, in-doc comments, integrations |
| Month 9-12 | SMS OTP, WebAuthn biometrics, PWA offline, SAML SSO, HIPAA BAA, React Native app |

---

*Version: 1.0 | Date: 2026-05-24 | Visual reference: Twingate.com (user-provided screenshot)*
