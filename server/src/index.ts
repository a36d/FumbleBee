import * as spacetimeDb from 'spacetimedb/server';

const { schema, table, SenderError } = spacetimeDb;
const t = (spacetimeDb as any).t;

const user = table(
  { name: 'User', public: true },
  {
    identity: t.identity().primaryKey(),
    name: t.string(),
    email: t.string(),
    role: t.string(),
    createdAt: t.timestamp(),
    username: t.string().default('').index('btree'),
    passwordHash: t.string().default(''),
  },
);

const incident = table(
  { name: 'Incident', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    title: t.string(),
    description: t.string(),
    subjectName: t.string(),
    status: t.string(),
    severity: t.string(),
    riskScore: t.u8(),
    classification: t.string(),
    summary: t.string(),
    triggerDetails: t.string(),
    blastRadius: t.u32(),
    confidence: t.u32(),
    impactSummary: t.string(),
    projectedDowntime: t.string().default(''),
    complianceRisk: t.string().default(''),
    businessImpactSummary: t.string().default(''),
    recommendations: t.string(),
    createdBy: t.identity(),
    owner: t.string().default(''),
    assignedTo: t.string().default(''),
    createdAt: t.timestamp(),
  },
);

const responderInvitation = table(
  { name: 'ResponderInvitation', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    username: t.string().index('btree'),
    invitedBy: t.identity(),
    createdAt: t.timestamp(),
  },
);

const asset = table(
  { name: 'Asset', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    assetKey: t.string(),
    name: t.string(),
    assetType: t.string(),
    riskLevel: t.string(),
    description: t.string(),
    compromiseStatus: t.string().default('targeted'),
  },
);

const relationship = table(
  { name: 'Relationship', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    sourceAssetKey: t.string(),
    targetAssetKey: t.string(),
    relationLabel: t.string(),
  },
);

const investigationNote = table(
  { name: 'InvestigationNote', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    authorIdentity: t.identity(),
    authorName: t.string(),
    content: t.string(),
    createdAt: t.timestamp(),
  },
);

const activityFeed = table(
  { name: 'ActivityFeed', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    incidentId: t.u64().index('btree'),
    actorName: t.string(),
    action: t.string(),
    createdAt: t.timestamp(),
  },
);

const auditLog = table(
  { name: 'AuditLog', public: true },
  {
    sequenceId: t.u64().primaryKey().autoInc(),
    action: t.string(),
    actorIdentity: t.identity(),
    incidentId: t.option(t.u64()),
    timestamp: t.timestamp(),
    previousHash: t.string(),
    currentHash: t.string(),
  },
);

const spacetime = schema({
  user,
  responderInvitation,
  incident,
  asset,
  relationship,
  investigationNote,
  activityFeed,
  auditLog,
});

type Role = 'Admin' | 'Employee';

function canonicalRole(role: string): Role {
  return role === 'Admin' || role === 'admin' ? 'Admin' : 'Employee';
}

function defaultEmail(value: string): string {
  const localPart = value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.+/g, '.');
  return `${localPart || 'responder'}@fumblebee.local`;
}

function contactEmail(value: string, displayName: string): string {
  const email = value.trim().toLowerCase();
  if (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    && !email.endsWith('@sentinelgraph.local')
  ) {
    return email;
  }
  return defaultEmail(displayName);
}

function requireRole(ctx: any, allowed: Role[]) {
  let row = ctx.db.user.identity.find(ctx.sender);
  if (!row) {
    row = ctx.db.user.insert({
      identity: ctx.sender,
      name: 'SOC Analyst',
      email: 'analyst@fumblebee.local',
      username: `soc-${ctx.sender.toHexString().slice(0, 12)}`,
      passwordHash: '',
      role: 'Employee',
      createdAt: ctx.timestamp,
    });
  }
  const role = canonicalRole(row.role);
  if (row.role !== role) {
    ctx.db.user.identity.delete(ctx.sender);
    row = ctx.db.user.insert({ ...row, role });
  }
  if (!allowed.includes(role)) {
    throw new SenderError('Permission denied');
  }
  return row;
}

