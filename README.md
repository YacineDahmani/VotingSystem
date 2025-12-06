# Voting System (Web Version)

This project is a web-based implementation of a voting system, serving as the modern evolution of a previous C-based program (`votingsystem.c`). It features a Node.js/Express backend with an SQLite database and a vanilla JavaScript/HTML/CSS frontend.

## Project Structure

- **frontend/**: Contains the user interface (HTML, CSS, JavaScript).
- **backend/**: Contains the server logic (Node.js), database handling, and API endpoints.

## Features

- **Voter Registration**: Users can register with their name and age (must be 18+).
- **Voting**: Secure voting mechanism where users select a candidate.
- **Real-time Results**: View current vote counts and percentages.
- **Admin Dashboard**: Special capabilities for election management (reset election, ban candidates, fake votes for testing, fraud detection).

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher recommended)
- npm (Node Package Manager)

## Installation & Setup

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd VotingSystem
    ```

2.  Navigate to the backend directory and install dependencies:
    ```bash
    cd backend
    npm install
    ```

## Running the Application

1.  Start the server from the `backend` directory:
    ```bash
    npm start
    ```
    Or directly:
    ```bash
    node server.js
    ```

2.  Open your web browser and visit:
    ```
    http://localhost:3000
    ```

## Admin Access

The default admin password is configured in the database initialization (default: `admin`).

## Notes

- The system uses an SQLite database (`voting.db`) which is created automatically in the `backend` folder if it doesn't exist.
- `.gitignore` is configured to exclude the database file and `node_modules`.
