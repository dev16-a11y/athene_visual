import {
  HubConnectionBuilder,
  LogLevel,
} from "@microsoft/signalr";

const url = process.env.HUB_URL ?? "http://localhost:5080/hubs/port";
const connection = new HubConnectionBuilder()
  .withUrl(url)
  .configureLogging(LogLevel.Warning)
  .build();

let snapshots = 0;
let deltas = 0;
let lastSequence = 0;
connection.on("snapshot", (snapshot) => {
  snapshots += 1;
  lastSequence = snapshot.sequence;
  console.log(
    `snapshot seq=${snapshot.sequence} orion=${snapshot.vessels[0].completedTeu} warnings=${snapshot.warnings.length} history=${snapshot.history.length}`,
  );
});
connection.on("delta", (delta) => {
  deltas += 1;
  lastSequence = delta.sequence;
  console.log(
    `delta seq=${delta.sequence} changed=${Object.keys(delta)
      .filter((key) => !["sequence", "serverTime"].includes(key))
      .join(",")}`,
  );
});

await connection.start();
await new Promise((resolve) => setTimeout(resolve, 7_000));
await connection.stop();
console.log(`RESULT snapshots=${snapshots} deltas=${deltas} lastSequence=${lastSequence}`);
if (snapshots < 1 || deltas < 2) {
  process.exitCode = 1;
}