function appendAudit(
  ctx: any,
  action: string,
  incidentId: bigint | null,
) {
  let previousHash = '0'.repeat(64);
  let latestSequence = 0n;
  for (const row of ctx.db.auditLog.iter()) {
    if (row.sequenceId >= latestSequence) {
      latestSequence = row.sequenceId;
      previousHash = row.currentHash;
    }
  }

  const timestampValue = ctx.timestamp.microsSinceUnixEpoch.toString();
  const actorValue = ctx.sender.toHexString();
  const hashInput = action + actorValue + timestampValue + previousHash;
  const currentHash = sha256(hashInput);
  ctx.db.auditLog.insert({
    sequenceId: 0n,
    action,
    actorIdentity: ctx.sender,
    incidentId,
    timestamp: ctx.timestamp,
    previousHash,
    currentHash,
  });
}

function addActivity(ctx: any, incidentId: bigint, actorName: string, action: string) {
  ctx.db.activityFeed.insert({
    id: 0n,
    incidentId,
    actorName,
    action,
    createdAt: ctx.timestamp,
  });
}

function sha256(message: string): string {
  const bytes = new TextEncoder().encode(message);
  const bitLength = BigInt(bytes.length) * 8n;
  const paddedLength = (bytes.length + 9 + 63) & ~63;
  const data = new Uint8Array(paddedLength);
  data.set(bytes);
  data[bytes.length] = 0x80;
  const view = new DataView(data.buffer);
  view.setUint32(paddedLength - 8, Number((bitLength >> 32n) & 0xffffffffn), false);
  view.setUint32(paddedLength - 4, Number(bitLength & 0xffffffffn), false);

  const h = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const w = new Uint32Array(64);

  const rotr = (value: number, bits: number) => (value >>> bits) | (value << (32 - bits));
  for (let offset = 0; offset < data.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + k[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return h.map(value => value.toString(16).padStart(8, '0')).join('');
}

export const init = spacetime.init((ctx: any) => {
  void ctx;
});

export const createUser = spacetime.reducer(
  { identity: t.identity(), name: t.string(), email: t.string(), role: t.string() },
  (ctx: any, args: any) => {
    requireRole(ctx as any, ['Admin']);
    if (!['Admin', 'Employee'].includes(args.role)) throw new SenderError('Invalid role');
    const username = args.name.trim().toLowerCase().replace(/\s+/g, '-');
    if (!username) throw new SenderError('Invalid username');
    for (const userRow of ctx.db.user.iter()) {
      if (userRow.username === username) throw new SenderError('Username already exists');
    }
    ctx.db.user.insert({
      identity: args.identity,
      name: args.name,
      email: contactEmail(args.email, args.name),
      username,
      passwordHash: '',
      role: args.role,
      createdAt: ctx.timestamp,
    });
    appendAudit(ctx, `UserCreated:${args.identity.toHexString()}:${args.role}`, null);
  },
);

export const signUp = spacetime.reducer(
  { username: t.string(), passwordHash: t.string(), role: t.string() },
  (ctx: any, args: any) => {
    const username = args.username.trim();
    const requestedRole = canonicalRole(args.role);
    if (!username) throw new SenderError('Username is required');
    if (!args.passwordHash) throw new SenderError('Password hash is required');
    const currentUser = ctx.db.user.identity.find(ctx.sender);
    if (currentUser && !currentUser.username.startsWith('soc-')) {
      throw new SenderError('User already registered');
    }
    for (const userRow of ctx.db.user.iter()) {
      if (userRow.username.toLowerCase() === username.toLowerCase() && !userRow.identity.isEqual(ctx.sender)) {
        throw new SenderError('Username already exists');
      }
    }
    let invitation: any = null;
    const role: Role = requestedRole;
    if (role === 'Admin') {
      if (Array.from(ctx.db.user.iter()).some((row: any) => canonicalRole(row.role) === 'Admin')) {
        throw new SenderError('An administrator account already exists');
      }
    } else {
      invitation = Array.from(ctx.db.responderInvitation.iter())
        .find((row: any) => row.username.toLowerCase() === username.toLowerCase());
      if (!invitation) throw new SenderError('An administrator invitation is required to register this username');
    }
    const newUser = {
      identity: ctx.sender,
      name: username,
      email: defaultEmail(username),
      username,
      passwordHash: args.passwordHash,
      role,
      createdAt: ctx.timestamp,
    };
    if (currentUser) {
      ctx.db.user.identity.delete(ctx.sender);
      ctx.db.user.insert({ ...currentUser, ...newUser });
    } else {
      ctx.db.user.insert(newUser);
    }
    if (invitation) ctx.db.responderInvitation.id.delete(invitation.id);
    appendAudit(ctx, `USER_REGISTERED: [${username}] as [${role}]`, null);
  },
);

export const inviteMember = spacetime.reducer(
  { username: t.string() },
  (ctx: any, args: any) => {
    const inviter = requireRole(ctx as any, ['Admin']);
    const username = args.username.trim();
    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) throw new SenderError('Invalid username');
    const existing = Array.from(ctx.db.user.iter())
      .find((row: any) => row.username.toLowerCase() === username.toLowerCase());
    if (existing) throw new SenderError('A responder with this username already exists');
    for (const invitation of ctx.db.responderInvitation.iter()) {
      if (invitation.username.toLowerCase() === username.toLowerCase()) {
        throw new SenderError('An invitation for this username is already pending');
      }
    }
    ctx.db.responderInvitation.insert({
      id: 0n,
      username,
      invitedBy: ctx.sender,
      createdAt: ctx.timestamp,
    });
    appendAudit(ctx, `EMPLOYEE_INVITED: [${username}] by [${inviter.username}]`, null);
  },
);

export const inviteEmployee = spacetime.reducer(
  { username: t.string() },
  (ctx: any, args: any) => {
    const inviter = requireRole(ctx as any, ['Admin']);
    const username = args.username.trim();
    if (!/^[a-zA-Z0-9._-]{3,64}$/.test(username)) throw new SenderError('Username must be 3-64 letters, numbers, dots, underscores, or hyphens');
    for (const userRow of ctx.db.user.iter()) {
      if (userRow.username.toLowerCase() === username.toLowerCase()) {
        throw new SenderError('A responder with this username already exists');
      }
    }
    for (const invitation of ctx.db.responderInvitation.iter()) {
      if (invitation.username.toLowerCase() === username.toLowerCase()) {
        throw new SenderError('An invitation for this username is already pending');
      }
    }
    ctx.db.responderInvitation.insert({
      id: 0n,
      username,
      invitedBy: ctx.sender,
      createdAt: ctx.timestamp,
    });
    appendAudit(ctx, `EMPLOYEE_INVITED: [${username}] by [${inviter.username}]`, null);
  },
);

export const signIn = spacetime.reducer(
  { username: t.string(), passwordHash: t.string() },
  (ctx: any, args: any) => {
    const username = args.username.trim();
    let existing: any = null;
    for (const userRow of ctx.db.user.iter()) {
      if (userRow.username === username) {
        existing = userRow;
        break;
      }
    }
    if (!existing || existing.passwordHash !== args.passwordHash) {
      throw new SenderError('Invalid credentials');
    }

    const existingHex = existing.identity.toHexString();
    const senderHex = ctx.sender.toHexString();
    if (existingHex !== senderHex) {
      const senderRow = ctx.db.user.identity.find(ctx.sender);
      if (senderRow) {
        ctx.db.user.identity.delete(ctx.sender);
      }
      ctx.db.user.identity.delete(existing.identity);
      ctx.db.user.insert({
        ...existing,
        identity: ctx.sender,
        createdAt: ctx.timestamp,
      });
    }

    appendAudit(ctx, `USER_AUTHENTICATED: [${existing.username}] as [${existing.role}]`, null);
  },
);

export const updateUserProfile = spacetime.reducer(
  { name: t.string(), email: t.string() },
  (ctx: any, args: any) => {
    const existing = ctx.db.user.identity.find(ctx.sender);
    if (!existing) throw new SenderError('Responder account not found');
    const name = args.name.trim();
    const email = contactEmail(args.email, name);
    if (!name || name.length > 100) throw new SenderError('Name must be between 1 and 100 characters');
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new SenderError('Enter a valid contact email');
    }
    ctx.db.user.identity.delete(ctx.sender);
    ctx.db.user.insert({ ...existing, name, email });
    appendAudit(ctx, `USER_PROFILE_UPDATED: [${existing.username}]`, null);
  },
);

