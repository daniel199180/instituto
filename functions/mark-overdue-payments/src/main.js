import { Client, Databases, Query } from "node-appwrite";

const PAYMENTS_COLLECTION_ID = "payments";

function getEnv(name, fallback = "") {
  return process.env[name] || fallback;
}

function getBusinessTodayStart() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).formatToParts(new Date());
  const partMap = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );

  return new Date(
    Date.UTC(
      Number(partMap.year),
      Number(partMap.month) - 1,
      Number(partMap.day),
      4,
      0,
      0,
      0,
    ),
  ).toISOString();
}

async function listPendingOverduePayments(databases, databaseId, todayStart) {
  const documents = [];
  let cursor = null;

  do {
    const queries = [
      Query.equal("estado", "pendiente"),
      Query.lessThan("fechaVencimiento", todayStart),
      Query.limit(100),
      Query.select(["$id", "estado", "fechaVencimiento"]),
    ];

    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    }

    const response = await databases.listDocuments({
      collectionId: PAYMENTS_COLLECTION_ID,
      databaseId,
      queries,
    });

    documents.push(...response.documents);
    cursor = response.documents.at(-1)?.$id || null;

    if (response.documents.length < 100) {
      cursor = null;
    }
  } while (cursor);

  return documents;
}

export default async ({ req, res, log, error }) => {
  const endpoint = getEnv(
    "APPWRITE_ENDPOINT",
    getEnv("APPWRITE_FUNCTION_API_ENDPOINT"),
  );
  const projectId = getEnv(
    "APPWRITE_PROJECT_ID",
    getEnv("APPWRITE_FUNCTION_PROJECT_ID"),
  );
  const databaseId = getEnv("APPWRITE_DATABASE_ID", "main");
  const apiKey = getEnv(
    "APPWRITE_OVERDUE_API_KEY",
    getEnv("APPWRITE_FUNCTION_API_KEY"),
  );

  if (!endpoint || !projectId || !apiKey) {
    const message =
      "Faltan variables de Appwrite para marcar mensualidades vencidas.";
    error(message);
    return res.json({ error: message, ok: false }, 500);
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
  const databases = new Databases(client);
  const todayStart = getBusinessTodayStart();

  try {
    const payments = await listPendingOverduePayments(
      databases,
      databaseId,
      todayStart,
    );

    await Promise.all(
      payments.map((payment) =>
        databases.updateDocument({
          collectionId: PAYMENTS_COLLECTION_ID,
          databaseId,
          documentId: payment.$id,
          data: { estado: "vencido" },
        }),
      ),
    );

    log(`Mensualidades vencidas actualizadas: ${payments.length}`);

    return res.json({
      checkedBefore: todayStart,
      markedOverdue: payments.length,
      ok: true,
    });
  } catch (caughtError) {
    const message =
      caughtError?.message || "No se pudieron marcar vencimientos.";
    error(message);

    return res.json({ error: message, ok: false }, 500);
  }
};
