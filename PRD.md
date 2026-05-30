# Sealio — Product Requirements Document (PRD)

> **Visual Reference Incorporated:** Design system derived from the Twingate.com screenshot — dark-first (#09090B canvas), bold editorial typography, vivid product card glows, pastel testimonial floaters, minimal dark nav. Adapted with Sealio's teal accent (#6EE7B7).

---

## 1. Executive Summary

**Product Name:** Sealio
**Tagline:** *Sign with confidence. Build without limits.*
**Category:** E-Signature SaaS Platform
**Market:** $7.8B (2025) → $24.5B (2030), 28% CAGR

Sealio is a modern, developer-first e-signature platform built for the next decade. It fixes the core problems plaguing incumbents — opaque pricing, clunky UI, poor mobile experience, no AI, and developer-hostile APIs — and layers in genuinely differentiated features: AI-powered contract analysis, document engagement analytics, offline signing, biometric authentication, and transparent flat-rate pricing.

**Why now?** DocuSign's pricing model is increasingly resented (82% cost-value mismatch ratings on G2). The #1 complaint from 2024-2025 reviews is "I wish I could find something modern, simple, and honest about what it costs." That's Sealio.

---

## 2. Problem Statement

### What exists today:
| Problem | Incumbent Behavior |
|---|---|
| Envelope/transaction limits | DocuSign's standard plan caps you at 100 envelopes/user/year |
| Hidden costs | SSO, API access, bulk send, and advanced audit trails all cost extra |
| Legacy UI | DocuSign and Adobe Sign haven't had meaningful UX overhauls in years |
| Poor mobile | Most platforms are desktop apps ported to mobile; not built for mobile-first workflows |
| No AI | Basic field detection at best; no contract analysis, no fraud detection |
| API complexity | Embedded signing on DocuSign requires 12+ steps |
| No collaboration | Documents leave your control before the signing stage; no in-context chat |
| Fragmented analytics | Only PandaDoc offers document engagement analytics, and only for sales proposals |
| Compliance opacity | Hard to know if you're actually compliant with GDPR, eIDAS, HIPAA without legal review |

### What Sealio solves:
1. **Transparent unlimited pricing** — no envelopes, no surprises
2. **Mobile-first design** — built for the phone generation, not ported to it
3. **AI that earns its place** — contract risk flagging, auto-field detection, anomaly detection
4. **Developer-grade API** — embedded signing in 3 lines of code
5. **Document engagement analytics** — know who's actually reading before they sign
6. **Real-time collaboration** — in-document chat during the pre-sign review phase
7. **Compliance-by-default** — ESIGN Act, UETA, eIDAS-ready out of the box

---

## 3. Market Opportunity

### Total Addressable Market (TAM)
- Global e-signature market: $7.8B (2025), growing at 28% CAGR
- By 2030: $24.5B
- North America: 40% share ($3.1B)
- Europe: 30% share ($2.3B, accelerating with eIDAS)
- Asia-Pacific: 25% share (fastest growth, lowest penetration = opportunity)

### Serviceable Addressable Market (SAM) — Sealio Year 1-3 focus
- SMBs and mid-market companies (5-500 employees) in US + Europe: ~$1.2B
- Developer/API market (embed e-signing into products): ~$400M
- Field operations verticals (construction, insurance, healthcare): ~$300M

### Serviceable Obtainable Market (SOM) — Year 1-2 target
- 0.05% of SAM = $850K ARR at 12 months
- 0.15% of SAM = $2.4M ARR at 24 months

### Highest-Growth Verticals to Target
1. **Healthcare** (35% CAGR) — patient consents, telemedicine paperwork, HIPAA-compliant
2. **Real Estate** — lease/mortgage signing, multi-party workflows
3. **SaaS/Tech companies** — vendor agreements, contractor NDAs, embedded in product
4. **Professional Services** — legal, consulting, HR onboarding
5. **Field Operations** — insurance adjusters, construction sign-offs, delivery confirmations

---

## 4. Target Users

### Primary Personas

**Persona 1: Sam the Startup Founder (SMB Owner)**
- Company: 5-50 people, SaaS or services
- Pain: DocuSign is $40/user/month, confusing, and has envelope limits that force upgrades
- Need: Simple, affordable, unlimited signing for contracts, NDAs, SOWs, onboarding docs
- Goal: Send a doc and get it signed in under 2 minutes

**Persona 2: Dev the Developer (API/Integration User)**
- Company: Product team at a B2B SaaS
- Pain: DocuSign API requires a lawyer to understand; HelloSign API is good but expensive; no free sandbox with full features
- Need: Embed signing into their product in a weekend; TypeScript SDK; great webhook events; real iframe signing
- Goal: Ship embedded signing without a 3-week integration

**Persona 3: Ops the Operations Manager (Mid-Market)**
- Company: 100-500 employees; legal, HR, or sales ops role
- Pain: Current tool has no engagement analytics; doesn't know who's actually reading docs; can't see if proposal was opened
- Need: Analytics showing when docs were opened, how long each page was read, if it was forwarded
- Goal: Follow up on proposals intelligently; prioritize by engagement

**Persona 4: Field Frank (Field Operations)**
- Company: Construction, insurance, utilities, delivery
- Pain: No internet in the field; signing tools stop working offline; mobile experience is unusable in gloves/bright sunlight
- Need: Offline signing with biometric capture; syncs when back on WiFi; works on tablet with large touch targets
- Goal: Get a signature from a homeowner in a front yard without needing WiFi

**Persona 5: Enterprise Eve (Compliance/Legal Ops)**
- Company: 1,000+ employees; healthcare, finance, or legal sector
- Pain: Current platform doesn't clearly communicate compliance posture; HIPAA BAA is expensive add-on; SOC 2 reports are hard to access
- Need: Clear compliance dashboard; industry-specific templates; QES (Qualified Electronic Signatures) for EU
- Goal: Know with certainty that every signed document is legally defensible

---

## 5. Competitive Positioning

| Feature | DocuSign | Adobe Sign | Dropbox Sign | PandaDoc | **Sealio** |
|---|---|---|---|---|---|
| Transparent pricing | ❌ | ❌ | ✅ | Partial | ✅ |
| No envelope limits | ❌ | ❌ | ✅ | ❌ | ✅ |
| Free functional tier | ❌ | ❌ | ❌ | ❌ | ✅ |
| Mobile-first design | Partial | Partial | ✅ | Good | ✅ |
| Offline signing | ❌ | ❌ | ❌ | ❌ | ✅ |
| Biometric auth | ❌ | ❌ | ❌ | ❌ | ✅ |
| AI contract analysis | Partial | Partial | ❌ | Partial | ✅ |
| Auto field detection | Partial | ✅ | ❌ | Partial | ✅ |
| Document engagement analytics | ❌ | ❌ | ❌ | ✅ | ✅ |
| In-document collaboration | ❌ | ❌ | ❌ | ❌ | ✅ |
| Developer-friendly API | Good | Good | Excellent | Good | ✅ |
| TypeScript SDK | Partial | ❌ | ❌ | ❌ | ✅ |
| Embedded signing simplicity | Complex | Complex | Good | Partial | ✅ |
| Blockchain audit trail | ❌ | ❌ | ❌ | ❌ | Optional |
| eIDAS QES support | ❌ | ❌ | ❌ | ❌ | Roadmap |
| Open-source core | ❌ | ❌ | ❌ | ❌ | ✅ |

**Sealio's 3 Unfair Advantages:**
1. **AI-native from day one** — not bolted on
2. **Developer obsession** — 3-line embed, best-in-class DX
3. **Honest pricing with no gotchas** — the anti-DocuSign

---

## 6. Feature Roadmap

### Phase 1 — MVP (Months 1-4): "Get to market fast, get it right"

**Core Signing Engine**
- [ ] Multi-format document upload: PDF, DOCX, XLSX, images → auto-converted to PDF
- [ ] In-browser PDF viewer with field overlay (react-pdf + custom canvas)
- [ ] Drag-and-drop field placement: signature, initials, date, text, checkbox, dropdown
- [ ] AI-assisted auto field detection (GPT-4V or AWS Textract for field suggestions)
- [ ] Canvas signature capture (draw), typed signature (with font choice), image upload
- [ ] Sequential and parallel signing workflows
- [ ] Signing order management
- [ ] Signing link generation (no-account signing for recipients)
- [ ] Document completion detection and sealing (SHA-256 hash + RSA signing)
- [ ] Downloadable completion certificate with full audit trail

**Authentication & Identity**
- [ ] Email magic link / OTP for signers (no account required)
- [ ] SMS OTP for enhanced verification
- [ ] Account-based auth for senders: email/password + Google OAuth
- [ ] JWT-based session management

**Document Management**
- [ ] Document library with search and filter
- [ ] Document status tracking (Draft → Sent → Partially Signed → Completed → Expired)
- [ ] Template creation and management
- [ ] Bulk send from template (CSV upload of recipients)
- [ ] Document expiry with configurable timelines
- [ ] Automatic reminder emails (configurable schedule)
- [ ] Document voiding/cancellation

**Audit Trail & Compliance**
- [ ] Tamper-evident audit trail (SHA-256 hash chain)
- [ ] Event logging: created, sent, opened, signed, declined, completed
- [ ] IP address, user agent, geolocation per event
- [ ] Cryptographic Certificate of Completion (embedded in final PDF)
- [ ] ESIGN Act / UETA compliant architecture
- [ ] AES-256 encryption at rest; TLS 1.3 in transit

**Notifications & Workflow**
- [ ] Email notifications for all events (customizable)
- [ ] In-app notification center
- [ ] Webhook delivery with HMAC-SHA256 payload signing
- [ ] Webhook retry with exponential backoff
- [ ] Dashboard: signing activity, completion rates, average time to sign

**API & Developer Tools**
- [ ] REST API v1 with full OpenAPI 3.0 spec
- [ ] TypeScript and Python SDKs
- [ ] Sandbox environment with test mode
- [ ] Embedded signing via iframe (3-line integration)
- [ ] API key management dashboard
- [ ] Rate limiting and usage dashboard
- [ ] Developer documentation site (Mintlify or Docusaurus)

**Pricing & Billing**
- [ ] Free tier: 5 documents/month, email OTP only
- [ ] Starter: $29/month, 50 documents, SMS OTP, API access, basic webhooks
- [ ] Professional: $99/month, unlimited documents, all features, team workspaces
- [ ] Business: $299/month, 5 users, advanced analytics, priority support
- [ ] Stripe integration for subscriptions and billing portal

---

### Phase 2 — Differentiation (Months 5-8): "Win on features"

**AI Features**
- [ ] AI contract risk analysis: flag unusual clauses (auto-renewal, unlimited liability, non-compete)
- [ ] AI anomaly detection: flag suspicious signing patterns (unusual hours, geolocation mismatch, rapid repeat signing)
- [ ] AI signature quality validation: reject illegible or blank signatures
- [ ] Smart reminders: AI-predicted optimal follow-up timing based on historical data
- [ ] Auto-classification of document type (NDA, employment, lease, SOW, etc.)

**Document Engagement Analytics**
- [ ] Real-time document open tracking (email open + link click)
- [ ] Per-page time-spent analytics
- [ ] Scroll depth tracking during document review
- [ ] Download / print tracking
- [ ] Multi-device view correlation
- [ ] Analytics dashboard with per-document report
- [ ] Export to CSV/PDF

**In-Document Collaboration**
- [ ] Pre-signature discussion threads (annotate specific sections with questions)
- [ ] @mention specific signers in comments
- [ ] Video message attachment to a document (record a 30-second intro for the recipient)
- [ ] Real-time presence indicators (see when recipient is viewing document)
- [ ] Document revision history with change tracking
- [ ] Private vs. shared notes (sender can have private notes not visible to signers)

**Mobile Experience (Native-Quality Web)**
- [ ] Progressive Web App (PWA) with offline capability
- [ ] Offline signing mode: sign without internet, sync when reconnected
- [ ] Biometric authentication: Face ID, Touch ID, fingerprint via WebAuthn
- [ ] Mobile-optimized signing UX: large touch targets, swipe to next field, auto-scroll
- [ ] Camera integration: capture government ID photo for verification
- [ ] Location tagging for field signings
- [ ] Push notifications via PWA

**Integrations (Phase 2)**
- [ ] Zapier (all triggers and actions)
- [ ] Make (Integromat) native node
- [ ] Google Drive: send from Drive, save to Drive
- [ ] Dropbox: two-way sync
- [ ] OneDrive / SharePoint
- [ ] Slack: signing notifications, approval requests in-channel
- [ ] HubSpot: send for signature from CRM deal/contact view
- [ ] Salesforce: AppExchange package

**Team & Organization Features**
- [ ] Team workspaces with shared templates and documents
- [ ] Role-based access control: Owner, Admin, Member, View-Only
- [ ] Team activity audit log
- [ ] Custom branding per workspace (logo, colors, email sender domain)
- [ ] Custom signing portal URL (yourcompany.sealio.com)
- [ ] Document folders and tagging

---

### Phase 3 — Enterprise & Scale (Months 9-16): "Win the big deals"

**Advanced Compliance**
- [ ] SOC 2 Type II certification
- [ ] HIPAA Business Associate Agreement (BAA)
- [ ] eIDAS Advanced Electronic Signature (AES) support
- [ ] eIDAS Qualified Electronic Signature (QES) support (via qualified TSP partnership)
- [ ] GDPR-compliant data residency controls (EU data stays in EU)
- [ ] 21 CFR Part 11 compliance for pharmaceutical/FDA contexts
- [ ] FedRAMP-ready architecture
- [ ] Compliance dashboard: real-time compliance posture per document type

**Identity Verification (KYC)**
- [ ] Government ID verification (passport, driver's license scan via Onfido/Jumio)
- [ ] Liveness check (anti-spoofing facial detection)
- [ ] Knowledge-based authentication (KBA): quiz-style identity questions
- [ ] ID-to-selfie match (face match to uploaded ID)
- [ ] Verification badge on completed document with identity proof report

**Advanced Workflow Automation**
- [ ] No-code workflow builder: visual drag-and-drop signing flow designer
- [ ] Conditional routing: if field value = X then route to signer Y
- [ ] Approval chains with escalation paths
- [ ] Document generation from data: merge template with CRM data to create personalized docs
- [ ] Dynamic document sections: show/hide sections based on signer input
- [ ] Webhook-triggered signing initiation (auto-send when deal closes in CRM)

**Enterprise Features**
- [ ] SAML SSO (Okta, Azure AD, Google Workspace)
- [ ] SCIM provisioning for enterprise user management
- [ ] Custom retention policies per document type
- [ ] eDiscovery export support
- [ ] Self-hosted deployment option (Docker Compose + Kubernetes Helm chart)
- [ ] White-label licensing for resellers/ISVs
- [ ] Dedicated cloud instance (VPC isolation)
- [ ] SLA guarantees: 99.99% uptime with credits
- [ ] Priority support, dedicated CSM

**Blockchain Verification (Premium Add-on)**
- [ ] Optional blockchain timestamp for signed documents (Polygon network)
- [ ] Blockchain transaction ID embedded in Certificate of Completion
- [ ] Public verification URL: anyone can verify a signed document without Sealio account
- [ ] Immutable audit trail anchored to blockchain

**Video & Rich Media Signing**
- [ ] Video signing: record a video agreeing to terms (admissible as evidence)
- [ ] Real-time video signing session (scheduled video call with signing built-in)
- [ ] AI lip-sync verification for video anti-spoofing
- [ ] Integration with Zoom, Teams, Google Meet for in-call signing

**Mobile App (React Native)**
- [ ] iOS and Android native apps
- [ ] Biometric authentication (Face ID, Fingerprint)
- [ ] Full offline support with conflict-free sync
- [ ] Document scanner with auto-straightening and OCR
- [ ] In-app signing requests and push notifications

---

## 7. Pricing Strategy

### Pricing Model: Transparent + Usage-Based Tiers (No Envelope Limits)

| Tier | Price | Volume | Who It's For |
|---|---|---|---|
| **Free** | $0/month | 5 documents/month | Individuals testing the platform |
| **Starter** | $29/month | 50 documents/month | Freelancers, solo founders |
| **Pro** | $99/month | Unlimited documents | Small teams, active businesses |
| **Business** | $299/month | Unlimited + 5 seats | Growing companies |
| **Enterprise** | Custom | Unlimited + unlimited seats | Large orgs, compliance-heavy |

### Add-Ons (Pay-As-You-Go)
- SMS OTP verification: $0.05/signer authentication
- AI contract risk analysis: $2.00/document
- Government ID verification: $3.00/verification
- Blockchain timestamp: $0.50/document
- Extra user seats (Business+): $25/user/month

### Key Pricing Principles
- No "contact sales" for standard features
- No envelope limits on any paid tier
- All API features included from Starter tier
- No per-user penalty for view-only users (only editors/senders count)
- Annual discount: 20% off all tiers

---

## 8. Success Metrics (KPIs)

### Growth Metrics
- Monthly Active Organizations (MAOs)
- Monthly Recurring Revenue (MRR) and ARR
- Free-to-Paid conversion rate (target: 8%)
- Net Revenue Retention (target: 115%+)
- Customer Acquisition Cost (CAC) vs. Lifetime Value (LTV)

### Product Health Metrics
- Documents signed per day
- Time-from-send to fully-signed (median)
- Signing completion rate (target: >85%)
- API calls per month
- Webhook delivery success rate (target: >99.5%)
- Mobile signing percentage (target: >40%)

### Quality Metrics
- NPS (target: 50+)
- Support ticket volume per 100 MAOs
- Uptime: 99.9% MVP, 99.99% Enterprise
- Mean Time to Resolution (MTTR) for P1 incidents: <1 hour

---

## 9. Go-to-Market Strategy

### Phase 1: Developer-Led Growth (Months 1-6)
- **Channel:** GitHub, Hacker News, Product Hunt launch, dev newsletters
- **Hook:** "The developer-first DocuSign alternative. Free tier, no envelope limits, TypeScript SDK."
- **Content:** Technical blog posts (How we built our signing engine, Our approach to tamper-evident audit trails)
- **Community:** Discord server, open GitHub issues, dev evangelism

### Phase 2: Product-Led Growth (Months 4-12)
- **Channel:** Self-serve signup, in-product upgrade prompts
- **Hook:** Free tier creates network effect (recipients receive documents, discover Sealio)
- **Virality:** "Sent via Sealio — Start for free" footer on signing emails (removable on Business+)
- **Conversion:** In-app prompts when approaching free limits

### Phase 3: Sales-Assisted Growth (Month 9+)
- **Inbound:** Content marketing, SEO for "DocuSign alternative", "e-signature for developers"
- **Outbound:** Target operations managers at 50-500 person companies via LinkedIn
- **Partnerships:** Accounting software (QuickBooks, Xero), CRM platforms (HubSpot marketplace)
- **Enterprise:** Dedicated AE team, custom procurement support, compliance documentation

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Legal challenge to signature validity | Low | High | Legal opinion letter; ESIGN/UETA compliance documentation |
| Data breach / document exposure | Low | Critical | Pen testing, bug bounty, cyber insurance ($5M+), encryption-first |
| AI analysis gives wrong legal advice | Medium | High | Clear disclaimer: "AI analysis, not legal advice" on every analysis |
| DocuSign price-matching to eliminate advantage | Medium | Medium | Differentiate on AI, DX, analytics — not just price |
| PDF library licensing issues | Low | Medium | Use MIT-licensed pdf-lib for core; negotiate Apryse startup pricing |
| 99.9% uptime SLA breach | Low | High | Multi-region, circuit breakers, runbooks, generous SLA credits |
| GDPR enforcement action (EU) | Low | High | DPA template, data minimization, EU data residency, DPO consultation |

---

*Version: 1.0 | Date: 2026-05-24 | Status: Approved*
