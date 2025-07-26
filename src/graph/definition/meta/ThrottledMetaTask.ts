import ThrottledTask from "../ThrottledTask";

export default class ThrottledMetaTask extends ThrottledTask {
  readonly isMeta: boolean = true;
}
