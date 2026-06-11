'use strict';

const path = require('path');
const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const { ReflectionService } = require('@grpc/reflection');

const PROTO_PATH = path.join(__dirname, 'proto', 'objectstore.proto');
const PORT = process.env.PORT || 50051;

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const proto = grpc.loadPackageDefinition(packageDefinition).objectstore;

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------
const objects = new Map(); // id -> object
const watchers = new Set(); // { call, kind }

function now() {
  return new Date().toISOString();
}

function broadcast(type, object) {
  const event = { type, object, timestamp: now() };
  for (const watcher of watchers) {
    if (watcher.kind && watcher.kind !== object.kind) continue;
    try {
      watcher.call.write(event);
    } catch (err) {
      // Stream already gone; it will be cleaned up by its close handlers.
      console.error(`broadcast write failed: ${err.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------
const serviceImpl = {
  CreateObject(call, callback) {
    const { kind, name, labels } = call.request;
    if (!kind || !name) {
      return callback({
        code: grpc.status.INVALID_ARGUMENT,
        message: 'kind and name are required',
      });
    }
    const object = {
      id: crypto.randomUUID(),
      kind,
      name,
      labels: labels || {},
      created_at: now(),
    };
    objects.set(object.id, object);
    console.log(`CREATED ${object.kind}/${object.name} (${object.id}) — notifying ${watchers.size} watcher(s)`);
    broadcast('CREATED', object);
    callback(null, object);
  },

  GetObject(call, callback) {
    const object = objects.get(call.request.id);
    if (!object) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `object ${call.request.id} not found`,
      });
    }
    callback(null, object);
  },

  ListObjects(call, callback) {
    const kind = call.request.kind;
    const all = [...objects.values()].filter((o) => !kind || o.kind === kind);
    callback(null, { objects: all });
  },

  DeleteObject(call, callback) {
    const object = objects.get(call.request.id);
    if (!object) {
      return callback({
        code: grpc.status.NOT_FOUND,
        message: `object ${call.request.id} not found`,
      });
    }
    objects.delete(object.id);
    console.log(`DELETED ${object.kind}/${object.name} (${object.id}) — notifying ${watchers.size} watcher(s)`);
    broadcast('DELETED', object);
    callback(null, object);
  },

  WatchObjects(call) {
    const kind = call.request.kind || '';
    const watcher = { call, kind };

    // Optionally replay current state so the watcher starts with a snapshot.
    if (call.request.send_snapshot) {
      for (const object of objects.values()) {
        if (kind && object.kind !== kind) continue;
        call.write({ type: 'SNAPSHOT', object, timestamp: now() });
      }
    }

    watchers.add(watcher);
    console.log(`watcher connected (kind="${kind || '*'}") — ${watchers.size} active`);

    const remove = () => {
      if (watchers.delete(watcher)) {
        console.log(`watcher disconnected — ${watchers.size} active`);
      }
    };
    call.on('cancelled', remove);
    call.on('close', remove);
    call.on('error', remove);
    // Stream stays open until the client cancels/disconnects.
  },
};

// ---------------------------------------------------------------------------
// Server bootstrap
// ---------------------------------------------------------------------------
function main() {
  const server = new grpc.Server();
  server.addService(proto.ObjectStore.service, serviceImpl);

  // Reflection: lets grpcurl/grpcui/Postman discover the schema with no proto file.
  const reflection = new ReflectionService(packageDefinition);
  reflection.addToServer(server);

  // Keep long-lived watch streams healthy through Fly's proxy.
  const bindAddr = `0.0.0.0:${PORT}`;
  server.bindAsync(bindAddr, grpc.ServerCredentials.createInsecure(), (err, port) => {
    if (err) {
      console.error('failed to bind:', err);
      process.exit(1);
    }
    console.log(`ObjectStore gRPC server listening on ${bindAddr}`);
  });
}

main();
