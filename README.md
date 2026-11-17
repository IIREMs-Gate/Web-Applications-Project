# Second-Hand Digital Marketplace

A digital marketplace application designed to support the digitalisation of second-hand commerce. The platform provides structured workflows for creating and managing product listings, handling buyer offers, and building trust through seller reviews.

The project is being developed as a web application using a Node.js and Express backend with an SQLite database.

## Project Overview

The marketplace is intended to make second-hand buying and selling more organised by bringing key activities into one digital platform:

- **Digital product listings:** sellers can publish, update, search, and manage pre-owned items.
- **Offer management:** buyers can submit offers, while sellers can accept or reject them.
- **User accounts:** visitors can register, log in, and manage authenticated sessions.
- **Seller reputation:** users can view and submit reviews for sellers.
- **Administration:** authorised administrators can view and manage user accounts.

> **Current frontend status:** the `public/` page is currently a basic placeholder. The repository's main implemented functionality is in the backend API; a complete user interface is still to be developed.

## Key Features

### User authentication
- User registration and login.
- Password hashing with `bcrypt`.
- Session-based authentication.
- Logout and current-user lookup.
- Login and registration rate limiting.

### Listings
- Create, view, update, and delete listings.
- Search listings by text.
- Filter listings by status and maximum price.
- Mark a listing as active or sold.
- Upload listing photos in JPEG, PNG, or WebP format.

### Offers
- Submit an offer on another user's active listing.
- View offers made or received.
- Accept or reject offers as the listing seller.
- Withdraw an offer as the buyer.
- Automatically mark a listing as sold when an offer is accepted.

### Reviews
- View reviews associated with a seller.
- Submit a 1–5 star seller review.
- Prevent users from reviewing themselves or submitting more than one review for the same seller.
- Allow review authors or administrators to delete reviews.

### Administration
- Restrict administrative endpoints to users with the `admin` role.
- List registered users.
- Delete user accounts, with associated listing records handled by database relationships.

## Technology Stack

| Area | Technology |
|---|---|
| Runtime | Node.js |
| Backend framework | Express 5 |
| Database | SQLite |
| Database driver | `sqlite3` |
| Authentication | Express Session |
| Password security | `bcrypt` |
| Input validation | Zod |
| Request security | Helmet |
| Rate limiting | `express-rate-limit` |
| Image upload handling | Multer |
| API testing | Node.js test runner and Supertest |

## Project Structure

```text
.
├── public/
│   └── index.html              # Basic frontend placeholder
├── src/
│   ├── app.js                  # Express application and middleware setup
│   ├── config.js               # Environment-based configuration
│   ├── db.js                   # SQLite connection and database helpers
│   ├── schema.sql              # Database tables and indexes
│   ├── seed.js                 # Demo data seeding script
│   ├── server.js               # Database initialisation and HTTP startup
│   ├── uploads.js              # Listing image storage and removal
│   ├── middleware/
│   │   ├── auth.js             # Authentication, role and ownership checks
│   │   ├── idParam.js          # Route ID validation
│   │   └── validate.js         # Request body validation
│   └── routes/
│       ├── admin.js            # Administrative endpoints
│       ├── auth.js             # Registration, login and logout
│       ├── listings.js         # Listing and photo endpoints
│       ├── offers.js           # Buyer and seller offer workflows
│       └── reviews.js          # Seller review endpoints
├── test/                       # Automated tests
├── .env.example                # Example environment configuration
├── .gitignore
├── package.json
├── package-lock.json
├── LICENSE
└── README.md
```

## Getting Started

### Prerequisites

- Node.js
- npm

### 1. Clone the repository

```bash
git clone https://github.com/IIREMs-Gate/Web-Applications-Project.git
cd Web-Applications-Project
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Configure environment variables

Create a local `.env` file from the example:

```bash
cp .env.example .env
```

Set a strong, unique session secret in `.env`. It must contain at least 32 characters and must not use the example placeholder.

Available configuration variables:

| Variable | Purpose | Default |
|---|---|---|
| `SESSION_SECRET` | Secret used to sign session cookies; required | No default |
| `PORT` | Port used by the HTTP server | `3000` |
| `DB_PATH` | SQLite database file path | `marketplace.db` |
| `UPLOAD_DIR` | Directory used to store uploaded images | `uploads` |
| `NODE_ENV` | Runtime environment; affects secure cookie settings | Not set |

Example:

```env
SESSION_SECRET=replace-this-with-a-long-random-secret-value
PORT=3000
DB_PATH=marketplace.db
UPLOAD_DIR=uploads
```

Keep `.env` private. Do not commit real secrets or credentials to the repository.

### 4. Start the application

```bash
npm start
```

The server starts on the configured port. With the default configuration, open:

```text
http://localhost:3000
```

The database schema is initialised when the server starts. The current page at `/` is a frontend placeholder; API endpoints can be tested with an API client such as Postman.

### 5. Load demo data (optional)

```bash
npm run seed
```

**Warning:** the seed script clears the existing marketplace tables and repopulates them with demonstration users, listings, offers, and reviews. Do not run it against a database containing data you want to keep.

## API Reference

All API responses use JSON unless an endpoint returns an empty response. Protected routes require an authenticated session. The login endpoint establishes a session; send the session cookie with subsequent requests.

### Health

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/health` | Check whether the API is responding | Public |

