import { InvestigationWorkspace } from "@/components/investigation-workspace";

export default function InvestigationPage({ params }: { params: { id: string } }) {
  return <InvestigationWorkspace incidentId={params.id} />;
}
