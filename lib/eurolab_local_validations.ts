import { promises as fs } from "fs";
import path from "path";
import { getLocalMethod } from "@/lib/eurolab_local_methods";

export interface EurolabValidation {
    id: number;
    code: string;
    title: string;
    method_id: number;
    method_code: string;
    method_name: string;
    technique: string;
    study_type: string;
    status: string;
    planned_start_date: string | null;
    planned_end_date: string | null;
    study_date: string;
    config: any;
}

const localDataPath = path.join(process.cwd(), "data", "eurolab_validations.local.json");

const today = () => new Date().toISOString().slice(0, 10);

async function ensureLocalDataFile() {
    await fs.mkdir(path.dirname(localDataPath), { recursive: true });
    try {
        await fs.access(localDataPath);
    } catch {
        await fs.writeFile(localDataPath, "[]", "utf8");
    }
}

async function readLocalValidations() {
    await ensureLocalDataFile();
    const raw = await fs.readFile(localDataPath, "utf8");
    return JSON.parse(raw) as EurolabValidation[];
}

async function writeLocalValidations(validations: EurolabValidation[]) {
    await fs.writeFile(localDataPath, JSON.stringify(validations, null, 2), "utf8");
}

export async function listLocalValidations() {
    const validations = await readLocalValidations();
    return validations.sort((a, b) => {
        const aDate = a.planned_start_date || a.study_date || "";
        const bDate = b.planned_start_date || b.study_date || "";
        return bDate.localeCompare(aDate) || b.id - a.id;
    });
}

export async function getLocalValidation(id: string | number) {
    const validations = await readLocalValidations();
    return validations.find(v => v.id === Number(id) || v.code === String(id));
}

export async function createLocalValidation(input: {
    method_id: number;
    study_type: string;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    config?: any;
}) {
    const validations = await readLocalValidations();
    const method = await getLocalMethod(input.method_id);
    if (!method) throw new Error("Seçilen metot bulunamadı.");

    const nextId = Math.max(0, ...validations.map(v => v.id)) + 1;
    const code = `VAL-${new Date().getFullYear()}-${String(nextId).padStart(3, "0")}`;
    const validation: EurolabValidation = {
        id: nextId,
        code,
        title: `${method.name} Validasyonu`,
        method_id: method.id,
        method_code: method.method_code,
        method_name: method.name,
        technique: method.technique,
        study_type: input.study_type,
        status: "NEW",
        planned_start_date: input.planned_start_date || null,
        planned_end_date: input.planned_end_date || null,
        study_date: today(),
        config: input.config || {},
    };

    validations.push(validation);
    await writeLocalValidations(validations);
    return validation;
}

export async function updateLocalValidationStatus(id: string | number, status: string) {
    const validations = await readLocalValidations();
    const index = validations.findIndex(v => v.id === Number(id) || v.code === String(id));
    if (index === -1) return null;

    validations[index] = {
        ...validations[index],
        status,
    };
    await writeLocalValidations(validations);
    return validations[index];
}

export async function updateLocalValidation(id: string | number, input: {
    method_id?: number;
    study_type?: string;
    status?: string;
    planned_start_date?: string | null;
    planned_end_date?: string | null;
    config?: any;
}) {
    const validations = await readLocalValidations();
    const index = validations.findIndex(v => v.id === Number(id) || v.code === String(id));
    if (index === -1) return null;

    let methodPatch: Partial<EurolabValidation> = {};
    if (input.method_id) {
        const method = await getLocalMethod(input.method_id);
        if (!method) throw new Error("Seçilen metot bulunamadı.");
        methodPatch = {
            method_id: method.id,
            method_code: method.method_code,
            method_name: method.name,
            technique: method.technique,
            title: `${method.name} Validasyonu`,
        };
    }

    validations[index] = {
        ...validations[index],
        ...methodPatch,
        study_type: input.study_type ?? validations[index].study_type,
        status: input.status ?? validations[index].status,
        planned_start_date: input.planned_start_date ?? validations[index].planned_start_date,
        planned_end_date: input.planned_end_date ?? validations[index].planned_end_date,
        config: input.config ?? validations[index].config,
    };
    await writeLocalValidations(validations);
    return validations[index];
}
