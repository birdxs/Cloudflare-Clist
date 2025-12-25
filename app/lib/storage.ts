export interface Storage {
  id: number;
  name: string;
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  basePath: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StorageInput {
  name: string;
  endpoint: string;
  region?: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  basePath?: string;
  isPublic?: boolean;
}

interface StorageRow {
  id: number;
  name: string;
  endpoint: string;
  region: string;
  access_key_id: string;
  secret_access_key: string;
  bucket: string;
  base_path: string;
  is_public: number;
  created_at: string;
  updated_at: string;
}

function rowToStorage(row: StorageRow): Storage {
  return {
    id: row.id,
    name: row.name,
    endpoint: row.endpoint,
    region: row.region,
    accessKeyId: row.access_key_id,
    secretAccessKey: row.secret_access_key,
    bucket: row.bucket,
    basePath: row.base_path || "",
    isPublic: row.is_public === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getAllStorages(db: D1Database): Promise<Storage[]> {
  const result = await db
    .prepare("SELECT * FROM storages ORDER BY name")
    .all<StorageRow>();

  return (result.results ?? []).map(rowToStorage);
}

export async function getPublicStorages(db: D1Database): Promise<Storage[]> {
  const result = await db
    .prepare("SELECT * FROM storages WHERE is_public = 1 ORDER BY name")
    .all<StorageRow>();

  return (result.results ?? []).map(rowToStorage);
}

export async function getStorageById(
  db: D1Database,
  id: number
): Promise<Storage | null> {
  const result = await db
    .prepare("SELECT * FROM storages WHERE id = ?")
    .bind(id)
    .first<StorageRow>();

  return result ? rowToStorage(result) : null;
}

export async function getStorageByName(
  db: D1Database,
  name: string
): Promise<Storage | null> {
  const result = await db
    .prepare("SELECT * FROM storages WHERE name = ?")
    .bind(name)
    .first<StorageRow>();

  return result ? rowToStorage(result) : null;
}

export async function createStorage(
  db: D1Database,
  input: StorageInput
): Promise<Storage> {
  const result = await db
    .prepare(
      `INSERT INTO storages (name, endpoint, region, access_key_id, secret_access_key, bucket, base_path, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       RETURNING *`
    )
    .bind(
      input.name,
      input.endpoint,
      input.region || "us-east-1",
      input.accessKeyId,
      input.secretAccessKey,
      input.bucket,
      input.basePath || "",
      input.isPublic ? 1 : 0
    )
    .first<StorageRow>();

  if (!result) {
    throw new Error("Failed to create storage");
  }

  return rowToStorage(result);
}

export async function updateStorage(
  db: D1Database,
  id: number,
  input: Partial<StorageInput>
): Promise<Storage | null> {
  const existing = await getStorageById(db, id);
  if (!existing) {
    return null;
  }

  const updates: string[] = [];
  const values: (string | number)[] = [];

  if (input.name !== undefined) {
    updates.push("name = ?");
    values.push(input.name);
  }
  if (input.endpoint !== undefined) {
    updates.push("endpoint = ?");
    values.push(input.endpoint);
  }
  if (input.region !== undefined) {
    updates.push("region = ?");
    values.push(input.region);
  }
  if (input.accessKeyId !== undefined) {
    updates.push("access_key_id = ?");
    values.push(input.accessKeyId);
  }
  if (input.secretAccessKey !== undefined) {
    updates.push("secret_access_key = ?");
    values.push(input.secretAccessKey);
  }
  if (input.bucket !== undefined) {
    updates.push("bucket = ?");
    values.push(input.bucket);
  }
  if (input.basePath !== undefined) {
    updates.push("base_path = ?");
    values.push(input.basePath);
  }
  if (input.isPublic !== undefined) {
    updates.push("is_public = ?");
    values.push(input.isPublic ? 1 : 0);
  }

  if (updates.length === 0) {
    return existing;
  }

  updates.push("updated_at = datetime('now')");
  values.push(id);

  const result = await db
    .prepare(
      `UPDATE storages SET ${updates.join(", ")} WHERE id = ? RETURNING *`
    )
    .bind(...values)
    .first<StorageRow>();

  return result ? rowToStorage(result) : null;
}

export async function deleteStorage(
  db: D1Database,
  id: number
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM storages WHERE id = ?")
    .bind(id)
    .run();

  return (result.meta?.changes ?? 0) > 0;
}

export async function initDatabase(_db: D1Database): Promise<void> {
  // No-op: Tables should be created via schema.sql before running
  // npx wrangler d1 execute clist --local --file=./schema.sql
  return;
}
