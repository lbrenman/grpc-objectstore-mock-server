# gRPC ObjectStore on Fly.io

A minimal gRPC service with a Kubernetes-style **watch** pattern: open a server-streaming `WatchObjects` call in one terminal, create/delete objects from another, and see events arrive on the stream in real time.

## What's inside

```
grpc-objectstore/
├── proto/objectstore.proto   # service + message definitions (proto3)
├── proto/objectstore.pb      # compiled FileDescriptorSet (for grpcurl -protoset, Postman, etc.)
├── server.js                 # Node.js gRPC server (in-memory store + watcher broadcast)
├── package.json
├── Dockerfile
├── fly.toml                  # Fly.io config (TLS + HTTP/2 ALPN — the gRPC magic)
└── README.md
```

The server enables **gRPC reflection**, so `grpcurl`, `grpcui`, and Postman can
discover the schema without the proto file.

## Service surface

| RPC | Type | Description |
|---|---|---|
| `CreateObject` | unary | Create an object → broadcasts `CREATED` to watchers |
| `GetObject` | unary | Fetch by id |
| `ListObjects` | unary | List all (optional `kind` filter) |
| `DeleteObject` | unary | Delete by id → broadcasts `DELETED` to watchers |
| `WatchObjects` | **server-streaming** | Stream stays open; emits an event per create/delete. Optional `kind` filter and `send_snapshot` replay. |

## Run locally

```bash
npm install
npm start
# ObjectStore gRPC server listening on 0.0.0.0:50051
```

### The two-terminal demo (local)

**Terminal 1 — start watching:**
```bash
grpcurl -plaintext -d '{"send_snapshot": true}' localhost:50051 objectstore.ObjectStore/WatchObjects
```
The command blocks — the stream is open and waiting.

**Terminal 2 — create an object:**
```bash
grpcurl -plaintext -d '{"kind":"patient","name":"Ada Lovelace","labels":[{"key":"ward","value":"3B"}]}' \
  localhost:50051 objectstore.ObjectStore/CreateObject
```

Terminal 1 immediately prints:
```json
{
  "type": "CREATED",
  "object": {
    "id": "…uuid…",
    "kind": "patient",
    "name": "Ada Lovelace",
    "labels": [{ "key": "ward", "value": "3B" }],
    "created_at": "…"
  },
  "timestamp": "…"
}
```

Delete it and watch the `DELETED` event arrive:
```bash
grpcurl -plaintext -d '{"id":"<uuid-from-create>"}' localhost:50051 objectstore.ObjectStore/DeleteObject
```

Watch only one kind:
```bash
grpcurl -plaintext -d '{"kind":"order"}' localhost:50051 objectstore.ObjectStore/WatchObjects
```

## Deploy to Fly.io

```bash
# one-time
brew install flyctl        # or: curl -L https://fly.io/install.sh | sh
fly auth login

# from the project directory
fly launch --no-deploy     # accept the existing fly.toml when prompted; pick a unique app name
fly deploy
```

`fly launch` may rewrite the app name in `fly.toml` — keep the `[http_service]`
block exactly as-is. That block is what makes gRPC work on the **free shared
IPv4** (no dedicated IP needed):

- Fly's edge terminates **TLS** on port 443 and negotiates **HTTP/2** with your
  client natively (the HTTP proxy supports h2 on shared IPs)
- `h2_backend = true` tells the proxy to speak cleartext HTTP/2 (h2c) — not
  HTTP/1.1 — to the app on port 50051; gRPC is just HTTP/2 with trailers, so it
  rides through cleanly
- Your server code stays plain `createInsecure()` — no certs in the app

If the app has no public IP (DNS doesn't resolve), allocate the free shared
IPv4: `fly ips allocate-v4 --shared -a <app-name>`. Note: the alternative
raw-TCP config with `alpn = ["h2"]` passthrough requires a **dedicated** IPv4
(~$2/mo) — shared IPs don't honor custom ALPN options.

### The two-terminal demo (against Fly)

Note: **TLS is on** (drop `-plaintext`), and the port is **443**.

**Terminal 1:**
```bash
grpcurl -d '{"send_snapshot": true}' grpc-objectstore.fly.dev:443 objectstore.ObjectStore/WatchObjects
```

**Terminal 2:**
```bash
grpcurl -d '{"kind":"widget","name":"flux capacitor"}' \
  grpc-objectstore.fly.dev:443 objectstore.ObjectStore/CreateObject
```

Terminal 1 prints the `CREATED` event the moment the create lands.

List what's there:
```bash
grpcurl -d '{}' grpc-objectstore.fly.dev:443 objectstore.ObjectStore/ListObjects
```

Or explore interactively in a browser:
```bash
grpcui grpc-objectstore.fly.dev:443
```

## Node.js client snippets

**Watcher:**
```js
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');

const def = protoLoader.loadSync('proto/objectstore.proto', { keepCase: true });
const { objectstore } = grpc.loadPackageDefinition(def);

// Fly: TLS creds + port 443. Local: createInsecure() + :50051.
const client = new objectstore.ObjectStore(
  'grpc-objectstore.fly.dev:443',
  grpc.credentials.createSsl()
);

const stream = client.WatchObjects({ send_snapshot: true });
stream.on('data', (ev) => console.log(`[${ev.type}]`, ev.object.kind, ev.object.name));
stream.on('error', (err) => console.error('watch ended:', err.message));
```

**Creator:**
```js
client.CreateObject(
  { kind: "order", name: "PO-1234", labels: [{ key: "region", value: "us-east" }] },
  (err, obj) => console.log(err || obj)
);
```

## Important caveats

- **In-memory store, single machine.** `fly.toml` pins `min_machines_running = 1`
  and disables auto-stop so watchers and creators always hit the same instance.
  If you scale to 2+ machines, watchers on machine A won't see creates on
  machine B (you'd need Redis pub/sub or NATS to fan out). Don't scale this
  past 1 for the demo.
- **Data resets on restart/deploy.** It's a demo store, not a database.
- **Long-lived streams and proxies.** Fly's proxy tolerates idle gRPC streams
  well, but some corporate proxies kill idle connections; if a watch silently
  dies, add client-side keepalive options.
- **Anyone can call it.** There's no auth — don't put real data in it. Easy
  hardening if needed: check a metadata key (e.g. `x-api-key`) in a server
  interceptor.
