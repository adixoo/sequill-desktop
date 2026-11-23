import { AppBoot } from "@/components/templates/app-boot";

const loadEditor = () =>
  import("../features/editor/components/editor-shell").then((m) => m.default);

export function EditorPage() {
  return <AppBoot load={loadEditor} name="the editor" />;
}
