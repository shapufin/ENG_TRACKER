export interface OnboardingClient {
  id: number;
  name: string;
  code: string;
}

export interface Folder {
  id: number;
  client: number;
  parent: number | null;
  name: string;
  created_by: number | null;
  created_by_name: string | null;
  updated_by: number | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
  child_count: number;
  document_count: number;
}

export interface Document {
  id: number;
  client: number;
  folder: number | null;
  name: string;
  size_bytes: number;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
  updated_by: number | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface OfficeEditorConfig {
  document: {
    fileType: string;
    key: string;
    title: string;
    url: string;
  };
  documentType: "word" | "cell" | "slide";
  editorConfig: {
    mode: "edit" | "view";
    callbackUrl: string;
    user: { id: string; name: string };
  };
  token?: string;
}

export interface OfficeEditorConfigResponse {
  config: OfficeEditorConfig;
  document_server_url: string;
}

export interface SearchAncestor {
  id: number;
  name: string;
}

export interface SearchFolderResult {
  id: number;
  name: string;
  parent: number | null;
  /** Ancestor names joined by " / ", or null at the client root. Display only —
   * use `ancestors` (carries ids) to rebuild the breadcrumb trail. */
  path: string | null;
  ancestors: SearchAncestor[];
}

export interface SearchDocumentResult {
  id: number;
  name: string;
  folder: number | null;
  path: string | null;
  /** Ancestors down to and including the containing folder. */
  ancestors: SearchAncestor[];
}

export interface SearchResults {
  folders: SearchFolderResult[];
  documents: SearchDocumentResult[];
}
