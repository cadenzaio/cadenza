import DebounceTask from "../DebounceTask";

export default class DebouncedMetaTask extends DebounceTask {
  readonly isMeta: boolean = true;
}
