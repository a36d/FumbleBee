import { IncidentHub } from "@/components/incident-hub";

export const metadata = {
  title: "FumbleBee | Personal Incidents",
};

export default function PersonalIncidentsPage() {
  return <IncidentHub personalOnly />;
}
