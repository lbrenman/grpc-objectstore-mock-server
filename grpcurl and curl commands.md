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

export API_KEY="your-key-here"

# List
grpcurl -protoset proto/objectstore.pb -H "x-api-key: $API_KEY" -d '{}' \
  axway-appc-se-design.sandbox.fusion.services.axway.com:4443 \
  objectstore.ObjectStore/ListObjects

# Create
grpcurl -protoset proto/objectstore.pb -H "x-api-key: $API_KEY" \
  -d '{"kind":"patient","name":"Ada Lovelace","labels":[{"key":"ward","value":"3B"}]}' \
  axway-appc-se-design.sandbox.fusion.services.axway.com:4443 \
  objectstore.ObjectStore/CreateObject

# Get
grpcurl -protoset proto/objectstore.pb -H "x-api-key: $API_KEY" -d '{"id":"<uuid>"}' \
  axway-appc-se-design.sandbox.fusion.services.axway.com:4443 \
  objectstore.ObjectStore/GetObject

# Delete
grpcurl -protoset proto/objectstore.pb -H "x-api-key: $API_KEY" -d '{"id":"<uuid>"}' \
  axway-appc-se-design.sandbox.fusion.services.axway.com:4443 \
  objectstore.ObjectStore/DeleteObject

# Watch (streaming pass-through test)
grpcurl -protoset proto/objectstore.pb -H "x-api-key: $API_KEY" -d '{"send_snapshot":true}' \
  axway-appc-se-design.sandbox.fusion.services.axway.com:4443 \
  objectstore.ObjectStore/WatchObjects

# .proto variant
grpcurl -proto objectstore.proto -import-path proto -H "x-api-key: $API_KEY" -d '{}' \
  axway-appc-se-design.sandbox.fusion.services.axway.com:4443 \
  objectstore.ObjectStore/ListObjects
```

## 4. Fusion as REST (curl)

```bash
FUSION_REST="<your-fusion-base-path>"

# Create
curl -s -X POST "$FUSION_REST/objects" \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"kind":"patient","name":"Ada Lovelace","labels":[{"key":"ward","value":"3B"}]}' | jq

# List (all / filtered)
curl -s "$FUSION_REST/objects" -H "x-api-key: $API_KEY" | jq
curl -s "$FUSION_REST/objects?kind=patient" -H "x-api-key: $API_KEY" | jq

# Get
curl -s "$FUSION_REST/objects/<uuid>" -H "x-api-key: $API_KEY" | jq

# Delete
curl -s -X DELETE "$FUSION_REST/objects/<uuid>" -H "x-api-key: $API_KEY" | jq
```