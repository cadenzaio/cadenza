import GraphVisitor from "../../../interfaces/GraphVisitor";
import SyncGraphLayer from "../../../graph/execution/SyncGraphLayer";
import GraphNode from "../../../graph/execution/GraphNode";
import Task from "../../../graph/definition/Task";
import ColorRandomizer from "../../../utils/ColorRandomizer";

export default class VueFlowExportVisitor implements GraphVisitor {
  nodeCount = 0;
  elements: any[] = [];
  index = 0;
  numberOfLayerNodes = 0;
  contextToColor: { [id: string]: string } = {};
  colorRandomizer = new ColorRandomizer();

  visitLayer(layer: SyncGraphLayer): any {
    const snapshot = layer.export();

    this.numberOfLayerNodes = snapshot.__numberOfNodes;
    this.index = 0;
  }

  visitNode(node: GraphNode): any {
    const snapshot = node.export();

    if (!this.contextToColor[snapshot.__context.id]) {
      this.contextToColor[snapshot.__context.id] =
        this.colorRandomizer.getRandomColor();
    }

    const color = this.contextToColor[snapshot.__context.id];

    this.elements.push({
      id: snapshot.__id.slice(0, 8),
      label: snapshot.__task.__name,
      position: {
        x: snapshot.__task.__layerIndex * 500,
        y: -50 * this.numberOfLayerNodes * 0.5 + (this.index * 60 + 30),
      },
      sourcePosition: "right",
      targetPosition: "left",
      style: { backgroundColor: `${color}`, width: "180px" },
      data: {
        executionTime: snapshot.__executionTime,
        executionStart: snapshot.__executionStart,
        executionEnd: snapshot.__executionEnd,
        description: snapshot.__task.__description,
        functionString: snapshot.__task.__functionString,
        context: snapshot.__context.context,
        layerIndex: snapshot.__task.__layerIndex,
      },
    });

    for (const [index, nextNodeId] of snapshot.__nextNodes.entries()) {
      this.elements.push({
        id: `${snapshot.__id.slice(0, 8)}-${index}`,
        source: snapshot.__id.slice(0, 8),
        target: nextNodeId.slice(0, 8),
      });
    }

    this.index++;
    this.nodeCount++;
  }

  visitTask(task: Task) {
    const snapshot = task.export();

    this.elements.push({
      id: snapshot.__id.slice(0, 8),
      label: snapshot.__name,
      position: { x: snapshot.__layerIndex * 300, y: this.index * 50 + 30 },
      sourcePosition: "right",
      targetPosition: "left",
      data: {
        description: snapshot.__description,
        functionString: snapshot.__functionString,
        layerIndex: snapshot.__layerIndex,
      },
    });

    for (const [index, nextTaskId] of snapshot.__nextTasks.entries()) {
      this.elements.push({
        id: `${snapshot.__id.slice(0, 8)}-${index}`,
        source: snapshot.__id.slice(0, 8),
        target: nextTaskId.slice(0, 8),
      });
    }

    this.index++;
    this.nodeCount++;
  }

  getElements() {
    return this.elements;
  }

  getNodeCount() {
    return this.nodeCount;
  }
}
