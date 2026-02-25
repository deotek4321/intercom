# TeamPresence – P2P Time & Availability Map for Remote Teams

TeamPresence is a production-ready app built on the **Intercom** stack (Trac Network). It turns Intercom into a **decentralized presence and availability board** for distributed teams: who’s online, on-call, in deep work, or away—without a central server.

**Forked from:** [Trac-Systems/intercom](https://github.com/Trac-Systems/intercom)

---

## Features

- **P2P presence ledger (contract)**  
  - **Profiles:** `handle`, `timezone`, `hours_start`, `hours_end`, `teams[]`.  
  - **Status:** `ONLINE` | `AWAY` | `DND` | `OFFLINE` | `ON_CALL`, optional `message` and `until`.  
  - **Rotations:** per-team on-call windows (`from`, `to`, `primary`, `secondary`).

- **Strict validation**  
  Schemas and allowed states enforced in the contract; no external I/O or randomness.

- **Sidechannels**  
  Ephemeral presence updates (e.g. on `presence-global`) for live dashboards.

- **SC-Bridge**  
  WebSocket control surface for the web UI and agents (auth required).

- **Web dashboard**  
  Static SPA in `web/` that connects to SC-Bridge, subscribes to presence channels, and shows a team grid with status and timezone.

---

## Tech Stack

- **Runtime:** Node.js 22.x (or 23.x), **Pear** only (do not run with bare `node`).  
- **Core:** `trac-peer`, `trac-msb`, `trac-wallet` (pinned in `package.json`).  
- **App:** `contract/contract.js` (TeamPresenceContract), `contract/protocol.js` (TeamPresenceProtocol).  
- **Web:** Vanilla JS + CSS in `web/` (no build step).

---

## Installation

### 1. Prerequisites

- Node.js **22.x** (or 23.x). Avoid 24.x.  
- Pear: `npm install -g pear` then run `pear -v` once.

### 2. Clone and install

```bash
git clone <YOUR_FORK_URL> teampresence-intercom
cd teampresence-intercom
npm install
```

### 3. First run (admin peer)

```bash
pear run . --peer-store-name admin --msb-store-name admin-msb --subnet-channel team-presence-v1
```

Copy the **Peer writer key (hex)** from the banner; joiners need it as `--subnet-bootstrap`.

### 4. Joiner peers

```bash
pear run . --peer-store-name alice --msb-store-name alice-msb \
  --subnet-channel team-presence-v1 \
  --subnet-bootstrap <ADMIN_WRITER_KEY_HEX>
```

### 5. SC-Bridge (for the web dashboard)

Generate a token, e.g.:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start a peer with SC-Bridge:

```bash
pear run . --peer-store-name admin --msb-store-name admin-msb \
  --subnet-channel team-presence-v1 \
  --sc-bridge 1 --sc-bridge-host 127.0.0.1 --sc-bridge-port 49222 \
  --sc-bridge-token <YOUR_TOKEN> \
  --sidechannels presence-global
```

### 6. Web dashboard

1. Copy `web/config.example.js` to `web/config.local.js`.  
2. Set `SC_BRIDGE_URL` (e.g. `ws://127.0.0.1:49222`) and `SC_BRIDGE_TOKEN`.  
3. Serve the `web/` folder (e.g. `npx serve web`) and open in a browser.

`config.local.js` is in `.gitignore`; never commit tokens.

---

## Usage (contract)

From the terminal (or via SC-Bridge `/tx`):

**Set profile:**

```bash
/tx --command '{"op":"set_profile","handle":"alice","timezone":"Europe/Berlin","hours_start":"09:00","hours_end":"17:00","teams":["core"]}'
```

**Set status:**

```bash
/tx --command '{"op":"set_status","state":"ONLINE","message":"Reviewing PRs","teams":["core"]}'
```

**Read your presence:**

```bash
/tx --command '{"op":"read_my_presence"}'
```

**Set rotations:**

```bash
/tx --command '{"op":"set_rotations","team":"core","rotations":[{"from":1730000000000,"to":1730086400000,"primary":"<wallet-hex>"}]}'
```

---

## Deployment

- Run one or more long-lived Pear peers (admin + joiners).  
- Enable SC-Bridge on at least one peer for the dashboard.  
- Serve `web/` with any static server; point `SC_BRIDGE_URL` at that peer.

No hardcoded secrets; use `--sc-bridge-token` and `config.local.js`.

---

## TRAC Wallet Address

**Author / submission:**  
`trac1g0frrzwrt5q449jjma8lk4nq9q9kvl0zg9dmx86fg5shwlf8z5uq0nklre`

---

## License

Same as upstream Intercom (see `LICENSE.md`).