export const changeUserPassword = spacetime.reducer(
  { currentPasswordHash: t.string(), newPasswordHash: t.string() },
  (ctx: any, args: any) => {
    const existing = ctx.db.user.identity.find(ctx.sender);
    if (!existing) throw new SenderError('Responder account not found');
    if (existing.passwordHash !== args.currentPasswordHash) {
      throw new SenderError('Current password is incorrect');
    }
    if (!/^[a-f0-9]{64}$/.test(args.newPasswordHash)) {
      throw new SenderError('New password hash is invalid');
    }
    if (args.currentPasswordHash === args.newPasswordHash) {
      throw new SenderError('Choose a different password');
    }
    ctx.db.user.identity.delete(ctx.sender);
    ctx.db.user.insert({ ...existing, passwordHash: args.newPasswordHash });
    appendAudit(ctx, `USER_PASSWORD_CHANGED: [${existing.username}]`, null);
  },
);

export const assignUserRole = spacetime.reducer(
  { targetIdentity: t.identity(), newRole: t.string() },
  (ctx: any, args: any) => {
    requireRole(ctx as any, ['Admin']);
    if (!['Admin', 'Employee'].includes(args.newRole)) {
      throw new SenderError('Invalid role');
    }
    const existing = ctx.db.user.identity.find(args.targetIdentity);
    if (!existing) throw new SenderError('User not found');
    ctx.db.user.identity.delete(args.targetIdentity);
    ctx.db.user.insert({ ...existing, role: args.newRole });
    appendAudit(
      ctx,
      `USER_ROLE_ASSIGNED: [${existing.username}] -> [${args.newRole}]`,
      null,
    );
  },
);

