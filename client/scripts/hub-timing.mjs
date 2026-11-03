import { HubConnectionBuilder, LogLevel } from "@microsoft/signalr";

const connection = new HubConnectionBuilder()
  .withUrl("http://127.0.0.1:5080/hubs/port")
  .configureLogging(LogLevel.Error)
  .build();

const rows = [];
let first = null;
connection.on("snapshot", (snapshot) => {
  first = snapshot;
  console.log(
    `snapshot seq=${snapshot.sequence} serverTime=${snapshot.serverTime} local=${new Date().toISOString()}`,
  );
});
connection.on("delta", (delta) => {
  const truck = delta.trucks.find((item) => item.id === "truck-01");
  const now = Date.now();
  if (!first) return;
  rows.push({
    now,
    serverTime: delta.serverTime ?? delta.updatedAt,
    updatedAt: truck.updatedAt,
    x: truck.position.x,
    z: truck.position.z,
  });
});

await connection.start();
await new Promise((resolve) => setTimeout(resolve, 12500));
await connection.stop();

for (const row of rows) {
  const serverMs = Date.parse(row.updatedAt);
  console.log(
    `local=${new Date(row.now).toISOString().slice(11, 23)} ` +
      `updatedAt=${row.updatedAt.slice(11, 23)} ` +
      `skew=${row.now - serverMs}ms x=${row.x} z=${row.z}`,
  );
}
for (let index = 1; index < rows.length; index += 1) {
  const previous = rows[index - 1];
  const current = rows[index];
  console.log(
    `  Δlocal=${current.now - previous.now}ms Δserver=${Date.parse(current.updatedAt) - Date.parse(previous.updatedAt)}ms ` +
      `Δx=${(current.x - previous.x).toFixed(2)}`,
  );
}
