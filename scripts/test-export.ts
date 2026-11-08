import {
  generateIncidentReport,
  reportToMarkdown,
} from '../src/services/report-generator';

async function main() {
  const incidentId = BigInt(process.env.INCIDENT_ID ?? '1');
  const report = await generateIncidentReport(incidentId);
  const markdown = reportToMarkdown(report);

  if (!report.cryptographicIntegrity.valid) {
    throw new Error(
      `Audit chain integrity failed: ${report.cryptographicIntegrity.errors.join('; ')}`,
    );
  }

  console.log(`Incident #${report.incidentId} report generated successfully.`);
  console.log(`Title: ${report.executiveSummary.title}`);
  console.log(`Classification: ${report.executiveSummary.classification}`);
  console.log(`Audit entries: ${report.attestationAuditTrail.length}`);
  console.log(`Root hash: ${report.cryptographicIntegrity.rootHash}`);
  console.log(`Markdown bytes: ${Buffer.byteLength(markdown, 'utf8')}`);
  console.log('EXPORT VERIFICATION PASSED');
}

main().catch(error => {
  console.error('EXPORT VERIFICATION FAILED:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
