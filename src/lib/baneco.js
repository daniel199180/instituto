import "server-only";

import http from "node:http";
import https from "node:https";
import { getConfiguredBanecoSettings } from "@/lib/baneco-settings";

const PRODUCTION_BASE_URL = "https://apimkt.baneco.com.bo/ApiGateway";
const TOKEN_TTL_MS = 25 * 60 * 1000;

const tokenCache = new Map();
const encryptedAccountCache = new Map();

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(operation, attempts = 3) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt === attempts - 1) break;

      await wait(500 * 2 ** attempt);
    }
  }

  throw lastError;
}

function banecoBaseUrl(settings) {
  return (settings.baseUrl || PRODUCTION_BASE_URL).replace(/\/+$/, "");
}

function settingsCacheKey(settings) {
  return [
    banecoBaseUrl(settings),
    settings.environment,
    settings.username,
    settings.accountCredit,
    settings.currency,
  ].join("|");
}

function assertSuccess(response, fallback) {
  if (response.responseCode !== 0) {
    throw new Error(response.message || fallback);
  }
}

async function readJson(response, fallback) {
  const text = await response.text();
  let payload;

  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text || fallback);
  }

  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? String(payload.message || fallback)
        : fallback;
    throw new Error(message);
  }

  return payload;
}

function requestJsonWithGetBody({ body, fallback, headers, url }) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const bodyText = JSON.stringify(body);
    const transport = parsedUrl.protocol === "http:" ? http : https;
    const request = transport.request(
      parsedUrl,
      {
        headers: {
          ...headers,
          "Content-Length": String(Buffer.byteLength(bodyText)),
        },
        method: "GET",
      },
      (response) => {
        let text = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          let payload;

          try {
            payload = text ? JSON.parse(text) : {};
          } catch {
            reject(new Error(text || fallback));
            return;
          }

          if (
            !response.statusCode ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            const message =
              typeof payload === "object" && payload && "message" in payload
                ? String(payload.message || fallback)
                : fallback;
            reject(new Error(message));
            return;
          }

          resolve(payload);
        });
      },
    );

    request.on("error", reject);
    request.write(bodyText);
    request.end();
  });
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Falta configurar ${name} para Banco Económico.`);
  }

  return value;
}

function getEnvBanecoSettings() {
  return {
    accountCredit: requiredEnv("BANECO_ACCOUNT_CREDIT"),
    aesKey: requiredEnv("BANECO_AES_KEY"),
    baseUrl: "",
    currency: "BOB",
    environment: "production",
    password: requiredEnv("BANECO_PASSWORD"),
    qrExpirationDays: 1,
    username: requiredEnv("BANECO_USERNAME"),
  };
}

export async function getBanecoSettings() {
  const configuredSettings = await getConfiguredBanecoSettings();

  if (configuredSettings) {
    return configuredSettings;
  }

  return getEnvBanecoSettings();
}

async function banecoEncrypt(settings, text) {
  const url = new URL(`${banecoBaseUrl(settings)}/api/authentication/encrypt`);
  url.searchParams.set("text", text);
  url.searchParams.set("aesKey", settings.aesKey);

  const response = await withRetry(() =>
    fetch(url, { cache: "no-store", method: "GET" }),
  );

  if (!response.ok) {
    throw new Error("No se pudo cifrar datos para Banco Económico.");
  }

  const body = (await response.text()).trim();

  try {
    const parsed = JSON.parse(body);
    if (typeof parsed === "string") return parsed.trim();
  } catch {
    return body;
  }

  return body;
}

async function authenticate(settings) {
  const cacheKey = settingsCacheKey(settings);
  const cachedToken = tokenCache.get(cacheKey);

  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const encryptedPassword = await banecoEncrypt(settings, settings.password);
  const response = await withRetry(() =>
    fetch(`${banecoBaseUrl(settings)}/api/authentication/authenticate`, {
      body: JSON.stringify({
        password: encryptedPassword,
        userName: settings.username,
      }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const payload = await readJson(
    response,
    "No se pudo autenticar con Banco Económico.",
  );

  assertSuccess(payload, "Credenciales de Banco Económico inválidas.");

  if (!payload.token) {
    throw new Error("Banco Económico no devolvió token de autenticación.");
  }

  tokenCache.set(cacheKey, {
    expiresAt: Date.now() + TOKEN_TTL_MS,
    token: payload.token,
  });

  return payload.token;
}

async function encryptedAccountCredit(settings) {
  const cacheKey = settingsCacheKey(settings);
  const cachedAccount = encryptedAccountCache.get(cacheKey);

  if (cachedAccount) return cachedAccount;

  const encryptedAccount = await banecoEncrypt(settings, settings.accountCredit);
  encryptedAccountCache.set(cacheKey, encryptedAccount);

  return encryptedAccount;
}

function dueDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + Math.max(1, Math.min(30, days)));
  return date.toISOString().slice(0, 10);
}

export async function generateBanecoQr({ amount, description, transactionId }) {
  const settings = await getBanecoSettings();
  const [token, encryptedAccount] = await Promise.all([
    authenticate(settings),
    encryptedAccountCredit(settings),
  ]);
  const response = await withRetry(() =>
    fetch(`${banecoBaseUrl(settings)}/api/qrsimple/generateQR`, {
      body: JSON.stringify({
        accountCredit: encryptedAccount,
        amount: Number(amount.toFixed(2)),
        currency: settings.currency,
        description: description.slice(0, 120),
        dueDate: dueDate(settings.qrExpirationDays),
        modifyAmount: false,
        singleUse: true,
        transactionId,
      }),
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
  );
  const payload = await readJson(response, "No se pudo generar el QR.");

  assertSuccess(payload, "Banco Económico rechazó la generación del QR.");

  if (!payload.qrId || !payload.qrImage) {
    throw new Error("Banco Económico no devolvió la imagen del QR.");
  }

  return {
    qrId: payload.qrId,
    qrImage: payload.qrImage,
  };
}

export async function getBanecoQrStatus(qrId) {
  const settings = await getBanecoSettings();
  const token = await authenticate(settings);
  const payload = await withRetry(() =>
    requestJsonWithGetBody({
      body: { qrId },
      fallback: "No se pudo verificar el estado del QR.",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      url: `${banecoBaseUrl(settings)}/api/qrsimple/statusQR`,
    }),
  );

  assertSuccess(payload, "Banco Económico rechazó la consulta del QR.");

  return {
    payment: payload.payment,
    statusCode: payload.statusQRCode ?? payload.statusQrCode ?? 0,
  };
}

export async function validateBanecoConnection(settingsOverride = null) {
  const settings = settingsOverride || (await getBanecoSettings());

  await authenticate(settings);
  await encryptedAccountCredit(settings);

  return { connected: true };
}
