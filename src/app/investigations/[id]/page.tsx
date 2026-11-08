import { InvestigationWorkspace } from "@/components/investigation-workspace";

export function generateMetadata({ params }: { params: { id: string } }) {
  return {
    title: `FumbleBee | Investigation #${params.id}`,
    description: `Live FumbleBee investigation workspace for incident #${params.id}.`,
  };
}

export default function InvestigationPage({ params }: { params: { id: string } }) {
  return <InvestigationWorkspace incidentId={params.id} />;
}
