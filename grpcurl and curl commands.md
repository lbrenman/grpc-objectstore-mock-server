# grpcurl and curl commands

## 1. Local (plaintext, port 50051)

```bash
# Discovery
grpcurl -plaintext localhost:50051 list
grpcurl -plaintext localhost:50051 describe objectstore.ObjectStore

# CRUD
grpcurl -plaintext -d '{"kind":"patient","name":"Ada Lovelace","labels":[{"key":"ward","value":"3B"}]}' \
  localhost:50051 objectstore.ObjectStore/CreateObject

grpcurl -plaintext -d '{}' localhost:50051 objectstore.ObjectStore/ListObjects
grpcurl -plaintext -d '{"kind":"patient"}' localhost:50051 objectstore.ObjectStore/ListObjects
grpcurl -plaintext -d '{"id":"<uuid>"}' localhost:50051 objectstore.ObjectStore/GetObject
grpcurl -plaintext -d '{"id":"<uuid>"}' localhost:50051 objectstore.ObjectStore/DeleteObject

# Watch (blocks; run create/delete in another terminal)
grpcurl -plaintext -d '{"send_snapshot":true}' localhost:50051 objectstore.ObjectStore/WatchObjects
grpcurl -plaintext -d '{"kind":"order"}' localhost:50051 objectstore.ObjectStore/WatchObjects
```

## 2. Fly.io direct (TLS, port 443, reflection works)

Same commands — drop `-plaintext`, swap the host:

```bash
grpcurl grpc-objectstore.fly.dev:443 list

grpcurl -d '{"kind":"patient","name":"Ada Lovelace","labels":[{"key":"ward","value":"3B"}]}' \
  grpc-objectstore.fly.dev:443 objectstore.ObjectStore/CreateObject

grpcurl -d '{}' grpc-objectstore.fly.dev:443 objectstore.ObjectStore/ListObjects
grpcurl -d '{"id":"<uuid>"}' grpc-objectstore.fly.dev:443 objectstore.ObjectStore/GetObject
grpcurl -d '{"id":"<uuid>"}' grpc-objectstore.fly.dev:443 objectstore.ObjectStore/DeleteObject

# Watch
grpcurl -d '{"send_snapshot":true}' grpc-objectstore.fly.dev:443 objectstore.ObjectStore/WatchObjects

# Useful extras
grpcurl -v -d '{}' grpc-objectstore.fly.dev:443 objectstore.ObjectStore/ListObjects   # headers/trailers/timing
grpcurl -d '{"id":"nope"}' grpc-objectstore.fly.dev:443 objectstore.ObjectStore/GetObject  # NotFound test
```

## 3. Fusion as gRPC (TLS, port 4443, no reflection → needs the schema)

Run from your project directory (or adjust the `-protoset`/`-proto` path):

```bash
# Using the compiled descriptor
grpcurl -protoset proto/objectstore.pb -d '{}' \
  axway-appc-se-design.sandbox.fusion.services.axway.com:4443 \
  objectstore.ObjectStore/ListObjects

grpcurl -protoset proto/objectstore.pb \
  -d '{"kind":"patient","name":"Ada Lovelace","labels":[{"key":"ward","value":"3B"}]}' \
  axway-appc-se-design.sandbox.fusion.services.axway.com:4443 \
  objectstore.ObjectStore/CreateObject

grpcurl -protoset proto/objectstore.pb -d '{"id":"<uuid>"}' \
  axway-appc-se-design.sandbox.fusion.services.axway.com:4443 \
  objectstore.ObjectStore/GetObject

grpcurl -protoset proto/objectstore.pb -d '{"id":"<uuid>"}' \
  axway-appc-se-design.sandbox.fusion.services.axway.com:4443 \
  objectstore.ObjectStore/DeleteObject

# Watch through the proxy — the streaming pass-through test
grpcurl -protoset proto/objectstore.pb -d '{"send_snapshot":true}' \
  axway-appc-se-design.sandbox.fusion.services.axway.com:4443 \
  objectstore.ObjectStore/WatchObjects

# Equivalent using the .proto source instead of the .pb
grpcurl -proto objectstore.proto -import-path proto -d '{}' \
  axway-appc-se-design.sandbox.fusion.services.axway.com:4443 \
  objectstore.ObjectStore/ListObjects
```

## 4. Fusion as REST (curl)

I don't know the paths/methods you configured in your Fusion flows, so these use a placeholder base URL and the obvious resource mapping — adjust to match your actual proxy design:

```bash
FUSION_REST="<your-fusion-base-path>"

# Create
curl -s -X POST "$FUSION_REST/objects" \
  -H "Content-Type: application/json" \
  -d '{"kind":"patient","name":"Ada Lovelace","labels":[{"key":"ward","value":"3B"}]}' | jq

# List (all / filtered)
curl -s "$FUSION_REST/objects" | jq
curl -s "$FUSION_REST/objects?kind=patient" | jq

# Get / Delete
curl -s "$FUSION_REST/objects/<uuid>" | jq
curl -s -X DELETE "$FUSION_REST/objects/<uuid>" | jq

# If your flow requires an API key or auth header:
curl -s "$FUSION_REST/objects" -H "X-Api-Key: $API_KEY" | jq
```

Note there's no REST equivalent for `WatchObjects` unless you built one — a streaming gRPC method doesn't map to a plain request/response. If you exposed it via Fusion's SSE support (like your earlier streaming chat app), it'd be:

```bash
curl -N "$FUSION_REST/objects/watch"   # -N disables buffering for SSE
```