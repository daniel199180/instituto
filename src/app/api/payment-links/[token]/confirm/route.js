import { NextResponse } from "next/server";
import { confirmPaymentLink } from "@/lib/payment-link-data";

function jsonError(error, status = 400) {
  return NextResponse.json({ error, ok: false }, { status });
}

export async function POST(request, { params }) {
  try {
    const { token } = await params;
    const payload = await request.json().catch(() => ({}));
    const result = await confirmPaymentLink(token, payload.qrId);

    if (!result.ok) {
      return jsonError(result.error);
    }

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error?.message || "No se pudo confirmar el pago.");
  }
}
