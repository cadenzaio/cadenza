import Cadenza from "../Cadenza";
import Task from "../graph/definition/Task";
import GraphRoutine from "../graph/definition/GraphRoutine";
import { AnyObject } from "../types/global";

export default class GraphRegistry {
  private static _instance: GraphRegistry;
  public static get instance(): GraphRegistry {
    if (!this._instance) this._instance = new GraphRegistry();
    return this._instance;
  }

  private tasks: Map<string, Task> = new Map();
  private routines: Map<string, GraphRoutine> = new Map();

  registerTask: Task;
  updateTaskId: Task;
  updateTaskInputSchema: Task;
  updateTaskOutputSchema: Task;
  getTaskById: Task;
  getTaskByName: Task;
  getTasksByLayer: Task;
  getAllTasks: Task;
  doForEachTask: Task;
  deleteTask: Task;
  registerRoutine: Task;
  updateRoutineId: Task;
  getRoutineById: Task;
  getRoutineByName: Task;
  getAllRoutines: Task;
  doForEachRoutine: Task;
  deleteRoutine: Task;

  private constructor() {
    // Hardcode seed MetaTask (observes on existing broker)
    this.registerTask = new Task(
      "Register task",
      (context: AnyObject) => {
        const { __task } = context;
        if (__task && !this.tasks.has(__task.id)) {
          this.tasks.set(__task.id, __task);
        }
        return true;
      },
      "Registers tasks. Seed for meta.taskCreated",
      0,
      0,
      true,
      false,
      true,
    ).doOn("meta.task.created");

    // Manual seed register
    this.tasks.set(this.registerTask.id, this.registerTask);

    this.updateTaskId = Cadenza.createMetaTask(
      "Update task id",
      (context) => {
        const { __id, __oldId } = context;
        const task = this.tasks.get(__oldId);
        if (!task) return context;
        this.tasks.set(__id, task);
        this.tasks.delete(__oldId);
        return context;
      },
      "Updates task id.",
    ).doOn("meta.task.global_id_set");

    this.updateTaskInputSchema = Cadenza.createMetaTask(
      "Update task input schema",
      (context) => {
        const { __id, __schema } = context;
        const task = this.tasks.get(__id);
        if (!task) return true;
        task.setInputContextSchema(__schema);
        return true;
      },
      "Updates task input schema.",
    ).doOn("meta.task.input_schema_updated");

    this.updateTaskOutputSchema = Cadenza.createMetaTask(
      "Update task input schema",
      (context) => {
        const { __id, __schema } = context;
        const task = this.tasks.get(__id);
        if (!task) return true;
        task.setOutputContextSchema(__schema);
        return true;
      },
      "Updates task input schema.",
    ).doOn("meta.task.output_schema_updated");

    this.getTaskById = Cadenza.createMetaTask(
      "Get task by id",
      (context) => {
        const { __id } = context;
        return { ...context, __task: this.tasks.get(__id) };
      },
      "Gets task by id.",
    );

    this.getTaskByName = Cadenza.createMetaTask(
      "Get task by name",
      (context) => {
        const { __name } = context;
        for (const task of this.tasks.values()) {
          if (task.name === __name) {
            return { ...context, __task: task };
          }
        }
        return context;
      },
      "Gets task by name (first match).",
    );

    this.getTasksByLayer = Cadenza.createMetaTask(
      "Get tasks by layer",
      (context) => {
        const { __layerIndex } = context;
        const layerTasks = Array.from(this.tasks.values()).filter(
          (task) => task.layerIndex === __layerIndex,
        );
        return { ...context, __tasks: layerTasks };
      },
      "Gets tasks by layer index.",
    );

    this.getAllTasks = Cadenza.createMetaTask(
      "Get all tasks",
      (context) => ({ ...context, __tasks: Array.from(this.tasks.values()) }), // Use arrow to capture this
      "Gets all tasks.",
    );

    this.doForEachTask = Cadenza.createMetaTask(
      "Do for each task",
      function* (context: AnyObject) {
        // @ts-ignore
        for (const task of this.tasks.values()) {
          yield { ...context, __task: task };
        }
      }.bind(this), // Bind to capture this in generator
      "Yields each task for branching.",
    );

    this.deleteTask = Cadenza.createMetaTask(
      "Delete task",
      (context) => {
        const { __id } = context;
        this.tasks.delete(__id);
        return context;
      },
      "Deletes task.",
    ).doOn("meta.task.destroyed");

    this.registerRoutine = Cadenza.createMetaTask(
      "Register routine",
      (context) => {
        const { __routine } = context;
        if (__routine && !this.routines.has(__routine.id)) {
          this.routines.set(__routine.id, __routine);
        }
        return true;
      },
      "Registers routine.",
    ).doOn("meta.routine.created");

    this.updateRoutineId = Cadenza.createMetaTask(
      "Update routine id",
      (context) => {
        const { __id, __oldId } = context;
        const routine = this.routines.get(__oldId);
        if (!routine) return context;
        this.routines.set(__id, routine);
        this.routines.delete(__oldId);
        return context;
      },
      "Updates routine id.",
    ).doOn("meta.routine.global_id_set");

    this.getRoutineById = Cadenza.createMetaTask(
      "Get routine by id",
      (context) => {
        const { __id } = context;
        return { ...context, routine: this.routines.get(__id) };
      },
      "Gets routine by id.",
    );

    this.getRoutineByName = Cadenza.createMetaTask(
      "Get routine by name",
      (context) => {
        const { __name } = context;
        for (const routine of this.routines.values()) {
          if (routine.name === __name) {
            return { ...context, __routine: routine };
          }
        }
        return context;
      },
      "Gets routine by name.",
    );

    this.getAllRoutines = Cadenza.createMetaTask(
      "Get all routines",
      (context) => ({
        ...context,
        __routines: Array.from(this.routines.values()),
      }), // Use arrow to capture this
      "Gets all routines.",
    );

    this.doForEachRoutine = Cadenza.createMetaTask(
      "Do for each routine",
      function* (context: AnyObject) {
        // @ts-ignore
        for (const routine of this.routines.values()) {
          yield { ...context, __routine: routine };
        }
      }.bind(this),
      "Yields each routine.",
    );

    this.deleteRoutine = Cadenza.createMetaTask(
      "Delete routine",
      (context) => {
        const { __id } = context;
        this.routines.delete(__id);
        return context;
      },
      "Deletes routine.",
    );
  }

  reset() {
    this.tasks.clear();
    this.routines.clear();
    this.tasks.set(this.registerTask.id, this.registerTask);
  }
}
