const timestamps = [100, 0, -100, -200, -300, -400, -500];
const fps = 10;
const fc = 4;
for (const blockNow of timestamps) {
  const m = Math.floor(blockNow / (1000 / fps));
  const frameIndex = ((m % fc + fc) % fc);
  const oldFrame = (Math.floor(blockNow / (1000/fps))) % fc;
  console.log(`blockNow=${blockNow} | m=${m} | old=${oldFrame} | new=${frameIndex}`);
}
