import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppwriteException, Client, Teams } from "node-appwrite";

type EnvMap = Record<string, string>;

type TeamSpec = {
  teamId: string;
  name: string;
  roles: string[];
};

const teamSpecs: TeamSpec[] = [
  {
    teamId: "staff",
    name: "staff",
    roles: ["administrador", "cajero", "academico"],
  },
  {
    teamId: "docentes",
    name: "docentes",
    roles: ["docente"],
  },
];

const env = {
  ...loadEnv(".env.local"),
  ...process.env,
};

const endpoint = requiredEnv("APPWRITE_ENDPOINT");
const projectId = requiredEnv("APPWRITE_PROJECT_ID");
const apiKey = requiredEnv("APPWRITE_API_KEY");

const client = new Client()
  .setEndpoint(endpoint)
  .setProject(projectId)
  .setKey(apiKey);

const teams = new Teams(client);

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

async function main() {
  for (const spec of teamSpecs) {
    await ensureTeam(spec);
  }

  console.log("Teams de Appwrite verificados correctamente.");
}

async function ensureTeam(spec: TeamSpec) {
  try {
    await teams.create({
      teamId: spec.teamId,
      name: spec.name,
      roles: spec.roles,
    });

    console.log(`Team creado: ${spec.teamId}`);
    return;
  } catch (error) {
    if (!isAppwriteError(error, 409)) {
      throw error;
    }
  }

  const existing = await teams.get({ teamId: spec.teamId });

  if (existing.name !== spec.name) {
    await teams.updateName({
      teamId: spec.teamId,
      name: spec.name,
    });
    console.log(`Team actualizado: ${spec.teamId}`);
    return;
  }

  console.log(`Team existente: ${spec.teamId}`);
}

function loadEnv(filePath: string): EnvMap {
  const absolutePath = resolve(process.cwd(), filePath);

  if (!existsSync(absolutePath)) {
    return {};
  }

  const values: EnvMap = {};
  const text = readFileSync(absolutePath, "utf8");

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function requiredEnv(key: string) {
  const value = env[key];

  if (!value) {
    throw new Error(`Falta la variable de entorno requerida: ${key}`);
  }

  return value;
}

function isAppwriteError(error: unknown, code: number) {
  if (error instanceof AppwriteException) {
    return error.code === code;
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    Number((error as { code: unknown }).code) === code
  );
}