export const setUserRole = spacetime.reducer(
  { identity: t.identity(), role: t.string() },
  (ctx: any, args: any) => {
    requireRole(ctx as any, ['Admin']);
    if (!['Admin', 'Employee'].includes(args.role)) throw new SenderError('Invalid role');
    const existing = ctx.db.user.identity.find(args.identity);
    if (!existing) throw new SenderError('User not found');
    ctx.db.user.identity.delete(args.identity);
    ctx.db.user.insert({ ...existing, role: args.role });
    appendAudit(ctx, `RoleChanged:${args.identity.toHexString()}:${args.role}`, null);
  },
);

export const deleteUser = spacetime.reducer(
  { identity: t.identity() },
  (ctx: any, args: any) => {
    requireRole(ctx as any, ['Admin']);
    const existing = ctx.db.user.identity.find(args.identity);
    if (!existing) throw new SenderError('User not found');
    ctx.db.user.identity.delete(args.identity);
    appendAudit(ctx, `UserDeleted:${args.identity.toHexString()}`, null);
  },
);

export const createIncident = spacetime.reducer(
  { title: t.string(), description: t.string(), severity: t.string(), initialNotes: t.string() },
  (ctx: any, args: any) => {
    const actor = requireRole(ctx as any, ['Admin', 'Employee']);
    const title = args.title.trim();
    const description = args.description.trim();
    const validSeverities = ['Low', 'Medium', 'High', 'Critical'];
    if (!title) throw new SenderError('Incident title is required');
    if (!validSeverities.includes(args.severity)) throw new SenderError('Invalid severity');
    const row = ctx.db.incident.insert({
      id: 0n,
      title,
      description,
      subjectName: 'Pending Assignment',
      status: 'Investigating',
      severity: args.severity,
      riskScore: 0,
      classification: 'Unclassified',
      summary: '',
      triggerDetails: '',
      blastRadius: 0,
      confidence: 0,
      impactSummary: '',
      projectedDowntime: '',
      complianceRisk: '',
      businessImpactSummary: '',
      recommendations: '[]',
      createdBy: ctx.sender,
      owner: actor.username,
      assignedTo: actor.username,
      createdAt: ctx.timestamp,
    });
    const initialNotes = args.initialNotes.trim();
    if (initialNotes) {
      ctx.db.investigationNote.insert({
        id: 0n,
        incidentId: row.id,
        authorIdentity: ctx.sender,
        authorName: actor.name,
        content: initialNotes,
        createdAt: ctx.timestamp,
      });
      addActivity(ctx, row.id, actor.name, 'Initial Investigation Note Added');
    }
    addActivity(ctx, row.id, actor.name, 'Incident Created');
    appendAudit(ctx, `INCIDENT_CREATED: [${row.id}] - [${title}]`, row.id);
  },
);

