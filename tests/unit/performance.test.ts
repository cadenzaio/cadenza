import { describe, it, expect, beforeAll } from "vitest";
import Cadenza from "../../src/Cadenza";
import { sleep } from "../../src/utils/promise";
import * as path from "node:path";
import * as fs from "node:fs";
import * as v8 from "node:v8";

describe("Performance", async () => {
  it("should not add too much CPU latency overhead", async () => {
    function fn(context: any) {
      context.foo += 1;
      return context;
    }

    function normalRun(context: any) {
      let _context = context;
      for (let i = 0; i < 10; i++) {
        _context = fn(_context);
      }
    }

    const task1 = Cadenza.createTask("task1", fn);
    const task2 = Cadenza.createTask("task2", fn);
    const task3 = Cadenza.createTask("task3", fn);
    const task4 = Cadenza.createTask("task4", fn);
    const task5 = Cadenza.createTask("task5", fn);
    const task6 = Cadenza.createTask("task6", fn);
    const task7 = Cadenza.createTask("task7", fn);
    const task8 = Cadenza.createTask("task8", fn);
    const task9 = Cadenza.createTask("task9", fn);
    const task10 = Cadenza.createTask("task10", fn);

    task1.then(
      task2.then(task4.then(task6, task9)),
      task3.then(task5.then(task7.then(task8, task10))),
    );

    const runner = Cadenza.runner;
    runner.setStrategy(Cadenza.runStrategy.SEQUENTIAL);

    await sleep(100);

    function graphRun(context: any) {
      runner.run(task1, context);
    }

    const graphStart = performance.now();
    for (let i = 0; i < 10000; i++) {
      graphRun({ foo: 0 });
    }
    const graphEnd = performance.now();

    const normalStart = performance.now();
    for (let i = 0; i < 10000; i++) {
      normalRun({ foo: 0 });
    }
    const normalEnd = performance.now();

    const graphRunTime = graphEnd - graphStart;
    const normalRunTime = normalEnd - normalStart;
    const difference = graphRunTime - normalRunTime;

    console.log("Standard run time:", normalRunTime);
    console.log("Graph run time:", graphRunTime);
    console.log("Difference:", difference);
    console.log("Difference per task:", difference / 10000 / 10);

    expect(difference).toBeLessThan(700);
  });

  beforeAll(() => {
    if (typeof global.gc !== "function") {
      console.warn(
        "\n⚠️  global.gc() is not available. Run with --expose-gc flag!\n" +
          "   Example: node --expose-gc node_modules/vitest/vitest.mjs run\n" +
          "   Memory leak detection will be skipped / inaccurate.\n",
      );
    }
  });

  async function forceGcNTimes(n = 5) {
    if (typeof global.gc !== "function") return;

    for (let i = 0; i < n; i++) {
      global.gc();
      // Give V8 a chance to process pending GC work
      await new Promise((r) => setImmediate(r));
    }
  }

  function getHeapUsedMB(): number {
    const used = process.memoryUsage().heapUsed;
    return Math.round(used / 1024 / 1024); // MB
  }

  function takeHeapSnapshot(label: string) {
    const dir = path.join(process.cwd(), "heap-snapshots");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `heap-${label}-${Date.now()}.heapsnapshot`);
    v8.writeHeapSnapshot(file);
    console.log(`Snapshot saved: ${file}`);
  }

  it(
    "should not leak memory across many graph executions",
    async () => {
      // ── Setup simple linear graph (10 tasks) ─────────────────────────────
      function fn(context: any) {
        context.foo = (context.foo || 0) + 1;
        return context;
      }

      const tasks = Array.from({ length: 10 }, (_, i) =>
        Cadenza.createTask(`task-${i + 1}`, fn),
      );

      // Build chain: task1 → task2 → ... → task10
      let chain = tasks[0];
      for (let i = 1; i < tasks.length; i++) {
        chain = chain.then(tasks[i]);
      }

      const runner = Cadenza.runner;
      runner.setStrategy(Cadenza.runStrategy.SEQUENTIAL);

      // Warm-up + let V8 stabilize
      await sleep(500);
      await forceGcNTimes(3);

      takeHeapSnapshot("00-baseline");

      const ITERATIONS = 100_000; // adjust depending on machine (aim ~300–900 MB peak)

      // ── Baseline measurement ─────────────────────────────────────────────
      await forceGcNTimes(4);
      const baselineHeapMB = getHeapUsedMB();
      console.log(`Baseline heap used: ${baselineHeapMB} MB`);

      // ── Stress: run many graph executions ────────────────────────────────
      const startHeap = getHeapUsedMB();
      console.log(`Starting stress – heap: ${startHeap} MB`);
      Cadenza.signalBroker.logMemoryFootprint("baseline");

      for (let i = 0; i < ITERATIONS; i++) {
        runner.run(tasks[0], { foo: 0 });
        if (i % 400 === 0) await sleep(1);
      }

      takeHeapSnapshot("01-after-loop");
      const afterLoopHeapMB = getHeapUsedMB();
      console.log(`After ${ITERATIONS} runs – heap: ${afterLoopHeapMB} MB`);
      Cadenza.signalBroker.logMemoryFootprint("after loop");

      // ── Force aggressive GC and measure again ────────────────────────────
      await sleep(500);
      await forceGcNTimes(6);

      takeHeapSnapshot("02-after-forced-gc");

      const finalHeapMB = getHeapUsedMB();
      console.log(`After forced GC – heap: ${finalHeapMB} MB`);
      Cadenza.signalBroker.logMemoryFootprint("after forced GC");

      const growthAfterGcMB = finalHeapMB - baselineHeapMB;

      console.log("");
      console.log(`Memory growth after GC: ${growthAfterGcMB} MB`);
      console.log(
        `  (per iteration: ${((growthAfterGcMB / ITERATIONS) * 1000).toFixed(2)} KB)`,
      );

      // ── Assertion ────────────────────────────────────────────────────────
      // Adjust threshold depending on your framework & machine
      // 0–5 MB is usually acceptable; > 8–12 MB after many iterations → suspicious
      expect(
        growthAfterGcMB,
        `Memory grew ${growthAfterGcMB} MB after forced GC (${((growthAfterGcMB / ITERATIONS) * 1000) | 0} bytes/iteration)`,
      ).toBeLessThan(2);

      // Optional: also fail if huge unexplained growth during the loop
      if (afterLoopHeapMB - startHeap > 600) {
        console.warn(
          `Warning: very high peak memory (${afterLoopHeapMB - startHeap} MB)`,
        );
      }
    },
    {
      timeout: 60_000,
    },
  );

  it("emit-only memory baseline", async () => {
    Cadenza.bootstrap();
    await sleep(500);
    await forceGcNTimes(5);
    const base = getHeapUsedMB();
    console.log(`Baseline: ${base} MB`);

    for (let i = 0; i < 12000; i++) {
      Cadenza.signalBroker.emit("test.perf", { foo: i, bar: "some data" + i });
    }

    await forceGcNTimes(6);
    const after = getHeapUsedMB();
    console.log(`Emit-only after: ${after} MB`);
    console.log(`Emit-only growth: ${after - base} MB`);
    expect(after - base).toBeLessThan(2);
  });

  it("should not leak memory on retries", async () => {
    let executions = 0;
    async function fn(context: any) {
      executions++;
      return { errored: true, ...context };
    }

    const RETRIES = 1000;

    const task = Cadenza.createTask("failing task", fn, "", {
      retryCount: RETRIES,
      retryDelay: 1,
    });

    const runner = Cadenza.runner;

    // Warm-up + let V8 stabilize
    await sleep(500);
    await forceGcNTimes(3);

    takeHeapSnapshot("00-baseline");

    // ── Baseline measurement ─────────────────────────────────────────────
    await forceGcNTimes(4);
    const baselineHeapMB = getHeapUsedMB();
    console.log(`Baseline heap used: ${baselineHeapMB} MB`);

    // ── Stress: run many graph executions ────────────────────────────────
    const startHeap = getHeapUsedMB();
    console.log(`Starting stress – heap: ${startHeap} MB`);
    Cadenza.signalBroker.logMemoryFootprint("baseline");

    runner.run(task, { context: [Array(10000).fill(0)] });

    while (executions < RETRIES) {
      await sleep(100);
    }

    takeHeapSnapshot("01-after-loop");
    const afterLoopHeapMB = getHeapUsedMB();
    console.log(`After ${RETRIES} retries – heap: ${afterLoopHeapMB} MB`);
    Cadenza.signalBroker.logMemoryFootprint("after loop");

    // ── Force aggressive GC and measure again ────────────────────────────
    await sleep(500);
    await forceGcNTimes(6);

    takeHeapSnapshot("02-after-forced-gc");

    const finalHeapMB = getHeapUsedMB();
    console.log(`After forced GC – heap: ${finalHeapMB} MB`);
    Cadenza.signalBroker.logMemoryFootprint("after forced GC");

    const growthAfterGcMB = finalHeapMB - baselineHeapMB;

    console.log("");
    console.log(`Memory growth after GC: ${growthAfterGcMB} MB`);
    console.log(
      `  (per iteration: ${((growthAfterGcMB / RETRIES) * 1000).toFixed(2)} KB)`,
    );

    // ── Assertion ────────────────────────────────────────────────────────
    // Adjust threshold depending on your framework & machine
    // 0–5 MB is usually acceptable; > 8–12 MB after many iterations → suspicious
    expect(
      growthAfterGcMB,
      `Memory grew ${growthAfterGcMB} MB after forced GC (${((growthAfterGcMB / RETRIES) * 1000) | 0} bytes/iteration)`,
    ).toBeLessThan(1);

    // Optional: also fail if huge unexplained growth during the loop
    if (afterLoopHeapMB - startHeap > 600) {
      console.warn(
        `Warning: very high peak memory (${afterLoopHeapMB - startHeap} MB)`,
      );
    }
  });
});
