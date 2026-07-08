import "server-only";

import crypto from "node:crypto";
import {
  APPWRITE_DATABASE_ID,
  ID,
  Query,
  createAdminDatabases,
} from "@/lib/appwrite-server";

const PAYMENT_SETTINGS_COLLECTION_ID = "paymentSettings";
const BANECO_SETTINGS_ID = "baneco";
const SECRET_PURPOSE = "control-instituto-baneco-settings";

function getEncryptionSecret() {
  const secret =
    process.env.BANECO_CREDENTIALS_SECRET ||
    process.env.PAYMENT_CREDENTIALS_SECRET ||
    process.env.APPWRITE_API_KEY ||
    "";

  if (!secret) {
    throw new Error(
      "Falta configurar BANECO_CREDENTIALS_SECRET para guardar credenciales Baneco.",
    );
  }

  return crypto
    .createHash("sha256")
    .update(`${SECRET_PURPOSE}:${secret}`)
    .digest();
}

function encryptSecret(value) {
  const cleanValue = typeof value === "string" ? value.trim() : "";

  if (!cleanValue) return "";

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionSecret(), iv);
  const encrypted = Buffer.concat([
    cipher.update(cleanValue, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decryptSecret(value) {
  const cleanValue = typeof value === "string" ? value.trim() : "";

  if (!cleanValue) return "";

  const [version, ivText, tagText, encryptedText] = cleanValue.split(":");

  if (version !== "v1" || !ivText || !tagText || !encryptedText) {
    return "";
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionSecret(),
    Buffer.from(ivText, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagText, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

function toCleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toPositiveInteger(value, fallback = 1) {
  const number = Number(value);

  if (!Number.isFinite(number)) return fallback;

  return Math.max(1, Math.min(30, Math.trunc(number)));
}

function getFixedBanecoOptions() {
  return {
    baseUrl: "",
    currency: "BOB",
    environment: "production",
    qrExpirationDays: 1,
  };
}

function serializeSettings(document) {
  return {
    $id: document.$id,
    accountCreditConfigured: Boolean(document.accountCreditEncrypted),
    aesKeyConfigured: Boolean(document.aesKeyEncrypted),
    baseUrl: "",
    currency: "BOB",
    enabled: document.enabled !== false,
    environment: "production",
    passwordConfigured: Boolean(document.passwordEncrypted),
    qrExpirationDays: 1,
    username: document.username || "",
  };
}

export async function getStoredBanecoSettingsDocument() {
  const databases = createAdminDatabases();

  try {
    return await databases.getDocument({
      collectionId: PAYMENT_SETTINGS_COLLECTION_ID,
      databaseId: APPWRITE_DATABASE_ID,
      documentId: BANECO_SETTINGS_ID,
    });
  } catch (error) {
    if (error?.code === 404) return null;
    throw error;
  }
}

export async function getBanecoSettingsForForm() {
  const document = await getStoredBanecoSettingsDocument();

  if (!document) {
    return {
      accountCreditConfigured: false,
      aesKeyConfigured: false,
      enabled: true,
      passwordConfigured: false,
      username: "",
      ...getFixedBanecoOptions(),
    };
  }

  return serializeSettings(document);
}

export async function saveBanecoSettings(input = {}) {
  const databases = createAdminDatabases();
  const current = await getStoredBanecoSettingsDocument();
  const username = toCleanString(input.username);
  const password = typeof input.password === "string" ? input.password : "";
  const aesKey = typeof input.aesKey === "string" ? input.aesKey : "";
  const accountCredit =
    typeof input.accountCredit === "string" ? input.accountCredit : "";
  const data = {
    accountCreditEncrypted: accountCredit.trim()
      ? encryptSecret(accountCredit)
      : current?.accountCreditEncrypted || "",
    aesKeyEncrypted: aesKey.trim()
      ? encryptSecret(aesKey)
      : current?.aesKeyEncrypted || "",
    baseUrl: "",
    currency: "BOB",
    enabled: input.enabled !== false,
    environment: "production",
    passwordEncrypted: password.trim()
      ? encryptSecret(password)
      : current?.passwordEncrypted || "",
    provider: "baneco",
    qrExpirationDays: 1,
    username,
  };

  if (!data.username) {
    return { error: "Ingresa el usuario de Banco Económico.", ok: false };
  }

  if (!data.passwordEncrypted) {
    return { error: "Ingresa la contraseña de Banco Económico.", ok: false };
  }

  if (!data.aesKeyEncrypted) {
    return { error: "Ingresa la llave AES de Banco Económico.", ok: false };
  }

  if (!data.accountCreditEncrypted) {
    return { error: "Ingresa la cuenta de abono de Banco Económico.", ok: false };
  }

  const document = current
    ? await databases.updateDocument({
        collectionId: PAYMENT_SETTINGS_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        data,
        documentId: BANECO_SETTINGS_ID,
      })
    : await databases.createDocument({
        collectionId: PAYMENT_SETTINGS_COLLECTION_ID,
        databaseId: APPWRITE_DATABASE_ID,
        data,
        documentId: ID.custom(BANECO_SETTINGS_ID),
        permissions: [],
      });

  return { ok: true, settings: serializeSettings(document) };
}

export async function getBanecoSettingsForValidation(input = {}) {
  const current = await getStoredBanecoSettingsDocument();
  const username = toCleanString(input.username || current?.username);
  const password =
    typeof input.password === "string" && input.password.trim()
      ? input.password.trim()
      : decryptSecret(current?.passwordEncrypted);
  const aesKey =
    typeof input.aesKey === "string" && input.aesKey.trim()
      ? input.aesKey.trim()
      : decryptSecret(current?.aesKeyEncrypted);
  const accountCredit =
    typeof input.accountCredit === "string" && input.accountCredit.trim()
      ? input.accountCredit.trim()
      : decryptSecret(current?.accountCreditEncrypted);

  if (!username) {
    throw new Error("Ingresa el usuario de Banco Económico.");
  }

  if (!password) {
    throw new Error("Ingresa la contraseña de Banco Económico.");
  }

  if (!aesKey) {
    throw new Error("Ingresa la llave AES de Banco Económico.");
  }

  if (!accountCredit) {
    throw new Error("Ingresa la cuenta de abono de Banco Económico.");
  }

  return {
    accountCredit,
    aesKey,
    password,
    username,
    ...getFixedBanecoOptions(),
  };
}

export async function getConfiguredBanecoSettings() {
  const document = await getStoredBanecoSettingsDocument();

  if (!document) {
    return null;
  }

  if (document.enabled === false) {
    throw new Error("El QR de Banco Económico está deshabilitado en Configuración.");
  }

  const settings = {
    accountCredit: decryptSecret(document.accountCreditEncrypted),
    aesKey: decryptSecret(document.aesKeyEncrypted),
    password: decryptSecret(document.passwordEncrypted),
    username: document.username || "",
    ...getFixedBanecoOptions(),
  };

  if (
    !settings.username ||
    !settings.password ||
    !settings.aesKey ||
    !settings.accountCredit
  ) {
    throw new Error(
      "Completa y guarda todas las credenciales de Banco Económico en Configuración.",
    );
  }

  return settings;
}

export async function ensurePaymentSettingsCollectionExists() {
  const databases = createAdminDatabases();
  const response = await databases.listDocuments({
    collectionId: PAYMENT_SETTINGS_COLLECTION_ID,
    databaseId: APPWRITE_DATABASE_ID,
    queries: [Query.limit(1)],
    total: false,
  });

  return response;
}
