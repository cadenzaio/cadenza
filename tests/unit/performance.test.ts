import { describe, it, expect } from "vitest";
import Cadenza from "../../src/Cadenza";
import { sleep } from "../../src/utils/promise";

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
});
