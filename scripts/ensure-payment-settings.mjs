import { readFileSync } from "node:fs";

const env = loadEnv(".env.local");
const endpoint = requiredEnv("APPWRITE_ENDPOINT");
const projectId = requiredEnv("APPWRITE_PROJECT_ID");
const apiKey = requiredEnv("APPWRITE_API_KEY");
const databaseId = env.APPWRITE_DATABASE_ID || "main";
const collectionId = "paymentSettings";

const headers = {
  "Content-Type": "application/json",
  "X-Appwrite-Key": apiKey,
  "X-Appwrite-Project": projectId,
  "X-Appwrite-Response-Format": "1.8.0",
};

await ensureCollection();
await ensureAttributes();

console.log(
  JSON.stringify(
    {
      collectionId,
      ok: true,
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

async function ensureCollection() {
  const existing = await request(
    `/databases/${databaseId}/collections/${collectionId}`,
    {
      expectedStatuses: [200, 404],
    },
  );

  if (existing.status === 200) return;

  await request(`/databases/${databaseId}/collections`, {
    body: {
      collectionId,
      databaseId,
      documentSecurity: false,
      enabled: true,
      name: "paymentSettings",
      permissions: [],
    },
    expectedStatuses: [201, 409],
    method: "POST",
  });
}

async function ensureAttributes() {
  const attributes = [
    ["string", { key: "provider", required: true, size: 32 }],
    ["boolean", { key: "enabled", required: false, default: true }],
    ["string", { key: "environment", required: true, size: 32 }],
    ["string", { key: "username", required: true, size: 128 }],
    ["string", { key: "passwordEncrypted", required: false, size: 2048 }],
    ["string", { key: "aesKeyEncrypted", required: false, size: 2048 }],
    [
      "string",
      { key: "accountCreditEncrypted", required: false, size: 2048 },
    ],
    ["string", { key: "currency", required: false, size: 8, default: "BOB" }],
    [
      "integer",
      {
        default: 1,
        key: "qrExpirationDays",
        max: 30,
        min: 1,
        required: false,
      },
    ],
    ["string", { key: "baseUrl", required: false, size: 256 }],
  ];

  for (const [type, body] of attributes) {
    await request(
      `/databases/${databaseId}/collections/${collectionId}/attributes/${type}`,
      {
        body,
        expectedStatuses: [201, 202, 409],
        method: "POST",
      },
    );
  }
}

async function request(path, options = {}) {
  const { body, expectedStatuses = [200], method = "GET" } = options;
  const response = await fetch(`${endpoint}${path}`, {
    body: body ? JSON.stringify(body) : undefined,
    headers,
    method,
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
