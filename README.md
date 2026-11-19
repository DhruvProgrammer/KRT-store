# KRT Store

A digital storefront built on an **Astro** frontend and a **service-oriented (SOA) Node.js backend**. Customers browse a catalog, add items to a cart, verify their email with an OTP, pay, and receive a receipt email containing download links.

> **Status:** Active development (prototype data stores, upgradeable to Redis/MongoDB).

---

## Table of Contents

- [Features](#features)
- [System Architecture](#system-architecture)
- [Services](#services)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Security Design](#security-design)
- [Getting Started](#getting-started)
- [Running with Docker](#running-with-docker)
- [Documentation Index](#documentation-index)
- [Roadmap](#roadmap)
- [License](#license)

---

## Features

- Product catalog with categories, slug-based product pages and search
- Per-user shopping cart (add, update quantity, remove, clear)
- Guest and signed-in checkout with **email OTP verification**
- Order creation and order history for signed-in accounts
- Payment intents with **idempotency keys** (Stripe-style flow)
- Receipt email with download links (notification service, currently a stub)
- JWT authentication with access and refresh tokens, delivered via the `krt_access` session cookie
- API gateway with centralized auth and rate limiting
- Containerized deployment with Docker Compose

---

## System Architecture

All client traffic enters through a single **API Gateway**, which authenticates requests, applies rate limits, and proxies to independent backend services over HTTP/REST.

```
┌──────────────────────────────────────────────────────────────┐
│                           CLIENTS                            │
│     Web (Astro)        Mobile (planned)      Admin (planned) │
└───────────────────────────────┬──────────────────────────────┘
                                │
                     ┌──────────┴──────────┐
                     │     API Gateway     │  Express · JWT · Rate limiting
                     │      Port 3001      │
                     └──────────┬──────────┘
                                │ HTTP / REST
      ┌──────────┬──────────┬───┴──────┬──────────┬──────────────┐
      │          │          │          │          │              │
 ┌────┴───┐ ┌────┴────┐ ┌───┴────┐ ┌───┴────┐ ┌───┴─────┐ ┌──────┴───────┐
 │  Auth  │ │ Catalog │ │  Cart  │ │ Order  │ │ Payment │ │ Notification │
 │  :3002 │ │  :3003  │ │ :3004  │ │ :3005  │ │  :3006  │ │    :3007     │
 └────────┘ └─────────┘ └────────┘ └────────┘ └─────────┘ └──────────────┘
```

**Design principles**

- **Single entry point:** clients never talk to internal services directly.
- **Server-authoritative pricing:** prices, names and totals are always looked up from the Catalog service. Client-supplied prices or amounts are ignored or rejected.
- **Service isolation:** each service owns its data and exposes a narrow REST interface.
- **Sync + async:** synchronous REST between services; an internal `EventEmitter` handles async side effects within a service.
- **Prototype-first persistence:** in-memory stores today, with a clear upgrade path to Redis and MongoDB.

### Checkout flow

1. Client adds items to the cart (Cart service).
2. Client verifies email with an OTP.
3. Client calls `POST /api/orders` with `{ email, otp, items: [{ slug, quantity }], paymentMethod }`.
4. Order service fetches authoritative prices from Catalog and computes the total.
5. Payment service creates a payment intent (amount derived from Catalog, `Idempotency-Key` required).
6. Payment is captured; Notification service sends the receipt with download links.

---

## Services

| Service | Port | Storage | Responsibility |
|---|---|---|---|
| API Gateway | 3001 | n/a | Routing, authentication, rate limiting |
| Auth Service | 3002 | In-memory / MongoDB | Users, JWT issuing, sessions |
| Catalog Service | 3003 | JSON / Redis | Products, categories, search |
| Cart Service | 3004 | In-memory / Redis | Per-user shopping cart |
| Order Service | 3005 | MongoDB | Order creation and history |
| Payment Service | 3006 | n/a | Payment intents (Stripe) and capture |
| Notification Service | 3007 | n/a | Email/SMS (stub) |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Astro, TypeScript, Tailwind CSS, PostCSS |
| Backend | Node.js, Express.js |
| Auth | JWT (access + refresh tokens), cookie-based session (`krt_access`) |
| Communication | REST/HTTP (sync), EventEmitter (internal async) |
| Data | In-memory (prototype), Redis, MongoDB |
| Payments | Stripe (payment intents) |
| Containers | Docker, Docker Compose |
| Tooling | PowerShell start scripts, npm |

---

## Project Structure

```
KRT-store/
├── src/                     # Astro frontend (pages, components, layouts)
├── public/                  # Static assets
├── hooks/                   # Frontend hooks
├── services/                # Backend microservices
│   ├── api-gateway/         # Express proxy: auth, rate limiting
│   ├── auth-service/        # Users, JWT, sessions
│   ├── catalog-service/     # Products, categories, search
│   ├── cart-service/        # Cart operations
│   ├── order-service/       # Orders and history
│   ├── payment-service/     # Payment intents and capture
│   └── notification-service/# Email/SMS (stub)
├── scripts/                 # Utility and build scripts
├── skills/                  # AI agent skills
├── brunoash alogritm/       # [describe: algorithm / experiment folder]
├── astro.config.mjs         # Astro configuration
├── tailwind.config.ts       # Tailwind configuration
├── tsconfig.json            # TypeScript configuration
├── docker-compose.yml       # Orchestrates all services
├── start-all.ps1            # Start frontend + all services (Windows)
├── start-services.ps1       # Start backend services only (Windows)
├── SOA-ARCHITECTURE.md      # Backend architecture and API reference
├── DEPLOYMENT-SECURITY.md   # Deployment hardening notes
├── pre-deploy-checklist.md  # Release checklist
├── security.md              # Web security reference and audit checklist
├── DESIGN-shopify.md        # Design system notes
├── UX.md                    # UX guidelines
└── AGENTS.md                # Instructions for AI coding agents
```

---

## API Reference

All endpoints are served through the gateway at `http://localhost:3001`.

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Log in and receive JWT |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user |

### Catalog

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/catalog/products` | List all products |
| GET | `/api/catalog/products/:slug` | Get a single product |
| GET | `/api/catalog/categories` | List categories |
| GET | `/api/catalog/search?q=term` | Search products |

### Cart

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/cart` | Get cart |
| POST | `/api/cart/items` | Add item |
| PUT | `/api/cart/items/:slug` | Update quantity |
| DELETE | `/api/cart/items/:slug` | Remove item |
| DELETE | `/api/cart` | Clear cart |

### Orders

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/orders` | Create an order |
| GET | `/api/orders` | List the signed-in account's orders (401 without session cookie) |
| GET | `/api/orders/:id` | Get a single order |

`POST /api/orders` body:

```json
{
  "email": "buyer@example.com",
  "otp": "123456",
  "items": [{ "slug": "product-slug", "quantity": 1 }],
  "paymentMethod": "card"
}
```

- Price, name and total are **looked up server-side** from the Catalog service; any price in the request is ignored.
- The order is bound to the email verified by the OTP. There is no `x-user-id` header.
- Another account's order returns **404**, not 403, so its existence is never confirmed.
- Guests have no order list; the receipt email carries their download links.

### Payments

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/payments` | Create a payment intent |
| POST | `/api/payments/capture` | Capture a payment |

`POST /api/payments` body:

```json
{
  "items": [{ "slug": "product-slug", "quantity": 1 }],
  "currency": "usd",
  "orderId": "optional",
  "metadata": { "email": "buyer@example.com", "paymentMethod": "card" }
}
```

- The amount is derived from the Catalog service; a client-supplied `amount` is **refused**.
- The `Idempotency-Key` header is **required**. Same key and same body returns the same intent; same key with a different body returns **409**.

`POST /api/payments/capture` body: `{ "paymentIntentId": "pi_..." }`

---

## Security Design

Security is treated as a first-class concern in this codebase:

- **Server-authoritative pricing** prevents price tampering.
- **Idempotency keys** prevent duplicate charges on retries.
- **OTP-verified email** binds orders to a verified identity, including for guests.
- **Object-level authorization** on orders, with 404 responses to avoid existence leaks (IDOR defense).
- **JWT access and refresh tokens**, with the access token held in the `krt_access` cookie.
- **Gateway rate limiting** on all public routes.

Further reading: [`security.md`](./security.md) (vulnerability reference and audit checklist), [`DEPLOYMENT-SECURITY.md`](./DEPLOYMENT-SECURITY.md) and [`pre-deploy-checklist.md`](./pre-deploy-checklist.md).

---

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose (optional)
- PowerShell (for the Windows helper scripts)

### Installation

```bash
git clone https://github.com/DhruvProgrammer/KRT-store.git
cd KRT-store
npm install
```

Install dependencies for each service:

```bash
for d in services/*/; do (cd "$d" && npm install); done
```

### Environment variables

Create a `.env` file at the project root and in each service as needed. Typical values:

```env
# Gateway
PORT=3001
JWT_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too

# Payments
STRIPE_SECRET_KEY=sk_test_...

# Data stores (optional, defaults to in-memory)
MONGO_URI=mongodb://localhost:27017/krt
REDIS_URL=redis://localhost:6379
```

> Never commit real secrets. Confirm your `.gitignore` excludes `.env` files.

### Run locally

**Windows (PowerShell):**

```powershell
./start-all.ps1        # frontend + all services
./start-services.ps1   # backend services only
```

**Manual:**

```bash
# Start each service in its own terminal, e.g.
cd services/api-gateway && npm start
# ...repeat for auth, catalog, cart, order, payment, notification

# Frontend
npm run dev
```

The storefront runs on Astro's dev server (default `http://localhost:4321`) and the gateway on `http://localhost:3001`.

---

## Running with Docker

```bash
docker compose up --build
```

This starts the gateway and all backend services on ports 3001 to 3007.

---

## Documentation Index

| Document | Purpose |
|---|---|
| [SOA-ARCHITECTURE.md](./SOA-ARCHITECTURE.md) | Service topology and API contracts |
| [security.md](./security.md) | Web security reference |
| [DEPLOYMENT-SECURITY.md](./DEPLOYMENT-SECURITY.md) | Production hardening |
| [pre-deploy-checklist.md](./pre-deploy-checklist.md) | Release checklist |
| [DESIGN-shopify.md](./DESIGN-shopify.md) | Visual design system |
| [UX.md](./UX.md) | UX principles |
| [AGENTS.md](./AGENTS.md) | Guidance for AI coding agents |

---

## Roadmap

- [ ] Replace in-memory stores with MongoDB and Redis in production
- [ ] Implement real email/SMS delivery in the Notification service
- [ ] Mobile client
- [ ] Admin dashboard
- [ ] Automated test suite and CI pipeline
- [ ] Observability: structured logging, metrics, tracing

---

## Contributing

1. Fork the repo and create a feature branch.
2. Make your changes with clear commit messages.
3. Run the pre-deploy checklist before opening a pull request.

---

## License

[Add a license, e.g. MIT] © DhruvProgrammer