### Authentication

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `POST` | `/api/auth/register` | Register a user account | Public |
| `POST` | `/api/auth/login` | Log in and create a session | Public |
| `POST` | `/api/auth/logout` | End the current session | Public |
| `GET` | `/api/auth/me` | Get the currently authenticated user | Authenticated |

Registration accepts a username, email, password, and optional phone number. User passwords are stored as hashes rather than plain text.

### Listings

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/listings` | List and search listings | Public |
| `GET` | `/api/listings/:id` | Get a listing by ID | Public |
| `POST` | `/api/listings` | Create a listing | Authenticated |
| `PUT` | `/api/listings/:id` | Update a listing | Owner or admin |
| `DELETE` | `/api/listings/:id` | Delete a listing | Owner or admin |
| `POST` | `/api/listings/:id/photo` | Upload or replace a listing photo | Owner or admin |

The listing search endpoint supports the `q`, `status`, and `max_price` query parameters. Listing prices are represented in the API as integer minor units (`price_cents`).

Photo uploads use the multipart form field `photo`. JPEG, PNG, and WebP images are accepted, with a maximum upload size of 2 MB.

### Offers

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `POST` | `/api/listings/:id/offers` | Make an offer on a listing | Authenticated |
| `GET` | `/api/offers` | List offers made or received by the user | Authenticated |
| `GET` | `/api/offers/:id` | Get an offer | Offer participant or admin |
| `PATCH` | `/api/offers/:id` | Accept or reject an offer | Listing seller or admin |
| `DELETE` | `/api/offers/:id` | Withdraw an offer | Offer buyer or admin |

An offer request includes `amount_cents` and may include a `message`. An offer status update accepts `accepted` or `rejected`.

### Reviews

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/users/:id/reviews` | List reviews for a seller | Public |
| `POST` | `/api/users/:id/reviews` | Submit a seller review | Authenticated |
| `DELETE` | `/api/reviews/:id` | Delete a review | Review author or admin |

A review includes a `rating` from 1 to 5 and a text `body`.

### Administration

| Method | Endpoint | Description | Access |
|---|---|---|---|
| `GET` | `/api/admin/users` | List registered users | Admin |
| `DELETE` | `/api/admin/users/:id` | Delete a user account | Admin |

## Validation and Security

The application includes several backend safeguards:

- `bcrypt` password hashing.
- Session cookies configured with `httpOnly` and `sameSite` options.
- Secure cookies when `NODE_ENV=production`.
- Helmet security headers.
- Rate limiting on registration and login.
- Zod validation for request bodies and query parameters.
- Authentication, role-based access control, and ownership checks.
- Listing photo type checks based on file contents, with a 2 MB upload limit.
- Parameterised SQL queries for database operations.

For production deployment, configure a strong session secret, use HTTPS, review session storage and database backup arrangements, and keep dependencies updated.

## Running Tests

Run the automated test suite with:

```bash
npm test
```

The project uses Node.js's built-in test runner. Supertest is included as a development dependency for HTTP-level tests.

## Development Notes

- The database is SQLite and is created/initialised from `src/schema.sql`.
- The default database file is `marketplace.db`.
- Uploaded images are stored in the configured upload directory.
- The `seed` command is intended for local demonstration and development data only.
- The frontend is not yet a complete application interface; the current `public/index.html` is a placeholder.

## Contributing

1. Create or switch to the branch assigned to your work.
2. Make changes within the scope of that task.
3. Run the test suite using `npm test`.
4. Review your changes with `git diff` and `git status`.
5. Commit your work with a clear commit message.
6. Push to your assigned remote branch and open a pull request when the team is ready to review integration.

Avoid committing `.env`, local database files, uploaded user content, or other generated files.

## License

This project is distributed under the MIT License. See the [LICENSE](LICENSE) file for details.