export const assignIncident = spacetime.reducer(
  { incidentId: t.u64(), assigneeUsername: t.string() },
  (ctx: any, args: any) => {
    const actor = requireRole(ctx as any, ['Admin']);
    const assigneeUsername = args.assigneeUsername.trim();
    const assignee: any = Array.from(ctx.db.user.iter())
      .find((row: any) => row.username.toLowerCase() === assigneeUsername.toLowerCase());
    if (!assignee || canonicalRole(assignee.role) !== 'Employee') {
      throw new SenderError('Choose a registered Employee account');
    }
    const existing = ctx.db.incident.id.find(args.incidentId);
    if (!existing) throw new SenderError('Incident not found');
    ctx.db.incident.id.delete(args.incidentId);
    ctx.db.incident.insert({ ...existing, owner: assignee.username, assignedTo: assignee.username });
    addActivity(ctx, args.incidentId, actor.name, `Incident assigned to ${assignee.username}`);
    appendAudit(ctx, `INCIDENT_ASSIGNED: [${args.incidentId}] -> [${assignee.username}]`, args.incidentId);
  },
);

export const updateIncident = spacetime.reducer(
  { id: t.u64(), title: t.string(), description: t.string(), subjectName: t.string(), status: t.string(), severity: t.string(), riskScore: t.u8(), classification: t.string(), summary: t.string() },
  (ctx: any, args: any) => {
    const actor = requireRole(ctx as any, ['Admin', 'Employee']);
    const existing = ctx.db.incident.id.find(args.id);
    if (!existing) throw new SenderError('Incident not found');
    ctx.db.incident.id.delete(args.id);
    ctx.db.incident.insert({
      ...existing,
      title: args.title,
      description: args.description,
      subjectName: args.subjectName,
      status: args.status,
      severity: args.severity,
      riskScore: args.riskScore,
      classification: args.classification,
      summary: args.summary,
    });
    addActivity(ctx, args.id, actor.name, 'Incident Updated');
    appendAudit(ctx, 'IncidentUpdated', args.id);
  },
);

export const addInvestigationNote = spacetime.reducer(
  { incidentId: t.u64(), content: t.string() },
  (ctx: any, args: any) => {
    const actor = requireRole(ctx as any, ['Admin', 'Employee']);
    if (!ctx.db.incident.id.find(args.incidentId)) throw new SenderError('Incident not found');
    ctx.db.investigationNote.insert({
      id: 0n,
      incidentId: args.incidentId,
      authorIdentity: ctx.sender,
      authorName: actor.name,
      content: args.content,
      createdAt: ctx.timestamp,
    });
    addActivity(ctx, args.incidentId, actor.name, 'Investigation Note Added');
    appendAudit(ctx, 'NoteAdded', args.incidentId);
  },
);

