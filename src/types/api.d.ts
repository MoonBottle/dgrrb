interface IResGetNotebookConf {
  box: string;
  conf: NotebookConf;
  name: string;
}

interface IReslsNotebooks {
  notebooks: Notebook[];
}

interface IResUpload {
  errFiles: string[];
  succMap: { [key: string]: string };
}

interface IResdoOperations {
  doOperations: doOperation[];
  undoOperations: doOperation[] | null;
}

interface IResGetBlockKramdown {
  id: BlockId;
  kramdown: string;
}

interface IResGetChildBlock {
  id: BlockId;
  type: BlockType;
  subtype?: BlockSubType;
}

interface IResGetTemplates {
  content: string;
  path: string;
}

interface IResReadDir {
  isDir: boolean;
  isSymlink: boolean;
  name: string;
}

interface IResExportMdContent {
  hPath: string;
  content: string;
}

interface IResBootProgress {
  progress: number;
  details: string;
}

interface IResForwardProxy {
  body: string;
  contentType: string;
  elapsed: number;
  headers: { [key: string]: string };
  status: number;
  url: string;
}

interface IResExportResources {
  path: string;
}

// **************************************** Attribute View (Database / AV) ****************************************

type TAVCol =
  | "text"
  | "date"
  | "number"
  | "relation"
  | "rollup"
  | "select"
  | "block"
  | "mSelect"
  | "url"
  | "email"
  | "phone"
  | "mAsset"
  | "template"
  | "created"
  | "updated"
  | "checkbox"
  | "lineNumber";

type IAVKey = {
  id: AvKeyId;
  name: string;
  type: TAVCol;
  icon?: string;
  // 其他字段（options/relation/rollup/numberFormat...）随版本变化，保持宽松
  [key: string]: any;
};

type IAVView = {
  id: AvViewId;
  name: string;
  icon?: string;
  type?: string;
  layoutType?: string;
  [key: string]: any;
};

interface IResGetAttributeView {
  id: AvId;
  blockID: BlockId;
  name: string;
  icon?: string;
  keys: IAVKey[];
  views: IAVView[];
  [key: string]: any;
}

interface IResGetAttributeViewKeysByAvID {
  keys: IAVKey[];
  [key: string]: any;
}

// renderAttributeView 返回结构较大且多版本差异，这里只保证顶层字段存在
interface IResRenderAttributeView {
  name?: string;
  id?: AvId;
  viewType?: string;
  viewID?: AvViewId;
  views?: any[];
  view?: any;
  isMirror?: boolean;
  [key: string]: any;
}