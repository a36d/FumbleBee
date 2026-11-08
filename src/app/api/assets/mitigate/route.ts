import { NextResponse } from "next/server";
import { z } from "zod";

const MitigationRequestSchema = z.object({
  asset: z.object({
    id: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(200),
    type: z.enum(["identity", "share", "database", "resource"]),
    description: z.string().max(1200),
    scopeStatus: z.enum(["Exfiltrated", "Ransomware Encrypted", "Targeted", "Quarantined"]),
  }),
});

function shellQuote(value: string) {
  const singleLineValue = value.replace(/[\r\n]/g, " ");
  return `'${singleLineValue.replaceAll("'", "'\\''")}'`;
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const parsed = MitigationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { asset } = parsed.data;
  const quotedName = shellQuote(asset.name);
  const mitigation = (() => {
    switch (asset.type) {
      case "identity":
        return {
          environment: "AWS CLI",
          command: `aws iam update-access-key --user-name ${quotedName} --access-key-id '<ACCESS_KEY_ID>' --status Inactive`,
          rationale: "Disables the specified IAM access key. Replace the access-key placeholder, verify the principal, and preserve credentials for forensic review before applying.",
        };
      case "share":
        return {
          environment: "AWS CLI",
          command: `aws s3api put-public-access-block --bucket ${quotedName} --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true`,
          rationale: "Blocks public access paths for the named S3 bucket. Confirm the bucket identity and service impact before applying.",
        };
      case "database":
        return {
          environment: "AWS CLI",
          command: `aws rds modify-db-instance --db-instance-identifier ${quotedName} --vpc-security-group-ids '<ISOLATION_SECURITY_GROUP_ID>' --apply-immediately`,
          rationale: "Replaces the database instance's VPC security-group assignment with an isolation group. Substitute a reviewed group ID and validate connectivity dependencies before applying.",
        };
      case "resource":
        return {
          environment: "BASH",
          command: `sudo iptables -I INPUT 1 -s '<SOURCE_CIDR>' -j DROP`,
          rationale: `Adds a host firewall drop rule for the specified source network associated with ${asset.name}. Replace the CIDR with verified indicators and confirm the host and rollback path before applying.`,
        };
    }
  })();

  return NextResponse.json({
    ...mitigation,
    assetId: asset.id,
    generatedFor: asset.name,
    notice: "Generated for analyst review only; FumbleBee does not execute infrastructure commands.",
  });
}
