import { NextResponse } from "next/server";
import { findPublicStudentByDocument } from "@/lib/public-student-payments";

function jsonError(error, status = 400) {
  return NextResponse.json({ error, ok: false }, { status });
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await findPublicStudentByDocument(
      searchParams.get("documento"),
    );

    if (!result.ok) {
      return jsonError(result.error);
    }

    return NextResponse.json(result);
  } catch (error) {
    return jsonError(error?.message || "No se pudo buscar el estudiante.");
  }
}
