import { NextResponse } from "next/server";
import { getPaymentLinkData } from "@/lib/payment-link-data";

function jsonError(error, status = 400) {
  return NextResponse.json({ error, ok: false }, { status });
}

export async function GET(_request, { params }) {
  try {
    const { token } = await params;
    const result = await getPaymentLinkData(token);

    if (!result.ok) {
      return jsonError(result.error);
    }

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error?.message || "No se pudo leer el enlace de pago.");
  }
}
