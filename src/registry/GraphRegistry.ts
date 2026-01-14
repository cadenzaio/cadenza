import Cadenza from "../Cadenza";
import Task from "../graph/definition/Task";
import GraphRoutine from "../graph/definition/GraphRoutine";
import { AnyObject } from "../types/global";

/**
 * This class serves as a registry for managing tasks and routines within a graph-based execution model.
 * It provides functionalities to register, update, retrieve, delete, and iterate over tasks and routines.
 */
export default class GraphRegistry {
  static _instance: GraphRegistry;
  public static get instance(): GraphRegistry {
    if (!this._instance) this._instance = new GraphRegistry();
    return this._instance;
  }

  tasks: Map<string, Task> = new Map();
  routines: Map<string, GraphRoutine> = new Map();

  registerTask: Task;
  updateTaskInputSchema: Task;
  updateTaskOutputSchema: Task;
  getTaskByName: Task;
  getTasksByLayer: Task;
  getAllTasks: Task;
  doForEachTask: Task;
  deleteTask: Task;
  registerRoutine: Task;
  getRoutineByName: Task;
  getAllRoutines: Task;
  doForEachRoutine: Task;
  deleteRoutine: Task;

  /**
   * Constructs a new instance and sets up various meta tasks and routines.
   *
   * This constructor initializes several predefined tasks for managing operations
   * like registering tasks, updating schemas for tasks, fetching tasks or routines,
   * and performing actions on all tasks or routines. It also initializes routines
   * to handle similar operations and hardcodes the initial meta tasks and routines.
   *
   * It initializes the instance state by setting up tasks and routines.
   */
  constructor() {
    // Hardcode seed MetaTask (observes on existing broker)
    this.registerTask = new Task(
      "Register task",
      (context: AnyObject) => {
        const { taskInstance } = context;
        if (taskInstance && !this.tasks.has(taskInstance.name)) {
          this.tasks.set(taskInstance.name, taskInstance);
        }
        delete context.taskInstance;
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
    this.tasks.set(this.registerTask.name, this.registerTask);

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

    this.getTaskByName = Cadenza.createMetaTask(
      "Get task by name",
      (context) => {
        const { __name } = context;
        for (const task of this.tasks.values()) {
          if (task.name === __name) {
            return { ...context, task };
          }
        }
        return false;
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
        return { ...context, tasks: layerTasks };
      },
      "Gets tasks by layer index.",
    );

    this.getAllTasks = Cadenza.createMetaTask(
      "Get all tasks",
      (context) => ({ ...context, tasks: Array.from(this.tasks.values()) }), // Use arrow to capture this
      "Gets all tasks.",
    );

    this.doForEachTask = Cadenza.createMetaTask(
      "Do for each task",
      function* (context: AnyObject) {
        // @ts-ignore
        for (const task of this.tasks.values()) {
          yield { ...context, task };
        }
      }.bind(this), // Bind to capture this in generator
      "Yields each task for branching.",
    );

    this.deleteTask = Cadenza.createMetaTask(
      "Delete task",
      (context) => {
        const { filter } = context;
        this.tasks.delete(filter.name);
        return context;
      },
      "Deletes task.",
    ).doOn("meta.task.destroyed");

    this.registerRoutine = Cadenza.createMetaTask(
      "Register routine",
      (context) => {
        const { routineInstance } = context;
        if (routineInstance && !this.routines.has(routineInstance.name)) {
          this.routines.set(routineInstance.name, routineInstance);
        }
        delete context.routineInstance;
        return true;
      },
      "Registers routine.",
    ).doOn("meta.routine.created");

    this.getRoutineByName = Cadenza.createMetaTask(
      "Get routine by name",
      (context) => {
        const { __name } = context;
        for (const routine of this.routines.values()) {
          if (routine.name === __name) {
            return { ...context, routine };
          }
        }
        return false;
      },
      "Gets routine by name.",
    );

    this.getAllRoutines = Cadenza.createMetaTask(
      "Get all routines",
      (context) => ({
        ...context,
        routines: Array.from(this.routines.values()),
      }), // Use arrow to capture this
      "Gets all routines.",
    );

    this.doForEachRoutine = Cadenza.createMetaTask(
      "Do for each routine",
      function* (context: AnyObject) {
        // @ts-ignore
        for (const routine of this.routines.values()) {
          yield { ...context, routine: routine };
        }
      }.bind(this),
      "Yields each routine.",
    );

    this.deleteRoutine = Cadenza.createMetaTask(
      "Delete routine",
      (context) => {
        const { __name } = context;
        this.routines.delete(__name);
        return context;
      },
      "Deletes routine.",
    );
  }

  reset() {
    this.tasks.clear();
    this.routines.clear();
  }
}
