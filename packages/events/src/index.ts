export const CONTENT_UPLOADED = "content.uploaded";

export interface ContentUploaded {
  contentId: string;
  tenantId: string;
  type: "text" | "image";
  text: string;
  createdAt: string;
}

export const CONTENT_DECIDED = "content.decided";

export type Decision = "approved" | "rejected";   

export interface ContentDecided {
  contentId: string;
  tenantId: string;
  decision: Decision;
  decidedAt: string;
}
