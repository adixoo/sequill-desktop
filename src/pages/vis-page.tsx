import { AppBoot } from "@/components/templates/app-boot";

const loadVisualizer = () => import("../features/vis/components/vis-shell").then((m) => m.default);

export function VisPage() {
  return <AppBoot load={loadVisualizer} name="the schema visualizer" />;
}
