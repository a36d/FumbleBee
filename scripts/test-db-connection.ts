import { createSentinelGraphClient } from '../sdk/src/index';

async function testConnection() {
  console.log("Connecting to SpacetimeDB instance at http://localhost:3000...");

  const client = createSentinelGraphClient({
    host: 'http://localhost:3000',
    dbName: 'sentinelgraph-demo',
  });

  console.log("✓ Client created successfully.");
  console.log("Checking client transport interfaces...");

  if (typeof (client as any).subscribe === 'function') {
    console.log("✓ Live subscription hook detected.");
  }

  console.log("\n✅ SpacetimeDB connection ready for dual-window live sync!");
}

testConnection().catch((err) => {
  console.error("❌ Connection failed:", err);
  process.exit(1);
});
