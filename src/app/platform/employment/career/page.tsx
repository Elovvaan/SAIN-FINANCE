import type { Metadata } from "next";
import { WorkerWorkspacePage } from "../_components/role-scoped-workspaces";

export const metadata: Metadata = {
  title: "SAIN - Career OS",
  description:
    "Worker-owned Career OS connected to the worker pay, activity, documents, support, and profile flow.",
};

export default function CareerOsRoute() {
  return <WorkerWorkspacePage />;
}
