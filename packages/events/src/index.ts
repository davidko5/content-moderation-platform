export const CONTENT_UPLOADED = "content.uploaded";

export interface ContentUploaded {
  contentId: string;
  type: "text" | "image";
  text: string;
  createdAt: string;
}
