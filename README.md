# Rentora — Server

REST API for **Rentora**, an equipment rental marketplace. Express + MongoDB, with Better Auth JWT verification.

- Live: https://rentora-server-swart-one.vercel.app
- Client: https://rentora-six-iota.vercel.app ([repo](https://github.com/tishadey45/rentora))

## Tech stack

- Node.js, Express 5 (ES modules)
- MongoDB native driver
- `jose` — verifies Better Auth JWTs against the remote JWKS (EdDSA)
- `cors`, `dotenv`

## Getting started

Requirements: Node.js 20+ and a MongoDB connection string.

```bash
npm install
# create a .env file (see below)
npm run dev
```

Runs at http://localhost:5000. `GET /` returns a health message.

## Environment variables

Create a `.env` in the project root:

| Name | Description |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string (the app uses database `rentora`) |
| `BETTER_AUTH_URL` | Base URL of the client app. Used to fetch the JWKS at `<BETTER_AUTH_URL>/api/auth/jwks` and to check the JWT `iss`/`aud`. |

> In production `BETTER_AUTH_URL` must be the deployed client URL (e.g. `https://rentora-six-iota.vercel.app`), not `localhost`, or every authenticated request returns 401.
>
> `PORT` is optional and defaults to `5000` (local only).

## Authentication

Protected routes require `Authorization: Bearer <jwt>`.

- `verifyToken` (`middleware/verifyToken.js`) verifies the JWT against the client's JWKS (issuer, audience, EdDSA), loads the user from MongoDB, and sets `req.user = { id, email, name, role }`. The role always comes from the database, never from the request.
- Role guards (`middleware/verifyRole.js`) read only `req.user.role`:
  - `verifyRenter` → `customer`
  - `verifyOwner` → `owner`
  - `verifyAdmin` → `admin`

## API

Base path: `/api/v1`. Responses use `{ success, message, data }`, except the public equipment list which returns an array.

### Public

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Health check |
| GET | `/api/v1/equipment` | Approved equipment list. Query: `search`, `category`, `rentalType`, `minPrice`, `maxPrice`, `availability`, `sort` (`price_asc`, `price_desc`, `newest`) |
| GET | `/api/v1/equipment/:id` | One equipment item |

### Owner

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/v1/equipment` | Create equipment |
| GET | `/api/v1/equipment/my-equipment` | List own equipment |
| PATCH | `/api/v1/equipment/:id` | Update own equipment |
| DELETE | `/api/v1/equipment/:id` | Delete own equipment |

### Customer

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/bookings/my-bookings` | List own bookings |
| POST | `/api/v1/bookings` | Create a booking |

### Admin

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/v1/admin/users` | All users |
| PATCH | `/api/v1/admin/users/:id/role` | Change a user's role |
| PATCH | `/api/v1/admin/users/:id/status` | Change a user's status |
| GET | `/api/v1/admin/equipment` | All equipment |
| PATCH | `/api/v1/admin/equipment/:id/status` | Approve or reject equipment |
| PATCH | `/api/v1/admin/equipment/:id` | Edit equipment |
| DELETE | `/api/v1/admin/equipment/:id` | Delete equipment |

## Collections

- Better Auth: `user`, `session`, `account`, `verification`, `jwks`
- App: `equipmentCollection`, `bookingsCollection`

## Deployment

Deploy to Vercel and set `MONGODB_URI` and `BETTER_AUTH_URL` (the client URL) in the project's environment variables. CORS allows the local client and the deployed client origin (`index.js`).
