import "server-only";

import { createAdminFunctions } from "@/lib/appwrite-server";

const SECURE_OPERATIONS_FUNCTION_ID =
  process.env.APPWRITE_SECURE_OPERATIONS_FUNCTION_ID || "secureOperations";

function parseExecutionResponse(execution) {
  if (execution.status !== "completed") {
    return {
      error:
        execution.errors ||
        `La función segura terminó con estado ${execution.status}.`,
      ok: false,
    };
  }

  try {
    const body = JSON.parse(execution.responseBody || "{}");

    if (execution.responseStatusCode >= 400) {
      return {
        error: body.error || "La función segura no pudo completar la operación.",
        ok: false,
      };
    }

    return body;
  } catch {
    return {
      error: "La función segura devolvió una respuesta inválida.",
      ok: false,
    };
  }
}

export async function invokeSecureOperation(operation, payload = {}) {
  const functions = createAdminFunctions();
  let execution;

  try {
    execution = await functions.createExecution({
      async: false,
      body: JSON.stringify({ operation, payload }),
      functionId: SECURE_OPERATIONS_FUNCTION_ID,
      method: "POST",
    });
  } catch (error) {
    return {
      error:
        error?.message ||
        "No se pudo ejecutar la función segura en Appwrite.",
      ok: false,
      useLocalFallback: true,
    };
  }

  return parseExecutionResponse(execution);
}
