# Crypto Options Trader

A full-stack crypto options paper trading platform featuring real-time data from Deribit, historic Mark Price charting, All-Time-High (ATH) tracking, and simulated portfolio management.

## 🚀 Features

- **Real-time Options Chain:** Live streaming options data (BTC/ETH) directly from the Deribit WebSocket API.
- **Paper Trading Engine:** Simulated portfolio initialized with $100,000 USD to practice options trading.
- **Historic Price Charts:** Interactive OHLC (Open, High, Low, Close) candlestick charts for individual options instruments.
- **ATH Tracking:** Real-time tracking of the highest Mark Price reached for every active option contract since its inception.
- **Autonomous Discovery:** Background workers continuously discover newly listed options contracts and track their mark prices seamlessly.
- **Persistent Data:** Fully migrated robust database backend powered by PostgreSQL.

## 🛠️ Tech Stack

### Frontend
- **React.js** (via Vite)
- **Recharts** (for interactive OHLC charting)
- **Tailwind CSS** (for styling)

### Backend
- **Node.js** & **Express** (REST & WebSocket APIs)
- **PostgreSQL** (Primary database for ticks, trades, positions, and ATH)
- **pg** (node-postgres connection pool)
- **Deribit API** (WebSocket streams for real-time market data)
- **PM2** (Process management in production)

## 🏗️ Project Structure

```bash
crypto-options/
├── client/           # React frontend application
│   ├── src/
│   ├── package.json
│   └── vite.config.js
├── server/           # Node.js backend application
│   ├── src/
│   │   ├── db/       # PostgreSQL initialization and queries
│   │   ├── routes/   # REST API endpoints (portfolio, trading, markPrice)
│   │   └── services/ # Deribit WebSockets & background collectors
│   ├── scripts/      # Database migration scripts
│   └── package.json
└── package.json      # Root package (if applicable)

⚙️ Setup and Installation
Prerequisites
Node.js (v20+)
PostgreSQL (v16+)

1. Database Setup
Create a PostgreSQL database and user:
CREATE DATABASE crypto_options_db;
CREATE USER crypto_options WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE crypto_options_db TO crypto_options;

2. Backend Setup
cd server
npm install
# Create environment variables
cp .env.example .env
# Edit .env with your PostgreSQL credentials:
# PGHOST=127.0.0.1
# PGPORT=5432
# PGDATABASE=crypto_options_db
# PGUSER=crypto_options
# PGPASSWORD=your_password
# Start the development server (will automatically initialize the database schema)
npm run dev

3. Frontend Setup
cd client
npm install
npm run dev
🚢 Production Deployment
This application is designed to be deployed using PM2 for the Node.js backend. The backend natively supports loading the .env file using the --env-file flag or PM2's --update-env.

# Example PM2 start command
cd server
pm2 start npm --name "crypto-options-server" -- start
