# KRT Store — SOA Architecture

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                  │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │  Web    │  │ Mobile  │  │ Admin   │                         │
│  │(Astro)  │  │ (TBA)   │  │ (TBA)   │                         │
│  └────┬────┘  └────┬────┘  └────┬────┘                         │
│       └─────────────┴─────────────┘                              │
│                          │                                      │
│                    ┌─────┴─────┐                                │
│                    │ API Gateway │  ← Express.js, JWT, Rate Limit│
│                    │  Port 3001   │                                │
│                    └─────┬─────┘                                │
│                          │                                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │ HTTP/REST
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────┴────┐    ┌──────┴──────┐    ┌─────┴─────┐
   │  Auth   │    │   Catalog   │    │   Cart    │
   │ Service │    │   Service   │    │  Service  │
   │  :3002  │    │   :3003     │    │  :3004    │
   └────┬────┘    └──────┬──────┘    └─────┬─────┘
        │                  │                  │
   ┌────┴────┐    ┌──────┴──────┐    ┌─────┴─────┐
   │  Order  │    │   Payment   │    │ Notification│
   │ Service │    │   Service   │    │  Service    │
   │  :3005  │    │   :3006     │    │   :3007     │
   └─────────┘    └─────────────┘    └───────────┘
```

## Services Overview

| Service | Port | Database | Responsibility |
|---------|------|----------|----------------|
| API Gateway | 3001 | N/A | Routing, auth, rate limiting |
| Auth Service | 3002 | In-memory/Mongo | Users, JWT, sessions |
| Catalog Service | 3003 | JSON/Redis | Products, categories, search |
| Cart Service | 3004 | In-memory/Redis | Shopping cart per user |
| Order Service | 3005 | MongoDB | Order creation, history |
| Payment Service | 3006 | N/A | Payment intents ( Stripe ) |
| Notification Service | 3007 | N/A | Email/SMS (stub) |

## Technology Stack

- **Backend**: Node.js, Express.js
- **Communication**: REST/HTTP (synchronous), EventEmitter (async internal)
- **Auth**: JWT (access + refresh tokens)
- **Data**: In-memory stores (prototype), upgradeable to Redis/MongoDB
- **Containerization**: Docker, Docker Compose

## File Structure

```
services/
├── api-gateway/         # Express proxy with auth
│   ├── index.js
│   └── package.json
├── auth-service/        # JWT auth, user management
│   ├── index.js
│   └── package.json
├── catalog-service/     # Products, search
│   ├── index.js
│   └── package.json
├── cart-service/        # Cart operations
│   ├── index.js
│   └── package.json
├── order-service/       # Orders, history
│   ├── index.js
│   └── package.json
├── payment-service/     # Payment processing stub
│   ├── index.js
│   └── package.json
└── docker-compose.yml   # All services orchestrated
```

## API Endpoints

### Auth Service (via Gateway)
- `POST /api/auth/register` — Register new user
- `POST /api/auth/login` — Login (returns JWT)
- `POST /api/auth/refresh` — Refresh token
- `GET /api/auth/me` — Get current user

### Catalog Service (via Gateway)
- `GET /api/catalog/products` — List all products
- `GET /api/catalog/products/:slug` — Single product
- `GET /api/catalog/categories` — List categories
- `GET /api/catalog/search?q=term` — Search

### Cart Service (via Gateway)
- `GET /api/cart` — Get cart
- `POST /api/cart/items` — Add item
- `PUT /api/cart/items/:slug` — Update quantity
- `DELETE /api/cart/items/:slug` — Remove item
- `DELETE /api/cart` — Clear cart

### Order Service (via Gateway)
- `POST /api/orders` — Create order. Body: `{ email, otp, items: [{ slug, quantity }], paymentMethod }`.
  The price, the name and the total are the SERVER's — they are looked up in the
  catalog service, and the price in the request body is ignored. The order
  belongs to the address the server verified with the OTP; there is no
  `x-user-id` header any more.
- `GET /api/orders` — List the signed-in account's orders. Needs the `krt_access`
  session cookie; without it the answer is 401. A guest has no list — the
  receipt email is how a guest gets the download links.
- `GET /api/orders/:id` — Single order. Same session rule; another account's
  order is a 404, not a 403, so it is not even confirmed to exist.

### Payment Service (via Gateway)
- `POST /api/payments` — Create payment intent. Body: `{ items: [{ slug, quantity }], currency, orderId?, metadata: { email, paymentMethod? } }`.
  The amount is derived from the catalog service — a client-supplied `amount` is
  refused. `Idempotency-Key` is required: the same key returns the same intent,
  the same key with a different body is a 409.
- `POST /api/payments/capture` — Capture payment. Body: `{ paymentIntentId }`.
