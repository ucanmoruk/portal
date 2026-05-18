import { promises as fs } from "fs";
import path from "path";

export interface EurolabMethod {
    id: number;
    method_code: string;
    name: string;
    technique: string;
    matrix: string;
    personnel: string[];
    instruction?: unknown;
    validation_date: string | null;
    status: string;
}

const localDataPath = path.join(process.cwd(), "data", "eurolab_methods.local.json");
const localFallbackAllowed = process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1";

function assertLocalFallbackAllowed() {
    if (!localFallbackAllowed) {
        throw new Error("Eurolab veritabanı bağlantısı eksik. Canlı ortamda EUROLAB_POSTGRES_URL veya POSTGRES_URL tanımlanmalı; local JSON fallback yalnızca geliştirme ortamında kullanılabilir.");
    }
}

const seedMethods: EurolabMethod[] = [
    {
        id: 1,
        method_code: "M001",
        name: "HPLC ile Kahvede Kafein Tayini",
        technique: "HPLC-UV",
        matrix: "Gıda",
        personnel: ["Ayşe Demir"],
        validation_date: "2023-03-15",
        status: "Active",
    },
    {
        id: 2,
        method_code: "M002",
        name: "Süt ve Süt Ürünlerinde Aflatoksin M1",
        technique: "HPLC-FLD",
        matrix: "Gıda",
        personnel: ["Mehmet Kaya"],
        validation_date: "2023-06-20",
        status: "Active",
    },
    {
        id: 3,
        method_code: "M003",
        name: "İçme Sularında Ağır Metal Analizi",
        technique: "ICP-MS",
        matrix: "Su",
        personnel: ["Canan Çelik"],
        validation_date: "2023-09-10",
        status: "Pending",
    },
    {
        id: 4,
        method_code: "M004",
        name: "Balda Pestisit Kalıntısı",
        technique: "GC-MS/MS",
        matrix: "Gıda",
        personnel: ["Ayşe Demir", "Burak Yıldız"],
        validation_date: "2023-11-05",
        status: "Active",
    },
];

async function ensureLocalDataFile() {
    assertLocalFallbackAllowed();
    await fs.mkdir(path.dirname(localDataPath), { recursive: true });
    try {
        await fs.access(localDataPath);
    } catch {
        await fs.writeFile(localDataPath, JSON.stringify(seedMethods, null, 2), "utf8");
    }
}

async function readLocalMethods() {
    await ensureLocalDataFile();
    const raw = await fs.readFile(localDataPath, "utf8");
    return JSON.parse(raw) as EurolabMethod[];
}

async function writeLocalMethods(methods: EurolabMethod[]) {
    await fs.writeFile(localDataPath, JSON.stringify(methods, null, 2), "utf8");
}

export async function listLocalMethods(search = "") {
    const term = search.trim().toLocaleLowerCase("tr-TR");
    const methods = await readLocalMethods();
    return methods
        .filter(m => m.status === "Active")
        .filter(m => !term || [m.method_code, m.name, m.technique, m.matrix].some(v => v.toLocaleLowerCase("tr-TR").includes(term)))
        .sort((a, b) => a.method_code.localeCompare(b.method_code, "tr-TR"));
}

export async function getLocalMethod(id: string | number) {
    const methods = await readLocalMethods();
    return methods.find(m => m.id === Number(id));
}

export async function createLocalMethod(input: Partial<EurolabMethod>) {
    const methods = await readLocalMethods();
    const nextId = Math.max(0, ...methods.map(m => m.id)) + 1;
    const method: EurolabMethod = {
        id: nextId,
        method_code: input.method_code || "",
        name: input.name || "",
        technique: input.technique || "",
        matrix: input.matrix || "",
        personnel: Array.isArray(input.personnel) ? input.personnel : [],
        validation_date: input.validation_date || null,
        status: "Active",
    };
    methods.push(method);
    await writeLocalMethods(methods);
    return method;
}

export async function upsertLocalMethods(inputs: Array<Partial<EurolabMethod>>) {
    const methods = await readLocalMethods();
    let imported = 0;

    inputs.forEach(input => {
        const methodCode = String(input.method_code || "").trim();
        const name = String(input.name || "").trim();
        if (!methodCode || !name) return;

        const index = methods.findIndex(method => method.method_code.toLocaleLowerCase("tr-TR") === methodCode.toLocaleLowerCase("tr-TR"));
        const nextMethod: EurolabMethod = {
            id: index >= 0 ? methods[index].id : Math.max(0, ...methods.map(method => method.id)) + 1,
            method_code: methodCode,
            name,
            technique: input.technique || "",
            matrix: input.matrix || "",
            personnel: Array.isArray(input.personnel) ? input.personnel : [],
            validation_date: input.validation_date || null,
            status: "Active",
            instruction: index >= 0 ? methods[index].instruction : undefined,
        };

        if (index >= 0) {
            methods[index] = { ...methods[index], ...nextMethod };
        } else {
            methods.push(nextMethod);
        }
        imported += 1;
    });

    await writeLocalMethods(methods);
    return { imported };
}

export async function updateLocalMethod(id: string | number, input: Partial<EurolabMethod>) {
    const methods = await readLocalMethods();
    const index = methods.findIndex(m => m.id === Number(id));
    if (index === -1) return undefined;
    methods[index] = {
        ...methods[index],
        ...input,
        personnel: Array.isArray(input.personnel) ? input.personnel : methods[index].personnel,
        validation_date: input.validation_date === undefined ? methods[index].validation_date : input.validation_date,
    };
    await writeLocalMethods(methods);
    return methods[index];
}

export async function deactivateLocalMethod(id: string | number) {
    return updateLocalMethod(id, { status: "Passive" });
}