export const updateAssetCompromiseStatus = spacetime.reducer(
  { assetId: t.u64(), compromiseStatus: t.string() },
  (ctx: any, args: any) => {
    const actor = requireRole(ctx as any, ['Admin', 'Employee']);
    const allowedStatuses = [
      'clean',
      'targeted',
      'compromised',
      'ransomware_encrypted',
      'data_exfiltrated',
      'quarantined',
    ];
    if (!allowedStatuses.includes(args.compromiseStatus)) {
      throw new SenderError('Invalid compromise status');
    }
    const existing = ctx.db.asset.id.find(args.assetId);
    if (!existing) throw new SenderError('Asset not found');
    ctx.db.asset.id.delete(args.assetId);
    ctx.db.asset.insert({ ...existing, compromiseStatus: args.compromiseStatus });
    addActivity(
      ctx,
      existing.incidentId,
      actor.name,
      `Asset ${existing.name} status changed to ${args.compromiseStatus}`,
    );
    appendAudit(
      ctx,
      `ASSET_STATUS_UPDATED:${args.assetId}:${args.compromiseStatus}`,
      existing.incidentId,
    );
  },
);

export const applyAssetContainment = spacetime.reducer(
  { assetId: t.u64(), actionType: t.string(), mitigationDetails: t.string() },
  (ctx: any, args: any) => {
    const actor = requireRole(ctx as any, ['Admin', 'Employee']);
    const allowedActions = [
      'isolate_host',
      'revoke_iam',
      'lock_s3_bucket',
      'block_network',
    ];
    if (!allowedActions.includes(args.actionType)) {
      throw new SenderError('Invalid containment action');
    }
    const asset = ctx.db.asset.id.find(args.assetId);
    if (!asset) throw new SenderError('Asset not found');

    ctx.db.asset.id.delete(args.assetId);
    ctx.db.asset.insert({ ...asset, compromiseStatus: 'quarantined', riskLevel: 'Low' });

    const incident = ctx.db.incident.id.find(asset.incidentId);
    if (incident) {
      const reductions: Record<string, number> = {
        isolate_host: 20,
        revoke_iam: 25,
        lock_s3_bucket: 30,
        block_network: 15,
      };
      const reducedRisk = Math.max(0, Number(incident.riskScore) - reductions[args.actionType]);
      ctx.db.incident.id.delete(asset.incidentId);
      ctx.db.incident.insert({ ...incident, riskScore: reducedRisk });
    }

    addActivity(
      ctx,
      asset.incidentId,
      actor.name,
      `Containment applied: ${args.actionType} on ${asset.name}`,
    );
    appendAudit(
      ctx,
      `ASSET_CONTAINMENT:${asset.name}:${args.actionType}:${args.assetId}:${args.mitigationDetails}`,
      asset.incidentId,
    );
  },
);

