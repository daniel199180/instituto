import { NextResponse } from "next/server";
import { getBanecoQrStatus } from "@/lib/baneco";

function jsonError(error, status) {
  return NextResponse.json({ error }, { status });
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const qrId = searchParams.get("qrId")?.trim() || "";

  if (!qrId) {
    return jsonError("No se encontró el QR.", 400);
  }

  try {
    const qrStatus = await getBanecoQrStatus(qrId);

    if (qrStatus.statusCode === 1) {
      return NextResponse.json({
        payment: qrStatus.payment ?? [],
        status: "paid",
      });
    }

    if (qrStatus.statusCode === 9) {
      return NextResponse.json({ status: "cancelled" });
    }

    return NextResponse.json({ status: "pending" });
  } catch (error) {
    return jsonError(
      error?.message || "No se pudo verificar el QR de Banco Económico.",
      400,
    );
  }
}
