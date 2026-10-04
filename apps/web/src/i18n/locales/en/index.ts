import common from "./common.json";
import dashboard from "./dashboard.json";
import desktop from "./desktop.json";
import editor from "./editor.json";
import errors from "./errors.json";
import panels from "./panels.json";
import workspace from "./workspace.json";

export default {
  ...common,
  ...dashboard,
  ...editor,
  ...workspace,
  ...panels,
  ...errors,
  ...desktop,
};
