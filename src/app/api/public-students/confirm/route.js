import { NextResponse } from "next/server";
import { confirmPublicStudentPayment } from "@/lib/public-student-payments";

function jsonError(error, status = 400) {
  return NextResponse.json({ error, ok: false }, { status });
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const result = await confirmPublicStudentPayment(
      payload.paymentId,
      payload.qrId,
    );

    if (!result.ok) {
      return jsonError(result.error);
    }

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error?.message || "No se pudo confirmar el pago.");
  }
}
