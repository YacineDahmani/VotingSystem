# Voting System

A digital voting platform inspired by the Swiss design aesthetic. Features a streamlined voter journey with cryptographic receipts, real-time results tallies, and an administrative operations dashboard.

---

## Features

### 🗳️ Voter Experience
- **Simple Onboarding**: Join using an 8-character session code, direct invite link (`/?code=XXXX`), or scannable mobile QR code.
- **Voter Verification**: Optional voter eligibility lists supporting Name, Birthdate, and Voter ID.
- **Vote Confirmation**: Clear selection review modal before casting.
- **Cryptographic Receipt**: Receive a unique verification code (`SWISS-XXXX-XXXX-XXXX`) upon ballot submission.
- **Waiting Room**: Real-time pendulum waiting screen with receipt badge until polls close.

### ⚙️ Admin Operations
- **Election Management**: Create, open, close, draft, and delete multiple elections.
- **Roster Configuration**: Add and remove candidates with platform statements or import via CSV/JSON.
- **Voter Eligibility Import**: Upload voter rosters (CSV/TSV/JSON) with sample template download.
- **Share & QR Codes**: 1-click invite link copying, 8-digit session codes, and high-resolution mobile QR codes.
- **Dedicated Live Results**: Real-time candidate leaderboard, demographic breakdown by age groups, and turnout metrics.
- **Simulation Sandbox**: Isolated mock vote injector with integrity audit reports tracking real vs. simulated votes.

---

## Tech Stack

- **Backend**: Node.js, Express, SQLite, Socket.IO, JWT, bcrypt
- **Frontend**: React 19, Vite, Tailwind CSS v4, Lucide Icons, Framer Motion

---

## Getting Started

### 1. Configure Environment Variables

The backend requires `ADMIN_MASTER_KEY` at startup.

**PowerShell:**
```powershell
$env:ADMIN_MASTER_KEY='your-admin-password'
$env:JWT_SECRET='your-jwt-secret' # optional
```

**Bash / Linux / macOS:**
```bash
export ADMIN_MASTER_KEY='your-admin-password'
export JWT_SECRET='your-jwt-secret' # optional
```

### 2. Start the Backend

```bash
cd backend
npm install
npm start
```
API runs on `http://localhost:3000`.

### 3. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```
Application runs on `http://localhost:5173`.

---

## Testing

Run the automated test suite in the backend directory:

```bash
cd backend
npm test
```

---

## Credits

Developed by **Yacine Dahmani**
