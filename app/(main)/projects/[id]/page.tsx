import { notFound } from "next/navigation";
import { ProjectDetailShell } from "@/components/projects/project-detail-shell";
import { requireUserId } from "@/lib/auth";
import { getProject } from "@/lib/db/projects";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const userId = await requireUserId();
  const { id } = await params;
  const project = await getProject(userId, id);
  if (!project) notFound();

  return <ProjectDetailShell project={project} />;
}
