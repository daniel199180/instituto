"use server";

import { revalidatePath } from "next/cache";
import {
  getBanecoSettingsForValidation,
  getBanecoSettingsForForm,
  saveBanecoSettings,
} from "@/lib/baneco-settings";
import { validateBanecoConnection } from "@/lib/baneco";

function getActionError(error) {
  return error?.message || "No se pudo completar la operación.";
}

export async function getPaymentSettings() {
  try {
    const settings = await getBanecoSettingsForForm();

    return { ok: true, settings };
  } catch (error) {
    return {
      error: getActionError(error),
      ok: false,
      settings: null,
    };
  }
}

export async function updateBanecoSettings(input = {}) {
  try {
    const result = await saveBanecoSettings(input);

    if (result.ok) {
      revalidatePath("/dashboard/configuracion");
    }

    return result;
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function testBanecoConnection() {
  try {
    await validateBanecoConnection();

    return { ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}

export async function validateBanecoAccess(input = {}) {
  try {
    const settings = await getBanecoSettingsForValidation(input);

    await validateBanecoConnection(settings);

    return { ok: true };
  } catch (error) {
    return { error: getActionError(error), ok: false };
  }
}
