import { readFileSync } from "node:fs";

const env = loadEnv(".env.local");

const endpoint = requiredEnv("APPWRITE_ENDPOINT");
const projectId = requiredEnv("APPWRITE_PROJECT_ID");
const apiKey = requiredEnv("APPWRITE_API_KEY");
const databaseId = env.APPWRITE_DATABASE_ID || "main";
const databaseName = env.APPWRITE_DATABASE_NAME || "Control Instituto";

const headers = {
  "Content-Type": "application/json",
  "X-Appwrite-Key": apiKey,
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Response-Format": "1.7.0",
};

const database = await ensureDatabase();
console.log(
  JSON.stringify(
    {
      ok: true,
      connection: "successful",
      database: {
        id: database.$id,
        name: database.name,
        enabled: database.enabled,
      },
    },
    null,
    2,
  ),
);

function loadEnv(path) {
  const values = {};
  const text = readFileSync(path, "utf8");

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function requiredEnv(key) {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

async function ensureDatabase() {
  const existing = await request(`/databases/${databaseId}`, {
    expectedStatuses: [200, 404],
  });

  if (existing.status === 200) {
    return existing.body;
  }

  const created = await request("/databases", {
    method: "POST",
    body: {
      databaseId,
      name: databaseName,
      enabled: true,
    },
    expectedStatuses: [201, 409],
  });

  if (created.status === 201) {
    return created.body;
  }

  const confirmed = await request(`/databases/${databaseId}`, {
    expectedStatuses: [200],
  });

  return confirmed.body;
}

async function request(path, options = {}) {
  const { body, expectedStatuses = [200], method = "GET" } = options;

  const response = await fetch(`${endpoint}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const responseText = await response.text();
  const responseBody = responseText ? JSON.parse(responseText) : {};

  if (!expectedStatuses.includes(response.status)) {
    const message = responseBody.message || response.statusText;
    throw new Error(
      `Appwrite request failed (${response.status}) on ${method} ${path}: ${message}`,
    );
  }

  return {
    body: responseBody,
    status: response.status,
  };
}
