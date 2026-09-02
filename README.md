# 🍄 Mushroom Kingdom 🍄

A multiplayer game starter built with React Three Fiber (R3F), Node.js, WebSockets, and Vite.

Mobile controls using nippleJS and WASD movement controls on desktop.

![React Three Fiber Multiplayer Game](/screenshot.png)

## Installation

- Use Node.js 20.19 or newer.
- Install dependencies:

```bash
npm install
```

## Usage

Run the full development app, including the Express/WebSocket server and Vite middleware:

```bash
npm run dev
```

Open `http://localhost:8080`.


Build production assets:

```bash
npm run build
```

Run the production server after a build:

```bash
npm start
```

Build and run production locally:

```bash
npm run preview
```

## Voice chat

Peer-to-peer WebRTC. The server relays signalling and serves the ICE server list from
`/ice-servers`.

**A deployment needs a TURN relay.** Without one, voice works between some pairs of players and
not others, with no error on either side. Create a TURN Server app at **dash.cloudflare.com ->
Realtime -> TURN** and set `TURN_TOKEN_ID` and `TURN_API_TOKEN`.

`/ice-servers` is public, so it never serves the key itself - it exchanges it for a credential
that expires after two hours. If Cloudflare cannot be reached, voice degrades to STUN rather than
taking the game down.

## Contributing

Pull requests are welcome. For major changes, please open an issue first
to discuss what you would like to change.

Suggestions for improving the server and WebSocket flow would be much appreciated.

## License

[MIT](https://choosealicense.com/licenses/mit/)

## 3D Assets

[Nature Pack](https://quaternius.com/)