export const applyAiAnalysis = spacetime.reducer(
  {
    incidentId: t.u64(),
    classification: t.string(),
    riskScore: t.u8(),
    severity: t.string(),
    blastRadius: t.u32(),
    confidence: t.u32(),
    impactSummary: t.string(),
    projectedDowntime: t.string(),
    complianceRisk: t.string(),
    businessImpactSummary: t.string(),
    recommendations: t.string(),
    assets: t.string(),
    relationships: t.string(),
  },
  (ctx: any, args: any) => {
    const actor = requireRole(ctx as any, ['Admin', 'Employee']);
    const existing = ctx.db.incident.id.find(args.incidentId);
    if (!existing) throw new SenderError('Incident not found');

    let parsedAssets: any[] = [];
    let parsedRelationships: any[] = [];
    let parsedRecommendations: string[] = [];
    try {
      parsedAssets = typeof args.assets === 'string' ? JSON.parse(args.assets || '[]') : args.assets ?? [];
    } catch {
      parsedAssets = [];
    }
    try {
      parsedRelationships = typeof args.relationships === 'string'
        ? JSON.parse(args.relationships || '[]')
        : args.relationships ?? [];
    } catch {
      parsedRelationships = [];
    }
    try {
      parsedRecommendations = typeof args.recommendations === 'string'
        ? JSON.parse(args.recommendations || '[]')
        : args.recommendations ?? [];
    } catch {
      parsedRecommendations = [];
    }
    if (!Array.isArray(parsedAssets)) parsedAssets = [];
    if (!Array.isArray(parsedRelationships)) parsedRelationships = [];
    if (!Array.isArray(parsedRecommendations)) parsedRecommendations = [];
    parsedRecommendations = parsedRecommendations.filter((recommendation: unknown): recommendation is string => typeof recommendation === 'string');

    ctx.db.incident.id.delete(args.incidentId);
    ctx.db.incident.insert({
      ...existing,
      severity: args.severity,
      riskScore: args.riskScore,
      classification: args.classification,
      summary: args.impactSummary,
      impactSummary: args.impactSummary,
      projectedDowntime: args.projectedDowntime || '',
      complianceRisk: args.complianceRisk || '',
      businessImpactSummary: args.businessImpactSummary || '',
      blastRadius: args.blastRadius,
      confidence: args.confidence,
      recommendations: JSON.stringify(parsedRecommendations),
    });

    const assetKeys = new Set<string>();
    for (const asset of parsedAssets) {
      assetKeys.add(asset.id);
    }
    for (const edge of parsedRelationships) {
      assetKeys.add(edge.sourceId ?? edge.source);
      assetKeys.add(edge.targetId ?? edge.target);
    }
    for (const assetKey of assetKeys) {
      const asset = parsedAssets.find((candidate: any) => candidate.id === assetKey);
      const desiredName = asset?.name ?? assetKey;
      const existingAssets: any[] = Array.from(ctx.db.asset.iter()).filter(
        (candidate: any) => candidate.incidentId === args.incidentId
          && (candidate.assetKey === assetKey || candidate.name === desiredName),
      );
      const existingAsset = existingAssets[0];

      if (existingAsset) {
        ctx.db.asset.id.delete(existingAsset.id);
        ctx.db.asset.insert({
          ...existingAsset,
          assetKey,
          name: desiredName,
          assetType: asset?.type ?? existingAsset.assetType ?? 'resource',
          riskLevel: asset?.riskLabel ?? args.severity,
          description: asset?.description ?? existingAsset.description ?? '',
        });
      } else {
        ctx.db.asset.insert({
          id: 0n,
          incidentId: args.incidentId,
          assetKey,
          name: desiredName,
          assetType: asset?.type ?? 'resource',
          riskLevel: asset?.riskLabel ?? args.severity,
          description: asset?.description ?? '',
          compromiseStatus: 'targeted',
        });
      }
    }
    for (const edge of parsedRelationships) {
      const sourceAssetKey = edge.sourceId ?? edge.source ?? '';
      const targetAssetKey = edge.targetId ?? edge.target ?? '';
      const relationLabel = edge.label ?? edge.relationLabel ?? '';
      const existingRelationships = Array.from(ctx.db.relationship.iter()).filter(
        (candidate: any) => candidate.incidentId === args.incidentId
          && candidate.sourceAssetKey === sourceAssetKey
          && candidate.targetAssetKey === targetAssetKey
          && candidate.relationLabel === relationLabel,
      );
      if (existingRelationships.length > 0) continue;
      ctx.db.relationship.insert({
        id: 0n,
        incidentId: args.incidentId,
        sourceAssetKey,
        targetAssetKey,
        relationLabel,
      });
    }

    addActivity(ctx, args.incidentId, actor.name, 'AI Analysis Completed');
    addActivity(ctx, args.incidentId, actor.name, `Risk Score Updated: ${args.riskScore}`);
    addActivity(ctx, args.incidentId, actor.name, 'Attack Graph Generated');
    appendAudit(ctx, 'AiAnalysisApplied', args.incidentId);
  },
);

export default spacetime;