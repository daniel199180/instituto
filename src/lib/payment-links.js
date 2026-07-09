import crypto from "node:crypto";

const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function getSecret() {
  const secret =
    process.env.PAYMENT_LINK_SECRET ||
    process.env.PAYMENT_CREDENTIALS_SECRET ||
    process.env.APPWRITE_API_KEY;

  if (!secret) {
    throw new Error("Falta PAYMENT_LINK_SECRET para generar enlaces de pago.");
  }

  return secret;
}

function signPayload(encodedPayload) {
  return crypto
    .createHmac("sha256", getSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createPaymentLinkToken({ amount, id, type }) {
  const cleanId = typeof id === "string" ? id.trim() : "";
  const cleanType = type === "enrollment" ? "enrollment" : "payment";
  const parsedAmount = Number(amount);

  if (!cleanId) {
    throw new Error("No se encontró el recurso para generar el enlace.");
  }

  const payload = {
    exp: Date.now() + LINK_TTL_MS,
    id: cleanId,
    iat: Date.now(),
    type: cleanType,
    v: 1,
  };

  if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
    payload.amount = Number(parsedAmount.toFixed(2));
  }

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

export function parsePaymentLinkToken(token) {
  const cleanToken = typeof token === "string" ? token.trim() : "";
  const [encodedPayload, signature] = cleanToken.split(".");

  if (!encodedPayload || !signature) {
    throw new Error("El enlace de pago no es válido.");
  }

  const expectedSignature = signPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    throw new Error("El enlace de pago no es válido.");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  const type = payload.type === "enrollment" ? "enrollment" : "payment";
  const id = typeof payload.id === "string" ? payload.id.trim() : "";

  if (!id) {
    throw new Error("El enlace de pago no es válido.");
  }

  const expiresAt = Number(payload.exp) || Number(payload.iat) + LINK_TTL_MS;

  if (Date.now() > expiresAt) {
    throw new Error("El enlace de pago expiró. Genera uno nuevo.");
  }

  const amount = Number(payload.amount);

  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : null,
    id,
    type,
  };
}
