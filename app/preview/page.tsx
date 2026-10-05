import { previewData } from "./preview-data";
import { countCategories } from "@/lib/file-categories";
import { WorkspaceShell } from "@/app/components/workspace-shell";

export default function PreviewPage() {
  const categories = countCategories(previewData.files);

  return (
    <WorkspaceShell
      categories={categories}
      totalFiles={previewData.files.length}
      files={previewData.files}
      edges={previewData.edges}
      edgeCount={previewData.edges.length}
      adapter={previewData.adapter}
      repoName="preact"
    />
  );
}
